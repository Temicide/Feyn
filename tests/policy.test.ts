import test from "node:test";
import assert from "node:assert/strict";
import { Attempts, projectRecap, replaceWord } from "../server/attempts.ts";
import {
  deriveOutcome,
  validateMain,
  validateDiagnostic,
} from "../server/providers.ts";
import { lesson } from "../server/lesson.ts";
import {
  reviewedTranscript,
  type MainAssessment,
  type DiagnosticAssessment,
  type Criterion,
  type Attempt,
} from "../shared/contracts.ts";

const transcript =
  "Distance is position. Speed is the rate of change. Average is over an interval, instantaneous at one moment. At three seconds the instantaneous speed is six meters per second.";
function main(
  state: Criterion["state"] = "demonstrated",
  at = "2026-10-15T12:00:00.000Z",
): MainAssessment {
  const criteria = lesson.concepts.map((c) => ({
    id: c.id,
    state,
    quote: state === "missing" ? "" : transcript,
    reason: "Evidence checked against the lesson.",
  }));
  return {
    kind: "main",
    criteria,
    outcome: deriveOutcome(criteria, false),
    majorError: false,
    summary: "Assessment",
    provider: "Test fixture",
    model: "fixture",
    at,
  };
}
function diagnostic(
  outcome: DiagnosticAssessment["outcome"],
  at = "2026-10-15T12:05:00.000Z",
): DiagnosticAssessment {
  return {
    kind: "diagnostic",
    outcome,
    quote:
      outcome === "incorrect"
        ? "Yes, seven."
        : "No, seven is the average over the whole interval.",
    reason: "Application reasoning",
    observations: [
      {
        id: "average-instantaneous",
        state: outcome === "correct" ? "demonstrated" : "contradicted",
        quote:
          outcome === "incorrect"
            ? "Yes, seven."
            : "No, seven is the average over the whole interval.",
        reason: "Application reasoning",
      },
    ],
    provider: "Test fixture",
    model: "fixture",
    at,
  };
}
function submitMain(
  store: Attempts,
  state: Criterion["state"] = "demonstrated",
  reviewed = false,
) {
  const attempt = store.create("curious", false, reviewed);
  const answer = store.addAnswer(
    attempt.id,
    "main",
    "microphone",
    transcript,
    "data/audio/original.wav",
    { filename: "original.wav", mime: "audio/wav" },
  );
  return {
    attempt: store.recordMain(answer.id, main(state), transcript),
    answer,
  };
}

