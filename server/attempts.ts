import { randomUUID } from "node:crypto";
import {
  reviewedTranscript,
  words,
  type Answer,
  type Assignment,
  type Attempt,
  type Criterion,
  type Learner,
  type MainAssessment,
  type Review,
  type TeacherData,
  type WorkStatus,
} from "../shared/contracts.js";
import { workStatus } from "../shared/work-status.js";
import { deriveOutcome } from "./providers.js";
import { rubricOf } from "./rubric.js";
import type { Kind, RecordStore, Records } from "./store.js";

export function walkthroughId(learnerId: string, courseId: string): string {
  return `walkthrough:${learnerId}:${courseId}`;
}
export function belongsTo(attempt: Attempt, learnerId: string): boolean {
  return (
    attempt.learnerId === learnerId ||
    attempt.learnerId.startsWith(`walkthrough:${learnerId}:`)
  );
}
export function replaceWord(
  answer: Answer,
  index: number,
  replacement: string,
): Answer {
  if (answer.submittedAt)
    throw new Error(
      "Submitted evidence cannot be edited. Make another recording.",
    );
  if (answer.corrections.length >= 3)
    throw new Error(
      "All three word corrections have been used. Re-record for larger changes.",
    );
  if (!/^\S{1,80}$/.test(replacement))
    throw new Error("Replace one word only.");
  const before = words(reviewedTranscript(answer))[index];
  if (before === undefined) throw new Error("Word position does not exist.");
  return {
    ...answer,
    corrections: [
      ...answer.corrections,
      { index, before, after: replacement, at: new Date().toISOString() },
    ],
  };
}
export function effectiveMain(attempt: Attempt): MainAssessment | null {
  const review = attempt.reviews.at(-1);
  if (!review || !attempt.mainAssessment) return attempt.mainAssessment;
  return {
    ...attempt.mainAssessment,
    criteria: review.criteria,
    outcome: review.outcome,
    summary: review.note,
    provider: "Human teacher review",
    at: review.at,
  };
}
export function projectRecap(
  assignment: Pick<Assignment, "id" | "concepts">,
  learners: Learner[],
  allAttempts: Attempt[],
): TeacherData["recap"] {
  const attempts = allAttempts.filter((a) => a.assignmentId === assignment.id);
  return assignment.concepts.map((concept) => {
    const row: TeacherData["recap"][number] = {
      id: concept.id,
      title: concept.title,
      gaps: [],
      resolved: [],
      demonstrated: [],
      unassessed: [],
      support: [],
    };
    for (const learner of learners) {
      const events = attempts
        .filter((a) => a.learnerId === learner.id)
        .flatMap((attempt) => {
          const main = attempt.mainAssessment;
          const events: {
            criterion: Criterion;
            at: string;
            attempt: Attempt;
            kind: "main" | "diagnostic" | "review";
          }[] = [];
          const criterion = main?.criteria.find((c) => c.id === concept.id);
          if (main && criterion)
            events.push({ criterion, at: main.at, attempt, kind: "main" });
          for (const diagnostic of attempt.diagnostics) {
            const c = diagnostic.assessment.observations.find(
              (c) => c.id === concept.id,
            );
            if (c)
              events.push({
                criterion: c,
                at: diagnostic.assessment.at,
                attempt,
                kind: "diagnostic",
              });
          }
          for (const review of attempt.reviews) {
            const c = review.criteria.find((c) => c.id === concept.id);
            if (c)
              events.push({
                criterion: c,
                at: review.at,
                attempt,
                kind: "review",
              });
          }
          return events;
        })
        .filter((e) => e.criterion.state !== "not-assessable")
        .sort((a, b) => a.at.localeCompare(b.at));
      const current = events.at(-1);
      if (!current) {
        row.unassessed.push(learner.id);
        continue;
      }
      if (current.criterion.state === "demonstrated") {
        row.demonstrated.push(learner.id);
        if (
          events.some(
            (e) =>
              e.criterion.state === "missing" ||
              e.criterion.state === "contradicted",
          )
        )
          row.resolved.push(learner.id);
      } else {
        row.gaps.push(learner.id);
      }
    }
    return row;
  });
}

