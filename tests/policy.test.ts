import test from "node:test";
import assert from "node:assert/strict";
import {
  Attempts,
  projectRecap,
  replaceWord,
  walkthroughId,
} from "../server/attempts.js";
import {
  deriveOutcome,
  validateMain,
  validateDiagnostic,
} from "../server/providers.js";
import { isComplete } from "../shared/work-status.js";
import { assignment, interval, moment, rubric, workspace } from "./support.js";
import {
  reviewedTranscript,
  type MainAssessment,
  type DiagnosticAssessment,
  type Criterion,
  type Attempt,
} from "../shared/contracts.js";

const transcript =
  "Distance is position. Speed is the rate of change. Average is over an interval, instantaneous at one moment. At three seconds the instantaneous speed is six meters per second.";
function main(
  state: Criterion["state"] = "demonstrated",
  at = "2026-10-15T12:00:00.000Z",
): MainAssessment {
  const criteria = rubric.concepts.map((c) => ({
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
        id: interval,
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
const you = "google:you";
async function fresh(): Promise<Attempts> {
  const { store, courses } = workspace();
  await store.signIn(you, "You");
  await courses.join(you, "FEYN01");
  return store;
}
const complete = async (store: Attempts) =>
  isComplete(await store.workStatus(you, assignment.id));
const teacher = (store: Attempts) => store.evidence(assignment, [you]);
async function submitMain(
  store: Attempts,
  state: Criterion["state"] = "demonstrated",
  reviewed = false,
) {
  const attempt = await store.create(you, assignment.id, false, reviewed);
  const answer = await store.addAnswer(
    attempt.id,
    "main",
    "microphone",
    transcript,
    "data/audio/original.wav",
    { filename: "original.wav", mime: "audio/wav" },
  );
  return {
    attempt: await store.recordMain(answer.id, main(state), transcript),
    answer,
  };
}

test("main pass plus wrong required follow-up earns completion without changing main result", async () => {
  const store = await fresh();
  const { attempt } = await submitMain(store);
  const answer = await store.addAnswer(
    attempt.id,
    "followup-1",
    "microphone",
    "Yes, seven.",
    "data/audio/followup.wav",
  );
  const result = await store.recordDiagnostic(
    answer.id,
    diagnostic("incorrect"),
    "Yes, seven.",
  );
  assert.equal(result.mainAssessment?.outcome, "pass");
  assert.equal(result.diagnostics[0]?.assessment.outcome, "incorrect");
  assert.equal(await complete(store), true);
  assert.equal((await store.finish(attempt.id)).diagnostics.length, 1);
  const row = (await teacher(store)).recap.find(
    (c) => c.id === interval,
  );
  assert.ok(row?.gaps.includes(you));
  assert.ok(!row?.support.includes(you));
});
test("weaker voluntary retry updates evidence and never revokes completion", async () => {
  const store = await fresh();
  await submitMain(store);
  await submitMain(store, "missing", true);
  assert.equal(await complete(store), true);
  assert.equal((await store.workStatus(you, assignment.id)).kind, "waiting");
  assert.equal(
    (await store.attempts()).filter((a) => a.learnerId === you).length,
    2,
  );
  assert.ok((await teacher(store)).recap.every((c) => c.gaps.includes(you)));
});
test("prepared walkthrough cannot complete the real learner or become their class evidence", async () => {
  const store = await fresh();
  const attempt = await store.create(you, assignment.id, true, false);
  const answer = await store.addAnswer(
    attempt.id,
    "main",
    "scripted-sample",
    transcript,
    null,
  );
  await store.recordMain(answer.id, main(), transcript);
  assert.deepEqual(await store.workStatus(you, assignment.id), { kind: "none" });
  assert.equal((await store.get(attempt.id)).learnerId, walkthroughId(you, assignment.courseId));
  assert.ok(
    (await teacher(store)).recap.every((c) => c.unassessed.includes(you)),
  );
});
test("three ordered word replacements preserve originals, including repeated word position", async () => {
  const store = await fresh();
  const attempt = await store.create(you, assignment.id, false, false);
  let answer = await store.addAnswer(
    attempt.id,
    "main",
    "uploaded-recording",
    "At tree seconds speed is sex.",
    "data/audio/fixed.wav",
    { filename: "spoken.wav", mime: "audio/wav" },
  );
  answer = await store.correct(answer.id, 1, "three");
  answer = await store.correct(answer.id, 5, "six.");
  answer = await store.correct(answer.id, 1, "3");
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
  await assert.rejects(() => store.correct(answer.id, 0, "Now"), /three word/);
  assert.throws(
    () => replaceWord({ ...answer, corrections: [] }, 0, "Two words"),
    /one word/,
  );
});
test("provider result requires each criterion once, literal quotes, and derived pass", async () => {
  const assessment = main();
  assert.equal(validateMain(assessment, transcript, rubric).criteria.length, 3);
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
        rubric,
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
        rubric,
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
test("late assessment cannot attach to changed words or a replaced recording", async () => {
  const store = await fresh();
  const a = await store.create(you, assignment.id, false, false);
  const first = await store.addAnswer(
    a.id,
    "main",
    "microphone",
    transcript,
    "one.wav",
  );
  await store.correct(first.id, 0, "Position");
  await assert.rejects(
    () => store.recordMain(first.id, main(), transcript),
    /Words changed/,
  );
  const second = await store.addAnswer(
    a.id,
    "main",
    "microphone",
    transcript,
    "two.wav",
  );
  await assert.rejects(
    async () =>
      store.recordMain(
        first.id,
        main(),
        reviewedTranscript(await store.answer(first.id)),
      ),
    /replaced/,
  );
  await store.recordMain(second.id, main(), transcript);
  const followup = await store.addAnswer(
    a.id,
    "followup-1",
    "microphone",
    "Yes, seven.",
    "one.wav",
  );
  await store.addAnswer(
    a.id,
    "followup-1",
    "microphone",
    "A newer answer.",
    "two.wav",
  );
  await assert.rejects(
    () =>
      store.recordDiagnostic(
        followup.id,
        diagnostic("incorrect"),
        "Yes, seven.",
      ),
    /replaced/,
  );
});
test("class recap uses one latest usable concept observation, including diagnostics and later teacher reviews", async () => {
  const store = await fresh();
  const { attempt } = await submitMain(store, "missing");
  const answer = await store.addAnswer(
    attempt.id,
    "followup-1",
    "microphone",
    "No, seven is the average over the whole interval.",
    "next.wav",
  );
  await store.recordDiagnostic(
    answer.id,
    diagnostic("correct"),
    "No, seven is the average over the whole interval.",
  );
  let row = (await teacher(store)).recap.find(
    (c) => c.id === interval,
  );
  assert.deepEqual(
    row?.resolved.filter((id) => id === you),
    [you],
  );
  assert.ok(!row?.gaps.includes(you));
  const later = await store.create(you, assignment.id, false, true),
    laterAnswer = await store.addAnswer(
      later.id,
      "main",
      "microphone",
      transcript,
      "later.wav",
    );
  await store.recordMain(
    laterAnswer.id,
    main("not-assessable", "2026-10-15T13:00:00.000Z"),
    transcript,
  );
  row = (await teacher(store)).recap.find(
    (c) => c.id === interval,
  );
  assert.ok(row?.demonstrated.includes(you));
  const reviewed = await store.review(
    attempt.id,
    "correct",
    "I listened to the evidence and confirmed the missing distinction.",
    main("missing").criteria,
  );
  row = (await teacher(store)).recap.find(
    (c) => c.id === interval,
  );
  assert.equal(reviewed.reviews.length, 1);
  assert.ok(row?.gaps.includes(you));
});
test("automatic support flags stay deferred even after repeated main gaps and diagnostic mistakes", async () => {
  const store = await fresh();
  const first = await submitMain(store, "missing");
  const second = await submitMain(store, "missing", true);
  const attempts = (await store.attempts()).map((a) =>
    a.id === second.attempt.id
      ? {
          ...a,
          mainAssessment: { ...main("missing", "2026-10-15T13:00:00.000Z") },
        }
      : a,
  );
  assert.ok(
    projectRecap(assignment, await store.learners(), attempts).every(
      (c) => !c.support.includes(you),
    ),
  );
  const resolved: Attempt = {
    ...second.attempt,
    mainAssessment: main("demonstrated", "2026-10-15T14:00:00.000Z"),
  };
  assert.ok(
    projectRecap(assignment, await store.learners(), [first.attempt, resolved]).every(
      (c) => !c.support.includes(you),
    ),
  );
});
test("submitted evidence freezes, followups remain bounded, and finishing requires the first followup", async () => {
  const store = await fresh();
  const { attempt, answer } = await submitMain(store);
  await assert.rejects(() => store.correct(answer.id, 0, "Wrong"), /Submitted/);
  await assert.rejects(() => store.finish(attempt.id), /first follow-up/);
  await assert.rejects(
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
  const first = await store.addAnswer(
    attempt.id,
    "followup-1",
    "microphone",
    "Yes, seven.",
    "one.wav",
  );
  await store.recordDiagnostic(
    first.id,
    diagnostic("incorrect"),
    "Yes, seven.",
  );
  await assert.rejects(
    () =>
      store.addAnswer(attempt.id, "followup-1", "microphone", "No.", "two.wav"),
    /already submitted/,
  );
  const finished = await store.finish(attempt.id);
  assert.equal(
    (await store.finish(attempt.id)).finishedAt,
    finished.finishedAt,
  );
});

test("diagnostic observations reject duplicate conflicting or missing concepts before recap", async () => {
  const transcript =
    "Seven is the average. At three seconds the instantaneous speed is six.";
  const first = {
    id: interval,
    state: "demonstrated",
    quote: "Seven is the average.",
    reason: "Correct distinction.",
  };
  const second = {
    id: moment,
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
    validateDiagnostic(raw, transcript, "followup-1", rubric).observations.length,
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
        rubric,
      ),
    /did not match/,
  );
  assert.throws(
    () =>
      validateDiagnostic(
        { ...raw, observations: [first, first] },
        transcript,
        "followup-1",
        rubric,
      ),
    /did not match/,
  );
  assert.throws(
    () =>
      validateDiagnostic(
        { ...raw, observations: [first] },
        transcript,
        "followup-1",
        rubric,
      ),
    /did not match/,
  );
});

test("the first real submission locks the assignment, and editing after an unlock bumps the revision", async () => {
  const { store, courses } = workspace();
  await store.signIn(you, "You");
  await courses.join(you, "FEYN01");
  const course = await courses.create("teacher@school.test", "Biology");
  const draft = await courses.createDraft(course);
  const form = {
    title: "Why ice floats",
    question: "Explain why ice floats.",
    reference: "Ice is less dense than water.",
    profile: "curious" as const,
    dueDate: null,
    concepts: [{ title: "Density", description: "Mass per volume." }],
    followups: [{ question: "What if it were denser?", expected: "It sinks.", concepts: [0] }],
  };
  await courses.save(draft.id, form);
  await courses.join(you, course.joinCode);
  await courses.post(draft.id);
  const sample = await store.create(you, draft.id, true, false);
  const prepared = await store.addAnswer(sample.id, "main", "scripted-sample", transcript, null);
  const densityOnly = (state: Criterion["state"]) => {
    const criteria = [{ id: "density", state, quote: transcript, reason: "Checked." }];
    return { ...main(), criteria, outcome: deriveOutcome(criteria, false) };
  };
  await store.recordMain(prepared.id, densityOnly("demonstrated"), transcript);
  assert.equal((await courses.assignment(draft.id)).locked, false, "a walkthrough does not lock");

  const attempt = await store.create(you, draft.id, false, false);
  const answer = await store.addAnswer(attempt.id, "main", "microphone", transcript, "a.wav");
  await store.recordMain(answer.id, densityOnly("demonstrated"), transcript);
  assert.equal((await courses.assignment(draft.id)).locked, true);
  await assert.rejects(courses.save(draft.id, form), /Unlock/);

  await courses.unlock(draft.id);
  const saved = await courses.save(draft.id, {
    ...form,
    concepts: [{ title: "Density of water", description: "Mass per volume." }],
    followups: [{ ...form.followups[0]!, concepts: [0] }],
  });
  assert.equal(saved.revision, 1);
  assert.equal(saved.locked, true);
  assert.deepEqual(saved.concepts.map((c) => c.id), ["density-of-water"]);
  const frozen = (await store.get(attempt.id)).rubric;
  assert.equal(frozen.revision, 0);
  assert.deepEqual(frozen.concepts.map((c) => c.id), ["density"]);
});
