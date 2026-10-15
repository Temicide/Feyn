import test from "node:test";
import assert from "node:assert/strict";
import type { Attempts } from "../server/attempts.js";
import { deriveOutcome } from "../server/providers.js";
import type { Criterion, MainAssessment } from "../shared/contracts.js";
import { isComplete } from "../shared/work-status.js";
import { assignment, rubric, workspace } from "./support.js";

const you = "google:you";
const transcript =
  "Distance is position. Speed is the rate of change. Average is over an interval, instantaneous at one moment.";

function criteria(state: Criterion["state"]): Criterion[] {
  return rubric.concepts.map((c) => ({
    id: c.id,
    state,
    quote: state === "missing" ? "" : transcript,
    reason: "Checked against the lesson.",
  }));
}
function assessment(state: Criterion["state"], at: string): MainAssessment {
  const list = criteria(state);
  return {
    kind: "main",
    criteria: list,
    outcome: deriveOutcome(list, false),
    majorError: false,
    summary: "Assessment",
    provider: "Test fixture",
    model: "fixture",
    at,
  };
}
async function setup() {
  const { store, courses } = workspace();
  await store.signIn(you, "You");
  await courses.join(you, "FEYN01");
  return store;
}
async function turnIn(
  store: Attempts,
  state: Criterion["state"],
  at = "2026-10-15T12:00:00.000Z",
  sample = false,
) {
  const attempt = await store.create(you, assignment.id, sample, false);
  const answer = await store.addAnswer(
    attempt.id,
    "main",
    sample ? "scripted-sample" : "microphone",
    transcript,
    null,
  );
  return store.recordMain(answer.id, assessment(state, at), transcript);
}
const status = (store: Attempts) => store.workStatus(you, assignment.id);
const complete = async (store: Attempts) => isComplete(await status(store));

test("nothing turned in has no work status and is not complete", async () => {
  const store = await setup();
  assert.deepEqual(await status(store), { kind: "none" });
  assert.equal(await complete(store), false);
});

test("a bot pass waits for review and already counts as complete", async () => {
  const store = await setup();
  const attempt = await turnIn(store, "demonstrated");
  assert.deepEqual(await status(store), {
    kind: "waiting",
    reason: "pip-passed",
    attemptId: attempt.id,
    turnedInAt: "2026-10-15T12:00:00.000Z",
    canRequestReview: false,
  });
  assert.equal(await complete(store), true);
});

test("a bot needs-work is not approved by Pip, may be sent to the teacher, and is not complete", async () => {
  const store = await setup();
  const attempt = await turnIn(store, "missing");
  assert.deepEqual(await status(store), {
    kind: "not-approved",
    by: "pip",
    attemptId: attempt.id,
    turnedInAt: "2026-10-15T12:00:00.000Z",
    canRequestReview: true,
  });
  assert.equal(await complete(store), false);
});

test("a review request moves the work to waiting without granting completion", async () => {
  const store = await setup();
  const attempt = await turnIn(store, "missing");
  const asked = await store.requestReview(attempt.id, "  I said it in my own words.  ");
  assert.equal(asked.reviewRequest?.note, "I said it in my own words.");
  assert.deepEqual(await status(store), {
    kind: "waiting",
    reason: "requested",
    attemptId: attempt.id,
    turnedInAt: "2026-10-15T12:00:00.000Z",
    canRequestReview: false,
  });
  assert.equal(await complete(store), false);
  await assert.rejects(store.requestReview(attempt.id, ""), /already asked/);
});

test("a teacher approving a requested attempt makes it approved and complete", async () => {
  const store = await setup();
  const attempt = await turnIn(store, "missing");
  await store.requestReview(attempt.id, "");
  await store.review(attempt.id, "correct", "This is right.", criteria("demonstrated"));
  const result = await status(store);
  assert.equal(result.kind, "approved");
  assert.equal(await complete(store), true);
});

test("a teacher correcting the only passing attempt removes completion (ADR 0008)", async () => {
  const store = await setup();
  const attempt = await turnIn(store, "demonstrated");
  await store.review(attempt.id, "correct", "Not quite.", criteria("missing"));
  assert.deepEqual(await status(store), {
    kind: "not-approved",
    by: "teacher",
    attemptId: attempt.id,
    turnedInAt: "2026-10-15T12:00:00.000Z",
    canRequestReview: false,
  });
  assert.equal(await complete(store), false);
});

test("a teacher accepting a bot pass confirms it as approved", async () => {
  const store = await setup();
  const attempt = await turnIn(store, "demonstrated");
  await store.review(attempt.id, "accept", "Agreed.", criteria("demonstrated"));
  assert.equal((await status(store)).kind, "approved");
});

test("a correction on one of two passing attempts leaves the work complete", async () => {
  const store = await setup();
  const first = await turnIn(store, "demonstrated", "2026-10-15T12:00:00.000Z");
  const second = await turnIn(store, "demonstrated", "2026-10-15T13:00:00.000Z");
  await store.review(first.id, "correct", "Not quite.", criteria("missing"));
  assert.deepEqual(await status(store), {
    kind: "waiting",
    reason: "pip-passed",
    attemptId: second.id,
    turnedInAt: "2026-10-15T12:00:00.000Z",
    canRequestReview: false,
  });
  assert.equal(await complete(store), true);
});

test("a weaker retry never lowers the status or removes completion", async () => {
  const store = await setup();
  const first = await turnIn(store, "demonstrated");
  await turnIn(store, "missing", "2026-10-15T13:00:00.000Z");
  const result = await status(store);
  assert.equal(result.kind === "waiting" && result.attemptId, first.id);
  assert.equal(await complete(store), true);
});

test("a stronger retry replaces a not-approved status", async () => {
  const store = await setup();
  await turnIn(store, "missing");
  const retry = await turnIn(store, "demonstrated", "2026-10-15T13:00:00.000Z");
  const result = await status(store);
  assert.equal(result.kind === "waiting" && result.attemptId, retry.id);
  assert.equal(result.kind === "waiting" && result.turnedInAt, "2026-10-15T12:00:00.000Z");
});

test("review requests are only allowed on the attempt that sets the status", async () => {
  const store = await setup();
  const weak = await turnIn(store, "missing");
  await turnIn(store, "demonstrated", "2026-10-15T13:00:00.000Z");
  await assert.rejects(store.requestReview(weak.id, ""), /sets your status|already approved|Pip already/);
  assert.equal((await store.get(weak.id)).reviewRequest, null);
});

test("review requests are refused after a teacher review and on samples", async () => {
  const store = await setup();
  const reviewed = await turnIn(store, "missing");
  await store.review(reviewed.id, "correct", "Still missing.", criteria("missing"));
  await assert.rejects(store.requestReview(reviewed.id, ""), /already checked/);

  const withSample = await setup();
  const sample = await turnIn(withSample, "missing", "2026-10-15T12:00:00.000Z", true);
  await assert.rejects(withSample.requestReview(sample.id, ""), /Sample/);
});

test("a bot pass cannot be sent for review", async () => {
  const store = await setup();
  const passed = await turnIn(store, "demonstrated");
  await assert.rejects(store.requestReview(passed.id, ""), /already approved/);
});

test("sample walkthroughs never change the work status", async () => {
  const store = await setup();
  await turnIn(store, "demonstrated", "2026-10-15T12:00:00.000Z", true);
  assert.deepEqual(await status(store), { kind: "none" });
  const real = await turnIn(store, "missing", "2026-10-15T13:00:00.000Z");
  const result = await status(store);
  assert.equal(result.kind, "not-approved");
  assert.equal(result.kind === "not-approved" && result.attemptId, real.id);
});
