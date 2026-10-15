import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { z } from "zod";
import {
  answerSchema,
  attemptSchema,
  learnerSchema,
  reviewedTranscript,
  words,
  type Answer,
  type Attempt,
  type Criterion,
  type Learner,
  type MainAssessment,
  type Profile,
  type Review,
  type TeacherData,
} from "../shared/contracts.ts";
import { deriveOutcome } from "./providers.ts";
import { lesson } from "./lesson.ts";

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
  learners: Learner[],
  attempts: Attempt[],
): TeacherData["recap"] {
  return lesson.concepts.map((concept) => {
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
  private db: DatabaseSync;
  constructor(path = "data/lesson.sqlite") {
    if (path !== ":memory:") mkdirSync("data", { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    if (!this.all("learner", learnerSchema).length) {
      this.save("learner", {
        id: "you",
        name: "You",
        sample: false,
        completedAt: null,
      });
      for (const [id, name] of [
        ["sample-maya", "Maya"],
        ["sample-noah", "Noah"],
        ["sample-eli", "Eli"],
        ["sample-june", "June"],
        ["sample-you", "You · walkthrough"],
      ])
        if (id && name)
          this.save("learner", { id, name, sample: true, completedAt: null });
      this.seedSamples();
    }
    if (!this.learners().some((l) => l.id === "sample-you"))
      this.save("learner", {
        id: "sample-you",
        name: "You · walkthrough",
        sample: true,
        completedAt: null,
      });
  }
  private all<T>(kind: string, schema: z.ZodType<T>): T[] {
    return this.db
      .prepare("SELECT body FROM records WHERE kind=? ORDER BY rowid")
      .all(kind)
      .map((row) => {
        const r = z.object({ body: z.string() }).parse(row);
        return schema.parse(JSON.parse(r.body));
      });
  }
  private save<T extends { id: string }>(kind: string, value: T): void {
    this.db
      .prepare(
        "INSERT INTO records(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
      )
      .run(kind, value.id, JSON.stringify(value));
  }
  learners(): Learner[] {
    return this.all("learner", learnerSchema);
  }
  learner(): Learner {
    const found = this.learners().find((l) => l.id === "you");
    if (!found) throw new Error("Learner missing.");
    return found;
  }
  attempts(): Attempt[] {
    return this.all("attempt", attemptSchema);
  }
  answers(): Answer[] {
    return this.all("answer", answerSchema);
  }
  get(id: string): Attempt {
    const found = this.attempts().find((a) => a.id === id);
    if (!found) throw new Error("Attempt not found.");
    return found;
  }
  answer(id: string): Answer {
    const found = this.answers().find((a) => a.id === id);
    if (!found) throw new Error("Recorded answer not found.");
    return found;
  }
  profile(): Profile {
    return z
      .enum(["curious", "playful"])
      .parse(
        this.db.prepare("SELECT value FROM settings WHERE key='profile'").get()
          ?.value ?? "curious",
      );
  }
  setProfile(profile: Profile): void {
    this.db
      .prepare(
        "INSERT INTO settings(key,value) VALUES('profile',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(profile);
  }
  create(
    profile: Profile,
    sample: boolean,
    reviewedOpportunity: boolean,
  ): Attempt {
    const attempt: Attempt = {
      id: randomUUID(),
      learnerId: sample ? "sample-you" : "you",
      profile,
      sample,
      reviewedOpportunity,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      mainAnswerId: null,
      mainAssessment: null,
      diagnostics: [],
      reviews: [],
      endingVariant: Math.random() < 0.5 ? 0 : 1,
    };
    this.save("attempt", attempt);
    return attempt;
  }
  addAnswer(
    attemptId: string,
    kind: Answer["kind"],
    provenance: Answer["provenance"],
    originalTranscript: string,
    audioPath: string | null,
    audioMetadata: Answer["audioMetadata"] = null,
  ): Answer {
    const attempt = this.get(attemptId);
    if (attempt.finishedAt)
      throw new Error("This attempt is finished. Start a new explanation.");
    if (kind === "main" && attempt.mainAssessment)
      throw new Error(
        "Main explanation already assessed. Start a new attempt to retry.",
      );
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
      audioPath,
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
    this.save("answer", answer);
    if (kind === "main")
      this.save("attempt", { ...attempt, mainAnswerId: answer.id });
    return answer;
  }
  setTranscript(id: string, transcript: string): Answer {
    const answer = this.answer(id);
    if (answer.submittedAt || answer.originalTranscript)
      throw new Error("This transcript is already preserved.");
    const updated = {
      ...answer,
      originalTranscript: transcript,
      transcription: "ElevenLabs · scribe_v2 · English",
    };
    this.save("answer", updated);
    return updated;
  }
  correct(id: string, index: number, replacement: string): Answer {
    const updated = replaceWord(this.answer(id), index, replacement);
    this.save("answer", updated);
    return updated;
  }
  recordMain(
    answerId: string,
    assessment: MainAssessment,
    judgedTranscript: string,
  ): Attempt {
    const answer = this.answer(answerId),
      attempt = this.get(answer.attemptId);
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
    this.save("answer", { ...answer, submittedAt: assessment.at });
    const updated = { ...attempt, mainAssessment: assessment };
    this.save("attempt", updated);
    this.grant(updated, assessment.outcome);
    return updated;
  }
  recordDiagnostic(
    answerId: string,
    assessment: Attempt["diagnostics"][number]["assessment"],
    judgedTranscript: string,
  ): Attempt {
    const answer = this.answer(answerId),
      attempt = this.get(answer.attemptId);
    if (reviewedTranscript(answer) !== judgedTranscript)
      throw new Error(
        "Words changed while assessment was running. Submit the reviewed recording again.",
      );
    const latest = this.answers()
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
    this.save("answer", { ...answer, submittedAt: assessment.at });
    const updated = {
      ...attempt,
      diagnostics: [
        ...attempt.diagnostics,
        { answerId, questionId: answer.kind, assessment },
      ],
    };
    this.save("attempt", updated);
    return updated;
  }
  review(
    id: string,
    action: Review["action"],
    note: string,
    criteria: Criterion[],
  ): Attempt {
    const attempt = this.get(id);
    if (!attempt.mainAssessment) throw new Error("No assessment to review.");
    if (new Set(criteria.map((c) => c.id)).size !== 3)
      throw new Error("Review each required concept once.");
    const mainAnswer = attempt.mainAnswerId
      ? this.answer(attempt.mainAnswerId)
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
    this.save("attempt", updated);
    this.grant(updated, review.outcome);
    return updated;
  }
  finish(id: string): Attempt {
    const attempt = this.get(id);
    if (attempt.finishedAt) return attempt;
    if (!attempt.diagnostics.some((d) => d.questionId === "followup-1"))
      throw new Error("Answer the first follow-up before finishing.");
    const updated = { ...attempt, finishedAt: new Date().toISOString() };
    this.save("attempt", updated);
    return updated;
  }
  teacher(): TeacherData {
    const learners = this.learners(),
      attempts = this.attempts();
    return {
      learners,
      attempts,
      answers: this.answers(),
      recap: projectRecap(learners, attempts),
    };
  }
  private grant(attempt: Attempt, outcome: MainAssessment["outcome"]): void {
    const learner = this.learners().find((l) => l.id === attempt.learnerId);
    if (learner && !learner.completedAt && outcome === "pass")
      this.save("learner", {
        ...learner,
        completedAt: new Date().toISOString(),
      });
  }
  private seedSamples(): void {
    const cases = [
      {
        id: "sample-maya",
        states: ["demonstrated", "missing", "demonstrated"],
        retry: false,
      },
      {
        id: "sample-noah",
        states: ["demonstrated", "missing", "missing"],
        retry: false,
      },
      {
        id: "sample-noah",
        states: ["demonstrated", "missing", "missing"],
        retry: true,
      },
      {
        id: "sample-eli",
        states: ["demonstrated", "missing", "demonstrated"],
        retry: false,
      },
      {
        id: "sample-eli",
        states: ["demonstrated", "demonstrated", "demonstrated"],
        retry: true,
      },
    ];
    cases.forEach((item, index) => {
      const createdAt = new Date(
        Date.now() - (cases.length - index) * 3600000,
      ).toISOString();
      const criteria = lesson.concepts.map((c, i) => ({
        id: c.id,
        state: z.enum(["demonstrated", "missing"]).parse(item.states[i]),
        quote: "",
        reason:
          "Authored sample class evidence. No real learner or AI assessment.",
      }));
      const attempt: Attempt = {
        id: randomUUID(),
        learnerId: item.id,
        profile: "curious",
        sample: true,
        reviewedOpportunity: item.retry,
        createdAt,
        finishedAt: createdAt,
        mainAnswerId: null,
        mainAssessment: {
          kind: "main",
          outcome: deriveOutcome(criteria, false),
          criteria,
          majorError: false,
          summary: "Illustrative sample class evidence only.",
          provider: "Authored sample classmate",
          model: "none",
          at: createdAt,
        },
        diagnostics: [],
        reviews: [],
        endingVariant: 0,
      };
      this.save("attempt", attempt);
      this.grant(
        attempt,
        attempt.mainAssessment?.outcome ?? "not-enough-evidence",
      );
    });
  }
}
