import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { Attempts } from "../server/attempts.js";
import { deriveOutcome } from "../server/providers.js";
import { lesson } from "../server/lesson.js";
import { MemoryStore, MongoStore, type RecordStore } from "../server/store.js";
import type {
  DiagnosticAssessment,
  MainAssessment,
} from "../shared/contracts.js";

const transcript =
  "Distance is position. Speed is the rate of change. At three seconds the instantaneous speed is six meters per second.";
const criteria = lesson.concepts.map((c) => ({
  id: c.id,
  state: "demonstrated" as const,
  quote: transcript,
  reason: "Evidence checked against the lesson.",
}));
const pass: MainAssessment = {
  kind: "main",
  criteria,
  outcome: deriveOutcome(criteria, false),
  majorError: false,
  summary: "Assessment",
  provider: "Test fixture",
  model: "fixture",
  at: "2026-10-15T12:00:00.000Z",
};
const wrong: DiagnosticAssessment = {
  kind: "diagnostic",
  outcome: "incorrect",
  quote: "Yes, seven.",
  reason: "Application reasoning",
  observations: [],
  provider: "Test fixture",
  model: "fixture",
  at: "2026-10-15T12:05:00.000Z",
};

async function lessonFlow(records: () => RecordStore) {
  const store = new Attempts(records());
  const learner = await store.signIn("google:ada", "Ada Lovelace");
  const attempt = await store.create(learner.id, "curious", false, false);
  const bytes = Buffer.from("original recording bytes");
  await records().putAudio("rec-1", bytes, "audio/wav");
  const answer = await store.addAnswer(
    attempt.id,
    "main",
    "microphone",
    transcript,
    "rec-1",
    { filename: "a.wav", mime: "audio/wav" },
  );
  await store.recordMain(answer.id, pass, transcript);
  const stale = await store.addAnswer(
    attempt.id,
    "followup-1",
    "microphone",
    "Yes, seven.",
    null,
  );
  const current = await store.addAnswer(
    attempt.id,
    "followup-1",
    "microphone",
    "Yes, seven.",
    null,
  );
  await assert.rejects(
    store.recordDiagnostic(stale.id, wrong, "Yes, seven."),
    /replaced/,
  );
  await store.recordDiagnostic(current.id, wrong, "Yes, seven.");
  await store.finish(attempt.id);
  await store.signIn("google:ada", "Ada L.");

  const reopened = new Attempts(records());
  const teacher = await reopened.teacher();
  const ada = teacher.learners.find((l) => l.id === learner.id);
  assert.equal(ada?.name, "Ada L.");
  assert.ok(ada?.completedAt, "completion survives a renamed sign-in");
  assert.equal(
    teacher.attempts.filter((a) => a.learnerId === "sample-eli").length,
    2,
    "sample classmates are seeded once per database",
  );
  assert.ok(
    teacher.recap
      .find((c) => c.id === "average-instantaneous")
      ?.demonstrated.includes(learner.id),
  );
  const saved = await records().getAudio("rec-1");
  assert.equal(saved?.mime, "audio/wav");
  assert.ok(saved?.bytes.equals(bytes), "original audio bytes round trip");
  assert.equal(await records().getAudio("missing"), null);
}

test("lesson flow persists through the in-memory store", async () => {
  const memory = new MemoryStore();
  await lessonFlow(() => memory);
});

const mongoUri = process.env.MONGODB_TEST_URI;
test(
  "lesson flow persists through MongoDB",
  { skip: mongoUri ? false : "set MONGODB_TEST_URI to run" },
  async () => {
    if (!mongoUri) return;
    const dbName = `feyn_test_${randomUUID().slice(0, 8)}`;
    const store = new MongoStore(mongoUri, dbName);
    try {
      await lessonFlow(() => new MongoStore(mongoUri, dbName));
    } finally {
      await store.close();
      const admin = await MongoClient.connect(mongoUri);
      await admin.db(dbName).dropDatabase();
      await admin.close();
    }
  },
);