export class Attempts {
  constructor(
    private store: RecordStore,
    private ready: () => Promise<void>,
  ) {}
  private async list<K extends Kind>(kind: K): Promise<Records[K][]> {
    await this.ready();
    return this.store.list(kind);
  }
  learners(): Promise<Learner[]> {
    return this.list("learner");
  }
  attempts(): Promise<Attempt[]> {
    return this.list("attempt");
  }
  answers(): Promise<Answer[]> {
    return this.list("answer");
  }
  async learner(id: string): Promise<Learner> {
    const found = (await this.learners()).find((l) => l.id === id);
    if (!found) throw new Error("Learner missing.");
    return found;
  }
  async signIn(id: string, name: string): Promise<Learner> {
    const existing = (await this.learners()).find((l) => l.id === id);
    const learner = existing
      ? { ...existing, name }
      : { id, name, sample: false };
    await this.store.put("learner", learner);
    return learner;
  }
  async get(id: string): Promise<Attempt> {
    const found = (await this.attempts()).find((a) => a.id === id);
    if (!found) throw new Error("Attempt not found.");
    return found;
  }
  async answer(id: string): Promise<Answer> {
    const found = (await this.answers()).find((a) => a.id === id);
    if (!found) throw new Error("Recorded answer not found.");
    return found;
  }
  async workStatus(learnerId: string, assignmentId: string): Promise<WorkStatus> {
    return workStatus(
      (await this.attempts()).filter(
        (a) => a.learnerId === learnerId && a.assignmentId === assignmentId,
      ),
    );
  }
  async create(
    learnerId: string,
    assignmentId: string,
    sample: boolean,
    reviewedOpportunity: boolean,
  ): Promise<Attempt> {
    const learner = await this.learner(learnerId);
    const assignment = (await this.list("assignment")).find(
      (a) => a.id === assignmentId,
    );
    if (!assignment || assignment.state !== "posted")
      throw new Error("Assignment not found.");
    const walkthrough = walkthroughId(learnerId, assignment.courseId);
    if (sample && !(await this.learners()).some((l) => l.id === walkthrough))
      await this.store.put("learner", {
        id: walkthrough,
        name: `${learner.name.trim().split(/\s+/)[0] || "You"} · walkthrough`,
        sample: true,
      });
    const attempt: Attempt = {
      id: randomUUID(),
      learnerId: sample ? walkthrough : learnerId,
      assignmentId,
      rubric: rubricOf(assignment),
      sample,
      reviewedOpportunity,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      mainAnswerId: null,
      mainAssessment: null,
      diagnostics: [],
      reviews: [],
      reviewRequest: null,
      endingVariant: Math.random() < 0.5 ? 0 : 1,
    };
    await this.store.put("attempt", attempt);
    return attempt;
  }
  async addAnswer(
    attemptId: string,
    kind: Answer["kind"],
    provenance: Answer["provenance"],
    originalTranscript: string,
    audioId: string | null,
    audioMetadata: Answer["audioMetadata"] = null,
  ): Promise<Answer> {
    const attempt = await this.get(attemptId);
    if (attempt.finishedAt)
      throw new Error("This attempt is finished. Start a new explanation.");
    if (kind === "main" && attempt.mainAssessment)
      throw new Error(
        "Main explanation already assessed. Start a new attempt to retry.",
      );
    if (kind !== "main" && !attempt.rubric.followups.some((q) => q.id === kind))
      throw new Error("This assignment has no such follow-up question.");
    if (
      kind === "followup-2" &&
      !attempt.diagnostics.some((d) => d.questionId === "followup-1")
    )
      throw new Error(
        "Submit the first diagnostic before the optional second.",
      );
    if (kind !== "main" && !attempt.mainAssessment)
      throw new Error("Submit the main explanation first.");
    if (attempt.diagnostics.some((d) => d.questionId === kind))
      throw new Error("That diagnostic is already submitted.");
    if (provenance === "scripted-sample" && !attempt.sample)
      throw new Error("Sample transcript belongs only to a sample attempt.");
    const answer: Answer = {
      id: randomUUID(),
      attemptId,
      kind,
      provenance,
      originalTranscript,
      audioId,
      audioMetadata,
      corrections: [],
      transcription:
        provenance === "scripted-sample"
          ? "Prepared sample transcript. No speech recognition performed."
          : originalTranscript
            ? "ElevenLabs · scribe_v2 · English"
            : "Recording retained. Awaiting transcription.",
      createdAt: new Date().toISOString(),
      submittedAt: null,
    };
    await this.store.put("answer", answer);
    if (kind === "main")
      await this.store.put("attempt", { ...attempt, mainAnswerId: answer.id });
    return answer;
  }
  async setTranscript(id: string, transcript: string): Promise<Answer> {
    const answer = await this.answer(id);
    if (answer.submittedAt || answer.originalTranscript)
      throw new Error("This transcript is already preserved.");
    const updated = {
      ...answer,
      originalTranscript: transcript,
      transcription: "ElevenLabs · scribe_v2 · English",
    };
    await this.store.put("answer", updated);
    return updated;
  }
  async correct(
    id: string,
    index: number,
    replacement: string,
  ): Promise<Answer> {
    const updated = replaceWord(await this.answer(id), index, replacement);
    await this.store.put("answer", updated);
    return updated;
  }
  async recordMain(
    answerId: string,
    assessment: MainAssessment,
    judgedTranscript: string,
  ): Promise<Attempt> {
    const answer = await this.answer(answerId),
      attempt = await this.get(answer.attemptId);
    if (reviewedTranscript(answer) !== judgedTranscript)
      throw new Error(
        "Words changed while assessment was running. Submit the reviewed recording again.",
      );
    if (answer.kind !== "main" || attempt.mainAnswerId !== answer.id)
      throw new Error(
        "This recording was replaced. Submit the current recording.",
      );
    if (answer.submittedAt || attempt.mainAssessment)
      throw new Error("This explanation is already submitted.");
    await this.store.put("answer", { ...answer, submittedAt: assessment.at });
    const updated = { ...attempt, mainAssessment: assessment };
    await this.store.put("attempt", updated);
    await this.lockOnFirstSubmission(updated);
    return updated;
  }
  async recordDiagnostic(
    answerId: string,
    assessment: Attempt["diagnostics"][number]["assessment"],
    judgedTranscript: string,
  ): Promise<Attempt> {
    const answer = await this.answer(answerId),
      attempt = await this.get(answer.attemptId);
    if (reviewedTranscript(answer) !== judgedTranscript)
      throw new Error(
        "Words changed while assessment was running. Submit the reviewed recording again.",
      );
    const latest = (await this.answers())
      .filter((a) => a.attemptId === attempt.id && a.kind === answer.kind)
      .at(-1);
    if (latest?.id !== answerId || attempt.finishedAt)
      throw new Error("This recording was replaced or the attempt finished.");
    if (answer.kind === "main")
      throw new Error("Main evidence cannot be a diagnostic.");
    if (
      answer.submittedAt ||
      attempt.diagnostics.some((d) => d.questionId === answer.kind)
    )
      throw new Error("Diagnostic already submitted.");
    await this.store.put("answer", { ...answer, submittedAt: assessment.at });
    const updated = {
      ...attempt,
      diagnostics: [
        ...attempt.diagnostics,
        { answerId, questionId: answer.kind, assessment },
      ],
    };
    await this.store.put("attempt", updated);
    return updated;
  }
  async review(
    id: string,
    action: Review["action"],
    note: string,
    criteria: Criterion[],
  ): Promise<Attempt> {
    const attempt = await this.get(id);
    if (!attempt.mainAssessment) throw new Error("No assessment to review.");
    const required = attempt.rubric.concepts.map((c) => c.id);
    if (
      criteria.length !== required.length ||
      new Set(criteria.map((c) => c.id)).size !== required.length ||
      criteria.some((c) => !required.includes(c.id))
    )
      throw new Error("Review each required concept once.");
    const mainAnswer = attempt.mainAnswerId
      ? await this.answer(attempt.mainAnswerId)
      : null;
    if (!mainAnswer) throw new Error("Original evidence missing.");
    for (const c of criteria)
      if (c.quote && !reviewedTranscript(mainAnswer).includes(c.quote))
        throw new Error(
          "Review quotes must belong to the submitted transcript.",
        );
    if (action === "accept")
      criteria = effectiveMain(attempt)?.criteria ?? criteria;
    const review: Review = {
      id: randomUUID(),
      at: new Date().toISOString(),
      action,
      note,
      criteria,
      outcome:
        action === "accept"
          ? (effectiveMain(attempt)?.outcome ?? "not-enough-evidence")
          : deriveOutcome(criteria, false),
    };
    const updated = { ...attempt, reviews: [...attempt.reviews, review] };
    await this.store.put("attempt", updated);
    return updated;
  }
  async requestReview(id: string, note: string): Promise<Attempt> {
    const attempt = await this.get(id);
    if (attempt.sample)
      throw new Error("Sample walkthroughs can't be sent to a teacher.");
    if (!attempt.mainAssessment)
      throw new Error("Turn in your explanation before asking for a check.");
    if (attempt.reviews.length > 0)
      throw new Error("Your teacher has already checked this explanation.");
    if (attempt.mainAssessment.outcome === "pass")
      throw new Error("Pip already approved this explanation.");
    if (attempt.reviewRequest)
      throw new Error("You already asked your teacher to check this explanation.");
    const status = await this.workStatus(attempt.learnerId, attempt.assignmentId);
    if (status.kind === "none" || status.attemptId !== id || !status.canRequestReview)
      throw new Error("Only the explanation that sets your status can be sent to your teacher.");
    const updated = {
      ...attempt,
      reviewRequest: { at: new Date().toISOString(), note: note.trim().slice(0, 300) },
    };
    await this.store.put("attempt", updated);
    return updated;
  }
  async finish(id: string): Promise<Attempt> {
    const attempt = await this.get(id);
    if (attempt.finishedAt) return attempt;
    if (!attempt.diagnostics.some((d) => d.questionId === "followup-1"))
      throw new Error("Answer the first follow-up before finishing.");
    const updated = { ...attempt, finishedAt: new Date().toISOString() };
    await this.store.put("attempt", updated);
    return updated;
  }
  async evidence(
    assignment: Assignment,
    roster: string[],
  ): Promise<TeacherData> {
    const [learners, attempts, answers] = await Promise.all([
      this.learners(),
      this.attempts(),
      this.answers(),
    ]);
    const forAssignment = attempts.filter((a) => a.assignmentId === assignment.id),
      attemptIds = new Set(forAssignment.map((a) => a.id)),
      seen = new Set([...roster, ...forAssignment.map((a) => a.learnerId)]);
    return {
      learners: learners.filter((l) => seen.has(l.id)),
      roster,
      attempts: forAssignment,
      answers: answers.filter((a) => attemptIds.has(a.attemptId)),
      recap: projectRecap(
        assignment,
        learners.filter((l) => roster.includes(l.id)),
        forAssignment,
      ),
    };
  }
  private async lockOnFirstSubmission(attempt: Attempt): Promise<void> {
    if (attempt.sample) return;
    const assignment = (await this.list("assignment")).find(
      (a) => a.id === attempt.assignmentId,
    );
    if (assignment && !assignment.locked)
      await this.store.put("assignment", { ...assignment, locked: true });
  }
}