test("main pass plus wrong required follow-up earns completion without changing main result", () => {
  const store = new Attempts(":memory:");
  const { attempt } = submitMain(store);
  const answer = store.addAnswer(
    attempt.id,
    "followup-1",
    "microphone",
    "Yes, seven.",
    "data/audio/followup.wav",
  );
  const result = store.recordDiagnostic(
    answer.id,
    diagnostic("incorrect"),
    "Yes, seven.",
  );
  assert.equal(result.mainAssessment?.outcome, "pass");
  assert.equal(result.diagnostics[0]?.assessment.outcome, "incorrect");
  assert.ok(store.learner().completedAt);
  assert.equal(store.finish(attempt.id).diagnostics.length, 1);
  const row = store
    .teacher()
    .recap.find((c) => c.id === "average-instantaneous");
  assert.ok(row?.gaps.includes("you"));
  assert.ok(!row?.support.includes("you"));
});
test("weaker voluntary retry updates evidence and never revokes completion", () => {
  const store = new Attempts(":memory:");
  submitMain(store);
  const earned = store.learner().completedAt;
  submitMain(store, "missing", true);
  assert.equal(store.learner().completedAt, earned);
  assert.equal(store.attempts().filter((a) => a.learnerId === "you").length, 2);
  assert.ok(store.teacher().recap.every((c) => c.gaps.includes("you")));
});
test("prepared walkthrough cannot complete the real learner or become their class evidence", () => {
  const store = new Attempts(":memory:");
  const attempt = store.create("curious", true, false);
  const answer = store.addAnswer(
    attempt.id,
    "main",
    "scripted-sample",
    transcript,
    null,
  );
  store.recordMain(answer.id, main(), transcript);
  assert.equal(store.learner().completedAt, null);
  assert.equal(store.get(attempt.id).learnerId, "sample-you");
  assert.ok(store.teacher().recap.every((c) => c.unassessed.includes("you")));
});
test("three ordered word replacements preserve originals, including repeated word position", () => {
  const store = new Attempts(":memory:");
  const attempt = store.create("curious", false, false);
  let answer = store.addAnswer(
    attempt.id,
    "main",
    "uploaded-recording",
    "At tree seconds speed is sex.",
    "data/audio/fixed.wav",
    { filename: "spoken.wav", mime: "audio/wav" },
  );
  answer = store.correct(answer.id, 1, "three");
  answer = store.correct(answer.id, 5, "six.");
  answer = store.correct(answer.id, 1, "3");
  assert.equal(reviewedTranscript(answer), "At 3 seconds speed is six.");
  assert.equal(answer.originalTranscript, "At tree seconds speed is sex.");
  assert.equal(answer.audioMetadata?.mime, "audio/wav");
  assert.deepEqual(
    answer.corrections.map((c) => [c.index, c.before, c.after]),
    [
      [1, "tree", "three"],
      [5, "sex.", "six."],
      [1, "three", "3"],
    ],
  );
  assert.throws(() => store.correct(answer.id, 0, "Now"), /three word/);
  assert.throws(
    () => replaceWord({ ...answer, corrections: [] }, 0, "Two words"),
    /one word/,
  );
});
test("provider result requires each criterion once, literal quotes, and derived pass", () => {
  const assessment = main();
  assert.equal(validateMain(assessment, transcript).criteria.length, 3);
  assert.throws(
    () =>
      validateMain(
        {
          ...assessment,
          criteria: [
            assessment.criteria[0],
            assessment.criteria[0],
            assessment.criteria[0],
          ],
        },
        transcript,
      ),
    /each required/,
  );
  assert.throws(
    () =>
      validateMain(
        {
          ...assessment,
          criteria: assessment.criteria.map((c) => ({
            ...c,
            quote: "Invented evidence",
          })),
        },
        transcript,
      ),
    /outside the transcript/,
  );
  assert.equal(deriveOutcome(main("missing").criteria, false), "needs-work");
  assert.equal(
    deriveOutcome(main("not-assessable").criteria, false),
    "not-enough-evidence",
  );
  assert.equal(deriveOutcome(main().criteria, true), "needs-work");
});
test("late assessment cannot attach to changed words or a replaced recording", () => {
  const store = new Attempts(":memory:");
  const a = store.create("curious", false, false);
  const first = store.addAnswer(
    a.id,
    "main",
    "microphone",
    transcript,
    "one.wav",
  );
  store.correct(first.id, 0, "Position");
  assert.throws(
    () => store.recordMain(first.id, main(), transcript),
    /Words changed/,
  );
  const second = store.addAnswer(
    a.id,
    "main",
    "microphone",
    transcript,
    "two.wav",
  );
  assert.throws(
    () =>
      store.recordMain(
        first.id,
        main(),
        reviewedTranscript(store.answer(first.id)),
      ),
    /replaced/,
  );
  store.recordMain(second.id, main(), transcript);
  const followup = store.addAnswer(
    a.id,
    "followup-1",
    "microphone",
    "Yes, seven.",
    "one.wav",
  );
  store.addAnswer(
    a.id,
    "followup-1",
    "microphone",
    "A newer answer.",
    "two.wav",
  );
  assert.throws(
    () =>
      store.recordDiagnostic(
        followup.id,
        diagnostic("incorrect"),
        "Yes, seven.",
      ),
    /replaced/,
  );
});
test("class recap uses one latest usable concept observation, including diagnostics and later teacher reviews", () => {
  const store = new Attempts(":memory:");
  const { attempt } = submitMain(store, "missing");
  const answer = store.addAnswer(
    attempt.id,
    "followup-1",
    "microphone",
    "No, seven is the average over the whole interval.",
    "next.wav",
  );
  store.recordDiagnostic(
    answer.id,
    diagnostic("correct"),
    "No, seven is the average over the whole interval.",
  );
  let row = store.teacher().recap.find((c) => c.id === "average-instantaneous");
  assert.deepEqual(
    row?.resolved.filter((id) => id === "you"),
    ["you"],
  );
  assert.ok(!row?.gaps.includes("you"));
  const later = store.create("curious", false, true),
    laterAnswer = store.addAnswer(
      later.id,
      "main",
      "microphone",
      transcript,
      "later.wav",
    );
  store.recordMain(
    laterAnswer.id,
    main("not-assessable", "2026-10-15T13:00:00.000Z"),
    transcript,
  );
  row = store.teacher().recap.find((c) => c.id === "average-instantaneous");
  assert.ok(row?.demonstrated.includes("you"));
  const reviewed = store.review(
    attempt.id,
    "correct",
    "I listened to the evidence and confirmed the missing distinction.",
    main("missing").criteria,
  );
  row = store.teacher().recap.find((c) => c.id === "average-instantaneous");
  assert.equal(reviewed.reviews.length, 1);
  assert.ok(row?.gaps.includes("you"));
});
test("automatic support flags stay deferred even after repeated main gaps and diagnostic mistakes", () => {
  const store = new Attempts(":memory:");
  const first = submitMain(store, "missing");
  const second = submitMain(store, "missing", true);
  const attempts = store.attempts().map((a) =>
    a.id === second.attempt.id
      ? {
          ...a,
          mainAssessment: { ...main("missing", "2026-10-15T13:00:00.000Z") },
        }
      : a,
  );
  assert.ok(
    projectRecap(store.learners(), attempts).every(
      (c) => !c.support.includes("you"),
    ),
  );
  const resolved: Attempt = {
    ...second.attempt,
    mainAssessment: main("demonstrated", "2026-10-15T14:00:00.000Z"),
  };
  assert.ok(
    projectRecap(store.learners(), [first.attempt, resolved]).every(
      (c) => !c.support.includes("you"),
    ),
  );
});
test("submitted evidence freezes, followups remain bounded, and finishing requires the first followup", () => {
  const store = new Attempts(":memory:");
  const { attempt, answer } = submitMain(store);
  assert.throws(() => store.correct(answer.id, 0, "Wrong"), /Submitted/);
  assert.throws(() => store.finish(attempt.id), /first follow-up/);
  assert.throws(
    () =>
      store.addAnswer(
        attempt.id,
        "followup-2",
        "microphone",
        "Ten.",
        "ten.wav",
      ),
    /first diagnostic/,
  );
  const first = store.addAnswer(
    attempt.id,
    "followup-1",
    "microphone",
    "Yes, seven.",
    "one.wav",
  );
  store.recordDiagnostic(first.id, diagnostic("incorrect"), "Yes, seven.");
  assert.throws(
    () =>
      store.addAnswer(attempt.id, "followup-1", "microphone", "No.", "two.wav"),
    /already submitted/,
  );
  const finished = store.finish(attempt.id);
  assert.equal(store.finish(attempt.id).finishedAt, finished.finishedAt);
});

