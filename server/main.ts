import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Attempts } from "./attempts.ts";
import { lesson } from "./lesson.ts";
import {
  assessMain,
  assessDiagnostic,
  providerStatus,
  transcribe,
} from "./providers.ts";
import {
  createAttemptSchema,
  profileSchema,
  replacementSchema,
  teacherReviewRequestSchema,
  submissionSchema,
  reviewedTranscript,
  sampleMain,
  sampleFollowups,
} from "../shared/contracts.ts";

const port = Number(process.env.PORT ?? 4173);
const hosts = [port, 5173].flatMap((p) =>
  ["127.0.0.1", "localhost", "[::1]"].map((name) => `${name}:${p}`),
);
const origins = hosts.map((host) => `http://${host}`);

export function createApp(store: Attempts = new Attempts()): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (
      !hosts.includes(req.get("host") ?? "") ||
      (origin && !origins.includes(origin))
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
  app.get("/api/bootstrap", (_req, res) =>
    res.json({
      lesson,
      learner: store.learner(),
      attempts: store
        .attempts()
        .filter((a) => a.learnerId === "you" || a.learnerId === "sample-you"),
      providers: providerStatus,
      profile: store.profile(),
    }),
  );
  app.get("/api/teacher", (_req, res) => res.json(store.teacher()));
  app.put("/api/profile", (req, res) => {
    const profile = profileSchema.parse(
      z.object({ profile: profileSchema }).parse(req.body).profile,
    );
    store.setProfile(profile);
    res.json({ profile });
  });
  app.post("/api/attempts", (req, res) => {
    const input = createAttemptSchema.parse(req.body);
    res.json(
      store.create(input.profile, input.sample, input.reviewedOpportunity),
    );
  });
  app.get("/api/attempts/:id", (req, res) =>
    res.json(store.get(id(req.params.id))),
  );
  app.post("/api/attempts/:id/sample", (req, res) => {
    const kind = answerKind.parse(
      z.object({ kind: answerKind }).parse(req.body).kind,
    );
    res.json(
      store.addAnswer(
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
      mkdirSync("data/audio", { recursive: true });
      const filename = `${audioId}.audio`,
        path = `data/audio/${filename}`;
      writeFileSync(path, req.file.buffer);
      const answer = store.addAnswer(
        id(req.params.id),
        kind,
        provenance,
        "",
        path,
        { filename: req.file.originalname, mime: req.file.mimetype },
      );
      try {
        const transcript = await transcribe(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
        );
        res.json({
          answer: store.setTranscript(answer.id, transcript),
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
    const answer = store.answer(id(req.params.id));
    if (!answer.audioPath) throw new Error("No recording saved.");
    const transcript = await transcribe(
      readFileSync(answer.audioPath),
      answer.audioMetadata?.filename ?? "recording.webm",
      answer.audioMetadata?.mime ?? "audio/webm",
    );
    res.json(store.setTranscript(answer.id, transcript));
  });
  app.patch("/api/answers/:id", (req, res) => {
    const input = replacementSchema.parse(req.body);
    res.json(store.correct(id(req.params.id), input.index, input.replacement));
  });
  app.get("/api/answers/:id/audio", (req, res) => {
    const answer = store.answer(id(req.params.id));
    if (!answer.audioPath) {
      res.status(404).end();
      return;
    }
    res
      .type(answer.audioMetadata?.mime ?? "audio/webm")
      .sendFile(resolve(answer.audioPath));
  });
  app.post("/api/attempts/:id/submit", async (req, res) => {
    const attempt = store.get(id(req.params.id)),
      input = submissionSchema.parse(req.body),
      answer = store.answer(input.answerId);
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
        store.recordMain(
          answer.id,
          await assessMain(transcript, scripted),
          transcript,
        ),
      );
    else
      res.json(
        store.recordDiagnostic(
          answer.id,
          await assessDiagnostic(transcript, answer.kind, scripted),
          transcript,
        ),
      );
  });
  app.post("/api/attempts/:id/finish", (req, res) =>
    res.json(store.finish(id(req.params.id))),
  );
  app.post("/api/attempts/:id/review", (req, res) => {
    const input = teacherReviewRequestSchema.parse(req.body);
    res.json(
      store.review(id(req.params.id), input.action, input.note, input.criteria),
    );
  });

  const rpcSchema = z.object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
  });
  const mcpTools = [
    {
      name: "get_assignment",
      description:
        "Read the canonical lesson, essential concepts, and diagnostic questions.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "list_attempts",
      description:
        "Read preserved main and diagnostic assessments. Sample evidence is labeled.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "get_teacher_evidence",
      description:
        "Read original transcripts, corrections, review audit, unique-learner concept recap, and support queue.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  ];
  app.post("/mcp", (req, res) => {
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
        result = { tools: mcpTools };
        break;
      case "tools/call": {
        const call = z
          .object({
            name: z.enum([
              "get_assignment",
              "list_attempts",
              "get_teacher_evidence",
            ]),
            arguments: z.object({}).optional(),
          })
          .parse(message.params);
        const data =
          call.name === "get_assignment"
            ? lesson
            : call.name === "list_attempts"
              ? store.attempts()
              : store.teacher();
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
