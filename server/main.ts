import express from "express";
import multer from "multer";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { Attempts, belongsTo } from "./attempts.js";
import { auth, authConfig, HttpError } from "./auth.js";
import { Courses } from "./courses.js";
import { prepare, tutorialCourseId } from "./seed.js";
import { openStore, type RecordStore } from "./store.js";
import {
  classRecapCounts,
  draftRecap,
  draftRubric,
  ubotConfig,
} from "./ubot.js";
import {
  assessMain,
  assessDiagnostic,
  providerStatus,
  transcribe,
} from "./providers.js";
import {
  assignmentInputSchema,
  createAttemptSchema,
  draftRequestSchema,
  maxAudioBytes,
  maxPostImageBytes,
  maxPostImages,
  postImageMimes,
  postTextSchema,
  replacementSchema,
  teacherReviewRequestSchema,
  submissionSchema,
  reviewedTranscript,
  type Attempt,
  type TeacherView,
} from "../shared/contracts.js";

const port = Number(process.env.PORT ?? 4173);
const loopback = [port, 5173].flatMap((p) =>
  ["127.0.0.1", "localhost", "[::1]"].map((name) => `${name}:${p}`),
);

export function createApp(
  records: RecordStore = openStore(process.env),
  env: NodeJS.ProcessEnv = process.env,
): express.Express {
  const config = authConfig(env);
  const ubot = ubotConfig(env);
  let preparing: Promise<void> | null = null;
  const ready = () =>
    (preparing ??= prepare(records, [...config.teachers]).catch(
      (error: unknown) => {
        preparing = null;
        throw error;
      },
    ));
  const store = new Attempts(records, ready);
  const courses = new Courses(records, ready);
  const { router, caller, teacher } = auth(
    config,
    async (session) => {
      const isNew = !(await store.learners()).some((l) => l.id === session.sub);
      await store.signIn(session.sub, session.name);
      if (isNew) await courses.welcome(tutorialCourseId, session.sub, session.email);
    },
    (email) => courses.isTeacher(email),
  );
  const hosts = [...loopback, ...(config.origin ? [config.origin.host] : [])];
  const origins = [
    ...loopback.map((host) => `http://${host}`),
    ...(config.origin ? [config.origin.origin] : []),
  ];
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use((req, res, next) => {
    const origin = req.get("origin");
    const safe = req.method === "GET" || req.method === "HEAD";
    if (
      !hosts.includes(req.get("host") ?? "") ||
      (origin ? !origins.includes(origin) : !safe && req.path !== "/mcp")
    ) {
      res.status(403).json({ error: "This host or origin is not allowed." });
      return;
    }
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", router);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxAudioBytes, files: 1 },
  });
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxPostImageBytes, files: maxPostImages },
  });
  const imageMime = z.enum(postImageMimes, {
    error: "Pictures must be PNG, JPEG, WebP or GIF images.",
  });
  const answerKind = z.enum(["main", "followup-1", "followup-2"]);
  function id(value: unknown): string {
    return z.string().uuid().parse(value);
  }
  type Access = "write" | "read";
  async function ownAttempt(
    req: express.Request,
    attemptId: unknown,
    access: Access = "write",
  ): Promise<Attempt> {
    const session = caller(req),
      wanted = id(attemptId),
      attempt = (await store.attempts()).find((a) => a.id === wanted);
    if (!attempt) throw new HttpError(404, "Attempt not found.");
    if (belongsTo(attempt, session.sub)) {
      if (access === "write")
        await courses.takeable(
          { id: session.sub, email: session.email },
          attempt.assignmentId,
        );
      return attempt;
    }
    if (access === "read" && (await isTeacherOf(session.email, attempt)))
      return attempt;
    throw new HttpError(404, "Attempt not found.");
  }
  async function isTeacherOf(email: string, attempt: Attempt): Promise<boolean> {
    if (!(await courses.isTeacher(email))) return false;
    return courses
      .ownedAssignment(email, attempt.assignmentId)
      .then(() => true, () => false);
  }
  async function ownAnswer(
    req: express.Request,
    answerId: unknown,
    access: Access = "write",
  ) {
    caller(req);
    const wanted = id(answerId),
      answer = (await store.answers()).find((a) => a.id === wanted);
    if (!answer) throw new HttpError(404, "Recorded answer not found.");
    await ownAttempt(req, answer.attemptId, access);
    return answer;
  }
  async function teacherView(
    assignmentId: string,
    email: string,
  ): Promise<TeacherView> {
    const { assignment, course } = await courses.ownedAssignment(
      email,
      assignmentId,
    );
    return {
      ...(await store.evidence(assignment, await courses.rosterIds(course.id))),
      ubot: Boolean(ubot),
      assignment,
      course: { id: course.id, title: course.title },
    };
  }
  const emailBody = z.object({ email: z.string().trim().email() });
  app.get("/api/courses", async (req, res) => {
    res.json(await courses.studentCourses(caller(req).sub));
  });
  app.post("/api/courses/join", async (req, res) => {
    const session = caller(req);
    await store.signIn(session.sub, session.name);
    const { code } = z.object({ code: z.string().trim().min(1).max(20) }).parse(req.body);
    const course = await courses.join(session.sub, code);
    const joined = (await courses.studentCourses(session.sub)).find(
      (c) => c.id === course.id,
    );
    res.json(joined);
  });
  app.post("/api/courses/:id/leave", async (req, res) => {
    await courses.end(String(req.params.id), caller(req).sub);
    res.json({});
  });
  app.post("/api/courses", async (req, res) => {
    const session = await teacher(req);
    const { title } = z
      .object({ title: z.string().trim().min(1).max(120) })
      .parse(req.body);
    res.json(await courses.create(session.email, title));
  });
  app.post("/api/teachers", async (req, res) => {
    const session = await teacher(req);
    await courses.addTeacher(emailBody.parse(req.body).email, session.email);
    res.json({});
  });
  app.get("/api/teacher/courses", async (req, res) => {
    const session = await teacher(req);
    const [mine, assignments] = await Promise.all([
      courses.taughtBy(session.email),
      records.list("assignment"),
    ]);
    res.json(
      await Promise.all(
        mine.map(async (course) => ({
          id: course.id,
          title: course.title,
          joinCode: course.joinCode,
          students: (await courses.rosterIds(course.id)).length,
          posted: assignments.filter(
            (a) => a.courseId === course.id && a.state === "posted",
          ).length,
        })),
      ),
    );
  });
  app.get("/api/teacher/courses/:id", async (req, res) => {
    const session = await teacher(req);
    res.json(
      await courses.teacherCourse(
        await courses.owned(session.email, String(req.params.id)),
      ),
    );
  });
  app.post("/api/teacher/courses/:id/code", async (req, res) => {
    const session = await teacher(req);
    res.json(
      await courses.newCode(
        await courses.owned(session.email, String(req.params.id)),
      ),
    );
  });
  app.post("/api/teacher/courses/:id/remove", async (req, res) => {
    const session = await teacher(req);
    const course = await courses.owned(session.email, String(req.params.id));
    const { learnerId } = z.object({ learnerId: z.string() }).parse(req.body);
    await courses.end(course.id, learnerId);
    res.json({});
  });
  app.post("/api/teacher/courses/:id/assignments", async (req, res) => {
    const session = await teacher(req);
    res.json(
      await courses.createDraft(
        await courses.owned(session.email, String(req.params.id)),
      ),
    );
  });
  app.post(
    "/api/teacher/courses/:id/posts",
    imageUpload.array("images", maxPostImages),
    async (req, res) => {
      const session = await teacher(req);
      const course = await courses.owned(session.email, String(req.params.id));
      const text = postTextSchema.parse(req.body.text ?? ""),
        files = Array.isArray(req.files) ? req.files : [],
        mimes = files.map((file) => imageMime.parse(file.mimetype)),
        postId = randomUUID();
      const images = await Promise.all(
        files.map(async (file, index) => {
          const id = randomUUID(),
            mime = mimes[index]!;
          await records.putFile("image", id, file.buffer, mime);
          return { source: "upload" as const, id, mime };
        }),
      );
      res.json(await courses.createPost(course, postId, text, images));
    },
  );
  app.delete("/api/teacher/posts/:id", async (req, res) => {
    const session = await teacher(req);
    const post = await courses.findPost(String(req.params.id));
    await courses.owned(session.email, post.courseId);
    await courses.removePost(post);
    res.json({});
  });
  app.get("/api/posts/:id/images/:imageId", async (req, res) => {
    const session = caller(req);
    const post = await courses.findPost(String(req.params.id)),
      course = await courses.course(post.courseId),
      image = post.images.find(
        (i) => i.source === "upload" && i.id === req.params.imageId,
      ),
      file =
        image?.source === "upload" &&
        (await courses.member({ id: session.sub, email: session.email }, course))
          ? await records.getFile("image", image.id)
          : null;
    if (!file) throw new HttpError(404, "Picture not found.");
    res
      .type(file.mime)
      .set("X-Content-Type-Options", "nosniff")
      .set("Cache-Control", "private, max-age=86400")
      .send(file.bytes);
  });
  app.get("/api/teacher/assignments/:id", async (req, res) => {
    const session = await teacher(req);
    res.json(await teacherView(String(req.params.id), session.email));
  });
  app.put("/api/teacher/assignments/:id", async (req, res) => {
    const session = await teacher(req);
    const { assignment } = await courses.ownedAssignment(
      session.email,
      String(req.params.id),
    );
    res.json(
      await courses.save(assignment.id, assignmentInputSchema.parse(req.body)),
    );
  });
  app.post("/api/teacher/assignments/:id/post", async (req, res) => {
    const session = await teacher(req);
    const { assignment } = await courses.ownedAssignment(
      session.email,
      String(req.params.id),
    );
    res.json(await courses.post(assignment.id));
  });
  app.post("/api/teacher/assignments/:id/unlock", async (req, res) => {
    const session = await teacher(req);
    const { assignment } = await courses.ownedAssignment(
      session.email,
      String(req.params.id),
    );
    res.json(await courses.unlock(assignment.id));
  });
  app.post("/api/teacher/assignments/:id/draft", async (req, res) => {
    const session = await teacher(req);
    await courses.ownedAssignment(session.email, String(req.params.id));
    if (!ubot) throw new HttpError(404, "U-Bot is not configured on the server.");
    const { question, reference } = draftRequestSchema.parse(req.body);
    res.json(await draftRubric(ubot, question, reference));
  });
  app.post("/api/teacher/assignments/:id/recap-draft", async (req, res) => {
    const session = await teacher(req);
    if (!ubot) throw new HttpError(404, "U-Bot is not configured on the server.");
    const view = await teacherView(String(req.params.id), session.email);
    res.json(await draftRecap(ubot, view.assignment.question, classRecapCounts(view)));
  });
  app.get("/api/assignments/:id/bootstrap", async (req, res) => {
    const session = caller(req);
    const learner = await store.signIn(session.sub, session.name);
    const { assignment, course } = await courses.takeable(
      { id: learner.id, email: session.email },
      String(req.params.id),
    );
    res.json({
      assignment,
      courseTitle: course.title,
      learner,
      completedAt: (await store.completion(learner.id, assignment.id))?.at ?? null,
      attempts: (await store.attempts()).filter(
        (a) => a.assignmentId === assignment.id && belongsTo(a, learner.id),
      ),
      providers: providerStatus,
    });
  });
  app.post("/api/attempts", async (req, res) => {
    const session = caller(req);
    const input = createAttemptSchema.parse(req.body);
    await store.signIn(session.sub, session.name);
    await courses.takeable(
      { id: session.sub, email: session.email },
      input.assignmentId,
    );
    res.json(
      await store.create(
        session.sub,
        input.assignmentId,
        input.sample,
        input.reviewedOpportunity,
      ),
    );
  });
  app.get("/api/attempts/:id", async (req, res) =>
    res.json(await ownAttempt(req, req.params.id, "read")),
  );
  app.post("/api/attempts/:id/sample", async (req, res) => {
    const attempt = await ownAttempt(req, req.params.id);
    const kind = answerKind.parse(
      z.object({ kind: answerKind }).parse(req.body).kind,
    );
    const prepared =
      kind === "main"
        ? attempt.rubric.reference
        : attempt.rubric.followups.find((q) => q.id === kind)?.expected;
    if (!prepared) throw new Error("This assignment has no such follow-up question.");
    res.json(
      await store.addAnswer(attempt.id, kind, "scripted-sample", prepared, null),
    );
  });
  app.post(
    "/api/attempts/:id/audio",
    upload.single("audio"),
    async (req, res) => {
      const attempt = await ownAttempt(req, req.params.id);
      const kind = answerKind.parse(req.body.kind),
        provenance = z
          .enum(["microphone", "uploaded-recording"])
          .parse(req.body.provenance);
      if (!req.file) throw new Error("Choose an audio recording.");
      if (
        !/^(audio\/|video\/webm|application\/octet-stream)/.test(
          req.file.mimetype,
        )
      )
        throw new Error("Choose an audio file.");
      const audioId = randomUUID();
      await records.putFile("audio", audioId, req.file.buffer, req.file.mimetype);
      const answer = await store.addAnswer(
        attempt.id,
        kind,
        provenance,
        "",
        audioId,
        { filename: req.file.originalname, mime: req.file.mimetype },
      );
      try {
        const transcript = await transcribe(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
        );
        res.json({
          answer: await store.setTranscript(answer.id, transcript),
          error: null,
        });
      } catch (error) {
        res.json({
          answer,
          error:
            error instanceof Error
              ? error.message
              : "Transcription failed. Recording retained.",
        });
      }
    },
  );
  app.post("/api/answers/:id/transcribe", async (req, res) => {
    const answer = await ownAnswer(req, req.params.id);
    const audio = answer.audioId
      ? await records.getFile("audio", answer.audioId)
      : null;
    if (!audio) throw new Error("No recording saved.");
    const transcript = await transcribe(
      audio.bytes,
      answer.audioMetadata?.filename ?? "recording.webm",
      audio.mime,
    );
    res.json(await store.setTranscript(answer.id, transcript));
  });
  app.patch("/api/answers/:id", async (req, res) => {
    const answer = await ownAnswer(req, req.params.id);
    const input = replacementSchema.parse(req.body);
    res.json(await store.correct(answer.id, input.index, input.replacement));
  });
  app.get("/api/answers/:id/audio", async (req, res) => {
    const answer = await ownAnswer(req, req.params.id, "read");
    const audio = answer.audioId
      ? await records.getFile("audio", answer.audioId)
      : null;
    if (!audio) {
      res.status(404).end();
      return;
    }
    const range = req.range(audio.bytes.length);
    res.type(audio.mime).set("Accept-Ranges", "bytes");
    if (Array.isArray(range) && range.type === "bytes" && range[0]) {
      const { start, end } = range[0];
      res
        .status(206)
        .set("Content-Range", `bytes ${start}-${end}/${audio.bytes.length}`)
        .send(audio.bytes.subarray(start, end + 1));
      return;
    }
    res.send(audio.bytes);
  });
  app.post("/api/attempts/:id/submit", async (req, res) => {
    const attempt = await ownAttempt(req, req.params.id),
      input = submissionSchema.parse(req.body),
      answer = await store.answer(input.answerId);
    if (answer.attemptId !== attempt.id)
      throw new Error("Answer belongs to another attempt.");
    if (!answer.originalTranscript.trim())
      throw new Error(
        "No transcript available. Retry transcription or re-record.",
      );
    const transcript = reviewedTranscript(answer),
      scripted = attempt.sample && !providerStatus.assessment;
    if (answer.kind === "main")
      res.json(
        await store.recordMain(
          answer.id,
          await assessMain(transcript, scripted, attempt.rubric),
          transcript,
        ),
      );
    else
      res.json(
        await store.recordDiagnostic(
          answer.id,
          await assessDiagnostic(transcript, answer.kind, scripted, attempt.rubric),
          transcript,
        ),
      );
  });
  app.post("/api/attempts/:id/finish", async (req, res) =>
    res.json(await store.finish((await ownAttempt(req, req.params.id)).id)),
  );
  app.post("/api/attempts/:id/review", async (req, res) => {
    const session = await teacher(req);
    const input = teacherReviewRequestSchema.parse(req.body);
    const attempt = await ownAttempt(req, req.params.id, "read");
    if (!(await isTeacherOf(session.email, attempt)))
      throw new HttpError(404, "Attempt not found.");
    res.json(
      await store.review(
        attempt.id,
        input.action,
        input.note,
        input.criteria,
      ),
    );
  });

  const rpcSchema = z.object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
  });
  const idProperty = (name: string) => ({
    type: "object",
    properties: { [name]: { type: "string" } },
    required: [name],
    additionalProperties: false,
  });
  const assignmentArgs = z.object({ assignmentId: z.string() });
  async function adminEvidence(assignmentId: string) {
    const assignment = await courses.assignment(assignmentId);
    return store.evidence(assignment, await courses.rosterIds(assignment.courseId));
  }
  const mcpTools = new Map<
    string,
    {
      description: string;
      inputSchema: unknown;
      read: (args: unknown) => Promise<unknown>;
    }
  >(
    Object.entries({
      list_courses: {
        description:
          "List every course with its teacher, enrolled student count and assignments.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        read: async () => {
          const [all, assignments] = await Promise.all([
            records.list("course"),
            records.list("assignment"),
          ]);
          return Promise.all(
            all.map(async (course) => ({
              id: course.id,
              title: course.title,
              teacher: course.teacherId,
              students: (await courses.rosterIds(course.id)).length,
              assignments: assignments
                .filter((a) => a.courseId === course.id)
                .map((a) => ({ id: a.id, title: a.title, state: a.state })),
            })),
          );
        },
      },
      get_assignment: {
        description:
          "Read one assignment: its question, reference answer, essential concepts and follow-up questions.",
        inputSchema: idProperty("assignmentId"),
        read: async (args: unknown) =>
          courses.assignment(assignmentArgs.parse(args).assignmentId),
      },
      get_class_recap: {
        description:
          "Read per-concept counts of current gaps, resolved gaps, demonstrated and unassessed learners for one assignment. Contains no learner names. Counts include labeled sample learners.",
        inputSchema: idProperty("assignmentId"),
        read: async (args: unknown) =>
          classRecapCounts(await adminEvidence(assignmentArgs.parse(args).assignmentId)),
      },
      list_attempts: {
        description:
          "Read preserved main and diagnostic assessments for one course or one assignment. Sample evidence is labeled.",
        inputSchema: {
          type: "object",
          properties: {
            courseId: { type: "string" },
            assignmentId: { type: "string" },
          },
          additionalProperties: false,
        },
        read: async (args: unknown) => {
          const input = z
            .object({ courseId: z.string().optional(), assignmentId: z.string().optional() })
            .refine((v) => Boolean(v.courseId) !== Boolean(v.assignmentId), {
              message: "Give exactly one of courseId or assignmentId.",
            })
            .parse(args);
          const [attempts, assignments] = await Promise.all([
            store.attempts(),
            records.list("assignment"),
          ]);
          return attempts.filter((a) =>
            input.assignmentId
              ? a.assignmentId === input.assignmentId
              : assignments.find((x) => x.id === a.assignmentId)?.courseId ===
                input.courseId,
          );
        },
      },
      get_teacher_evidence: {
        description:
          "Read one assignment's original transcripts, corrections, review audit, unique-learner concept recap and enrolled roster.",
        inputSchema: idProperty("assignmentId"),
        read: async (args: unknown) =>
          adminEvidence(assignmentArgs.parse(args).assignmentId),
      },
    }),
  );
  app.use("/mcp", (req, res, next) => {
    if (!env.MCP_TOKEN) throw new HttpError(404, "Not found.");
    const given = Buffer.from(req.get("authorization") ?? ""),
      expected = Buffer.from(`Bearer ${env.MCP_TOKEN}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      res.set("WWW-Authenticate", "Bearer");
      throw new HttpError(401, "MCP token required.");
    }
    next();
  });
  app.post("/mcp", async (req, res) => {
    const message = rpcSchema.parse(req.body);
    if (message.id === undefined) {
      res.status(202).end();
      return;
    }
    let result: unknown;
    switch (message.method) {
      case "initialize":
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "feyn", version: "0.1.0" },
          instructions:
            "Feyn prototype. Sample records are illustrative. Teacher review retains final judgment.",
        };
        break;
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = {
          tools: [...mcpTools].map(([name, tool]) => ({
            name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        };
        break;
      case "tools/call": {
        const call = z
          .object({
            name: z.string(),
            arguments: z.record(z.string(), z.unknown()).optional(),
          })
          .parse(message.params);
        const tool = mcpTools.get(call.name);
        if (!tool) {
          res.json({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32602, message: `Unknown tool: ${call.name}` },
          });
          return;
        }
        const data = await tool.read(call.arguments ?? {});
        result = { content: [{ type: "text", text: JSON.stringify(data) }] };
        break;
      }
      default:
        res.json({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: "Method not found" },
        });
        return;
    }
    res.json({ jsonrpc: "2.0", id: message.id, result });
  });
  app.get("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
  app.use(
    (
      error: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof multer.MulterError && req.path.includes("/posts")) {
        res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
          error: `Add up to ${maxPostImages} pictures, each under 1 MB.`,
        });
        return;
      }
      if (
        error instanceof multer.MulterError &&
        error.code === "LIMIT_FILE_SIZE"
      ) {
        res.status(413).json({
          error:
            "Recordings are limited to 4 MB. Record a shorter explanation or upload a smaller file.",
        });
        return;
      }
      const message =
        error instanceof z.ZodError
          ? "The request or provider response did not match the expected format. No conceptual result was recorded."
          : error instanceof Error
            ? error.message
            : "The request failed.";
      res
        .status(error instanceof HttpError ? error.status : 400)
        .json({ error: message });
    },
  );
  return app;
}
if (import.meta.main) {
  const app = createApp();
  if (process.env.NODE_ENV === "production") {
    app.use(express.static("dist"));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve("dist/index.html")),
    );
  }
  app.listen(port, "127.0.0.1", () =>
    process.stdout.write(`Feyn API listening at http://127.0.0.1:${port}\n`),
  );
}