test("diagnostic observations reject duplicate conflicting or missing concepts before recap", () => {
  const transcript =
    "Seven is the average. At three seconds the instantaneous speed is six.";
  const first = {
    id: "average-instantaneous",
    state: "demonstrated",
    quote: "Seven is the average.",
    reason: "Correct distinction.",
  };
  const second = {
    id: "six-at-three",
    state: "demonstrated",
    quote: "At three seconds the instantaneous speed is six.",
    reason: "Correct moment.",
  };
  const raw = {
    outcome: "correct",
    quote: transcript,
    reason: "Correct explanation.",
    observations: [first, second],
  };
  assert.equal(
    validateDiagnostic(raw, transcript, "followup-1").observations.length,
    2,
  );
  assert.throws(
    () =>
      validateDiagnostic(
        {
          ...raw,
          observations: [first, second, { ...first, state: "contradicted" }],
        },
        transcript,
        "followup-1",
      ),
    /did not match/,
  );
  assert.throws(
    () =>
      validateDiagnostic(
        { ...raw, observations: [first, first] },
        transcript,
        "followup-1",
      ),
    /did not match/,
  );
  assert.throws(
    () =>
      validateDiagnostic(
        { ...raw, observations: [first] },
        transcript,
        "followup-1",
      ),
    /did not match/,
  );
});
