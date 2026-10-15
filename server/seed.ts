import type { Assignment, Attempt, Course } from "../shared/contracts.js";
import { enrollmentId, normalizeEmail } from "./courses.js";
import { deriveOutcome } from "./providers.js";
import { conceptsFromInput, rubricOf } from "./rubric.js";
import type { RecordStore } from "./store.js";

export const demoJoinCode = "FEYN01";
export const demoCourseId = "demo-calculus-1";
export const cartSpeedId = "cart-speed";
const fallbackTeacher = "teacher@feyn.invalid";

const cartConcepts = [
  {
    title: "Distance and speed",
    description:
      "Distance describes position relative to the start; speed describes how quickly that distance changes.",
  },
  {
    title: "An interval or a moment",
    description:
      "Average speed concerns an interval; instantaneous speed concerns a particular moment.",
  },
  {
    title: "What 6 m/s means",
    description:
      "At three seconds the instantaneous rate of change is six meters per second, rather than a distance or a whole-second average.",
  },
];
const classmates = [
  ["sample-maya", "Maya"],
  ["sample-noah", "Noah"],
  ["sample-eli", "Eli"],
  ["sample-june", "June"],
] as const;
const cases = [
  { id: "sample-maya", states: ["demonstrated", "missing", "demonstrated"], retry: false },
  { id: "sample-noah", states: ["demonstrated", "missing", "missing"], retry: false },
  { id: "sample-noah", states: ["demonstrated", "missing", "missing"], retry: true },
  { id: "sample-eli", states: ["demonstrated", "missing", "demonstrated"], retry: false },
  { id: "sample-eli", states: ["demonstrated", "demonstrated", "demonstrated"], retry: true },
] as const;

export async function prepare(
  store: RecordStore,
  teacherEmails: string[],
): Promise<void> {
  const known = new Set((await store.list("teacher")).map((t) => t.id));
  for (const email of teacherEmails.map(normalizeEmail))
    if (!known.has(email))
      await store.put("teacher", {
        id: email,
        addedBy: "TEACHER_EMAILS",
        addedAt: new Date().toISOString(),
      });
  if (!(await store.getSetting("demo-seeded")))
    await seedDemo(store, normalizeEmail(teacherEmails[0] ?? fallbackTeacher));
}

export function cartSpeedAssignment(createdAt: string): Assignment {
  const concepts = conceptsFromInput(cartConcepts);
  const [distance, interval, moment] = concepts;
  if (!distance || !interval || !moment) throw new Error("Seed concepts missing.");
  return {
    id: cartSpeedId,
    courseId: demoCourseId,
    title: "A moment in motion",
    question:
      "A cart's distance from its start is s(t) = t² meters, where t is time in seconds. Explain to Pip what its speed at exactly three seconds means and how to find it.",
    reference:
      "Average speed over an interval is change in distance divided by elapsed time. Instantaneous speed is the limit of that average as the interval shrinks. Here v(t) = 2t meters per second, so v(3) = 6 meters per second.",
    profile: "curious" as const,
    concepts,
    followups: [
      {
        id: "followup-1" as const,
        conceptIds: [interval.id, moment.id],
        question:
          "The cart travels seven meters between three and four seconds. Does that mean its speed at exactly three seconds is seven meters per second? Explain.",
        expected:
          "Seven meters per second is the average over that whole second. Speed changes during the interval. Speed at exactly three seconds is six meters per second.",
      },
      {
        id: "followup-2" as const,
        conceptIds: [moment.id],
        question:
          "What is the speed at five seconds, and why does it differ from the speed at three seconds?",
        expected:
          "Ten meters per second. The rate of change of t² is 2t, so speed increases with time.",
      },
    ],
    state: "posted" as const,
    locked: true,
    dueDate: null,
    revision: 0,
    createdAt,
  };
}

async function seedDemo(store: RecordStore, teacher: string): Promise<void> {
  const now = new Date().toISOString();
  const course: Course = {
    id: demoCourseId,
    title: "Calculus 1 · Rates of change",
    teacherId: teacher,
    joinCode: demoJoinCode,
    createdAt: now,
  };
  await store.put("course", course);
  const assignment = cartSpeedAssignment(now);
  await store.put("assignment", assignment);
  const rubric = rubricOf(assignment);
  for (const [id, name] of classmates) {
    await store.put("learner", { id, name, sample: true });
    await store.put("enrollment", {
      id: enrollmentId(course.id, id),
      courseId: course.id,
      learnerId: id,
      joinedAt: now,
      endedAt: null,
    });
  }
  for (const [index, item] of cases.entries()) {
    const createdAt = new Date(
      Date.now() - (cases.length - index) * 3600000,
    ).toISOString();
    const criteria = rubric.concepts.map((c, i) => ({
      id: c.id,
      state: item.states[i] === "missing" ? ("missing" as const) : ("demonstrated" as const),
      quote: "",
      reason: "Authored sample class evidence. No real learner or AI assessment.",
    }));
    const outcome = deriveOutcome(criteria, false);
    const attempt: Attempt = {
      id: `00000000-0000-4000-8000-00000000000${index + 1}`,
      learnerId: item.id,
      assignmentId: assignment.id,
      rubric,
      sample: true,
      reviewedOpportunity: item.retry,
      createdAt,
      finishedAt: createdAt,
      mainAnswerId: null,
      mainAssessment: {
        kind: "main",
        outcome,
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
    await store.put("attempt", attempt);
    if (outcome === "pass")
      await store.put("completion", {
        id: `${item.id}:${assignment.id}`,
        learnerId: item.id,
        assignmentId: assignment.id,
        at: createdAt,
      });
  }
  await store.setSetting("demo-seeded", "seeded");
}
