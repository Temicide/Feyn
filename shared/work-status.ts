import type { Attempt, WorkStatus } from "./contracts.js";

export type AttemptStanding =
  | { kind: "waiting"; reason: "pip-passed" | "requested" }
  | { kind: "approved" }
  | { kind: "not-approved"; by: "pip" | "teacher" };

export function attemptStanding(attempt: Attempt): AttemptStanding | null {
  if (!attempt.mainAssessment) return null;
  const review = attempt.reviews.at(-1);
  if (review)
    return review.outcome === "pass"
      ? { kind: "approved" }
      : { kind: "not-approved", by: "teacher" };
  if (attempt.mainAssessment.outcome === "pass")
    return { kind: "waiting", reason: "pip-passed" };
  if (attempt.reviewRequest) return { kind: "waiting", reason: "requested" };
  return { kind: "not-approved", by: "pip" };
}

function rank(standing: AttemptStanding): number {
  if (standing.kind === "approved") return 3;
  if (standing.kind === "waiting") return standing.reason === "pip-passed" ? 2 : 1;
  return 0;
}

export function workStatus(attempts: Attempt[]): WorkStatus {
  const turnedIn = attempts
    .filter((a) => !a.sample)
    .flatMap((attempt) => {
      const standing = attemptStanding(attempt);
      return standing && attempt.mainAssessment
        ? [{ attempt, standing, at: attempt.mainAssessment.at }]
        : [];
    })
    .sort((a, b) => a.attempt.createdAt.localeCompare(b.attempt.createdAt));
  const best = turnedIn.reduce<(typeof turnedIn)[number] | null>(
    (top, next) => (!top || rank(next.standing) >= rank(top.standing) ? next : top),
    null,
  );
  if (!best) return { kind: "none" };
  const turnedInAt = turnedIn.map((t) => t.at).sort()[0] ?? best.at;
  return {
    ...best.standing,
    attemptId: best.attempt.id,
    turnedInAt,
    canRequestReview:
      best.standing.kind === "not-approved" && best.standing.by === "pip",
  };
}

export function isComplete(status: WorkStatus): boolean {
  return (
    status.kind === "approved" ||
    (status.kind === "waiting" && status.reason === "pip-passed")
  );
}
