import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { Attempts, belongsTo } from "./attempts.js";
import { openStore, type RecordStore } from "./store.js";
import { lesson } from "./lesson.js";
import {
  assessMain,
  assessDiagnostic,
  providerStatus,
  transcribe,
} from "./providers.js";
import {
  createAttemptSchema,
  profileSchema,
  replacementSchema,
  teacherReviewRequestSchema,
  submissionSchema,
  reviewedTranscript,
  sampleMain,
  sampleFollowups,
} from "../shared/contracts.js";

const port = Number(process.env.PORT ?? 4173);
const hosts = [port, 5173].flatMap((p) =>
  ["127.0.0.1", "localhost", "[::1]"].map((name) => `${name}:${p}`),
);
const origins = hosts.map((host) => `http://${host}`);

const local = { id: "local:you", name: "You" };

export function createApp(
  records: RecordStore = openStore(process.env),
): express.Express {
  const store = new Attempts(records);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use((req, res, next) => {
    const origin = req.get("origin");
    const bridge =
      req.path === "/mcp" && origin?.startsWith("chrome-extension://");
    if (
      !hosts.includes(req.get("host") ?? "") ||
      (origin && !origins.includes(origin) && !bridge)
    ) {
      res.status(403).json({ error: "Local access only." });
      return;
    }
    res.set("Cache-Control", "no-store");
    next();
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });
  const answerKind = z.enum(["main", "followup-1", "followup-2"]);
  function id(value: unknown): string {
    return z.string().uuid().parse(value);
  }
  app.get("/api/bootstrap", async (_req, res) => {
    const learner = await store.signIn(local.id, local.name);
    res.json({
      lesson,
      learner,
      attempts: (await store.attempts()).filter((a) =>
        belongsTo(a, learner.id),
      ),
      providers: providerStatus,
      profile: await store.profile(),
    });
  });
  app.get("/api/teacher", async (_req, res) => res.json(await store.teacher()));
  app.put("/api/profile", async (req, res) => {
    const profile = profileSchema.parse(
      z.object({ profile: profileSchema }).parse(req.body).profile,
    );
    await store.setProfile(profile);
    res.json({ profile });
  });
  app.post("/api/attempts", async (req, res) => {
    const input = createAttemptSchema.parse(req.body);
    res.json(
      await store.create(
        local.id,
        input.profile,
        input.sample,
        input.reviewedOpportunity,
      ),
    );
  });
  app.get("/api/attempts/:id", async (req, res) =>
    res.json(await store.get(id(req.params.id))),
  );
  app.post("/api/attempts/:id/sample", async (req, res) => {
    const kind = answerKind.parse(
      z.object({ kind: answerKind }).parse(req.body).kind,
    );
    res.json(
      await store.addAnswer(
        id(req.params.id),
        kind,
        "scripted-sample",
        kind === "main" ? sampleMain : sampleFollowups[kind],
        null,
      ),
    );
  });
  app.post(
    "/api/attempts/:id/audio",
    upload.single("audio"),
    async (req, res) => {
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
      await records.putAudio(audioId, req.file.buffer, req.file.mimetype);
      const answer = await store.addAnswer(
        id(req.params.id),
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
    const answer = await store.answer(id(req.params.id));
    const audio = answer.audioId
      ? await records.getAudio(answer.audioId)
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
    const input = replacementSchema.parse(req.body);
    res.json(
      await store.correct(id(req.params.id), input.index, input.replacement),
    );
  });
  app.get("/api/answers/:id/audio", async (req, res) => {
    const answer = await store.answer(id(req.params.id));
    const audio = answer.audioId
      ? await records.getAudio(answer.audioId)
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
    const attempt = await store.get(id(req.params.id)),
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
          await assessMain(transcript, scripted),
          transcript,
        ),
      );
    else
      res.json(
        await store.recordDiagnostic(
          answer.id,
          await assessDiagnostic(transcript, answer.kind, scripted),
          transcript,
        ),
      );
  });
  app.post("/api/attempts/:id/finish", async (req, res) =>
    res.json(await store.finish(id(req.params.id))),
  );
  app.post("/api/attempts/:id/review", async (req, res) => {
    const input = teacherReviewRequestSchema.parse(req.body);
    res.json(
      await store.review(
        id(req.params.id),
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
  const noArguments = {
    type: "object",
    properties: {},
    additionalProperties: false,
  };
  const mcpTools = new Map<
    string,
    { description: string; read: () => Promise<unknown> }
  >(
    Object.entries({
      get_assignment: {
        description:
          "Read the canonical lesson, essential concepts, and diagnostic questions.",
        read: async () => lesson,
      },
      get_class_recap: {
        description:
          "Read per-concept counts of current gaps, resolved gaps, demonstrated and unassessed learners. Contains no learner names. Counts include labeled sample learners.",
        read: async () => {
          const { learners, recap } = await store.teacher();
          return {
            learners: learners.length,
            sampleLearners: learners.filter((l) => l.sample).length,
            concepts: recap.map((row) => ({
              concept: row.title,
              currentGaps: row.gaps.length,
              resolved: row.resolved.length,
              demonstrated: row.demonstrated.length,
              unassessed: row.unassessed.length,
            })),
          };
        },
      },
      list_attempts: {
        description:
          "Read preserved main and diagnostic assessments. Sample evidence is labeled.",
        read: () => store.attempts(),
      },
      get_teacher_evidence: {
        description:
          "Read original transcripts, corrections, review audit, unique-learner concept recap, and support queue.",
        read: () => store.teacher(),
      },
    }),
  );
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
            "Local prototype. Sample records are illustrative. Teacher review retains final judgment.",
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
            inputSchema: noArguments,
          })),
        };
        break;
      case "tools/call": {
        const call = z
          .object({
            name: z.string(),
            arguments: z.object({}).optional(),
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
        const data = await tool.read();
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
  if (process.env.NODE_ENV === "production") {
    app.use(express.static("dist"));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve("dist/index.html")),
    );
  }
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message =
        error instanceof z.ZodError
          ? "The request or provider response did not match the expected format. No conceptual result was recorded."
          : error instanceof Error
            ? error.message
            : "The request failed.";
      res.status(400).json({ error: message });
    },
  );
  return app;
}
if (import.meta.main)
  createApp().listen(port, "127.0.0.1", () =>
    process.stdout.write(`Feyn API listening at http://127.0.0.1:${port}\n`),
  );
