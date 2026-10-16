import type { Assignment, Attempt, Course, Post } from "../shared/contracts.js";
import { enrollmentId, normalizeEmail } from "./courses.js";
import { deriveOutcome } from "./providers.js";
import { conceptsFromInput, rubricOf } from "./rubric.js";
import type { RecordStore } from "./store.js";

export const demoJoinCode = "FEYN01";
export const demoCourseId = "demo-calculus-1";
export const cartSpeedId = "cart-speed";
export const tutorialCourseId = "lets-get-started";
export const tutorialJoinCode = "HELLO1";
export const firstLessonId = "first-lesson";
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
  const owner = normalizeEmail(teacherEmails[0] ?? fallbackTeacher);
  if (!(await store.getSetting("demo-seeded"))) await seedDemo(store, owner);
  if (!(await store.getSetting("tutorial-seeded"))) await seedTutorial(store, owner);
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

const tutorialPosts: { text: string; image: string }[] = [
  {
    image: "/art/child-listening.png",
    text: `Welcome to Feyn!

This is Pip. Pip is curious about everything but doesn't know much yet. On Feyn you learn an idea by teaching it to Pip out loud. If you can explain it so Pip understands, you really know it.

These posts show you around. Read them from top to bottom, then try the practice assignment at the bottom of this page.`,
  },
  {
    image: "/art/classroom.svg",
    text: `Join your class

Your teacher gives you a join code. Open Courses in the top bar, type the code into "Join a course" and press Join. The course then appears on your Courses page.

Open a course to see your teacher's posts and assignments. The Upcoming box shows what is due next.`,
  },
  {
    image: "/art/student-speaking.png",
    text: `Teach Pip an assignment

1. Open an assignment and read the question on the chalkboard.
2. Press record and explain the answer out loud in your own words, as if Pip has never heard of the idea.
3. Check your words. If the transcript misheard you, fix up to three words.
4. Submit. Pip listens, then asks one or two follow-up questions about the tricky parts.

Not ready to record yet? Choose "Try the sample walkthrough" to watch how it works first. It never counts as your own work.`,
  },
  {
    image: "/art/child-aha.png",
    text: `After you finish

When Pip understands your explanation, the assignment is marked Done. You can try again any time to explain it better, and trying again never takes a Done away.

Your teacher can listen to your recording and see what Pip noticed, so they know which ideas to go over in class.`,
  },
  {
    image: "/art/child-thinking.png",
    text: `For teachers

If you have a teacher account, you also see Teacher's desk in the top bar. From there you can:
- create a course and share its join code with your students,
- write an assignment from a question and a reference answer, with U-Bot drafting the key concepts and follow-up questions for you to edit,
- post announcements with text and pictures to your class, like these posts,
- open an assignment's evidence to hear each recording and see which ideas the class is still missing.`,
  },
  {
    image: "/art/child-puzzled.png",
    text: `Your turn!

The practice assignment "Your first lesson: day and night" is just below. It is short, so you can try the whole thing once.

When you no longer need this course, you can leave it from the bottom of this page. To come back later, join with the code ${tutorialJoinCode}.`,
  },
];

export function firstLessonAssignment(createdAt: string): Assignment {
  const concepts = conceptsFromInput([
    {
      title: "The Earth spins",
      description: "The Earth turns once on its own axis about every 24 hours.",
    },
    {
      title: "One side faces the Sun",
      description:
        "The Sun lights only the half of the Earth facing it. That half has day and the other half has night.",
    },
  ]);
  const [spin, side] = concepts;
  if (!spin || !side) throw new Error("Seed concepts missing.");
  return {
    id: firstLessonId,
    courseId: tutorialCourseId,
    title: "Your first lesson: day and night",
    question:
      "Why do we have day and night? Explain it to Pip as if Pip has never thought about it.",
    reference:
      "The Earth spins on its axis about once every 24 hours. The Sun lights only the half of the Earth that faces it. Your side has day while it faces the Sun and night while it faces away. The Sun does not travel around the Earth each day; the Earth's turning makes the Sun seem to rise and set.",
    profile: "playful",
    concepts,
    followups: [
      {
        id: "followup-1",
        conceptIds: [spin.id],
        question:
          "If the Earth spun twice as fast, how long would one day and one night last together?",
        expected:
          "About 12 hours instead of 24, because your side would turn toward and away from the Sun twice as often.",
      },
      {
        id: "followup-2",
        conceptIds: [spin.id, side.id],
        question:
          "Pip thinks the Sun goes around the Earth every day. What would you tell Pip?",
        expected:
          "The Sun only seems to move across the sky. The Earth's spin carries us into the sunlight and back out of it.",
      },
    ],
    state: "posted",
    locked: false,
    dueDate: null,
    revision: 0,
    createdAt,
  };
}

async function seedTutorial(store: RecordStore, teacher: string): Promise<void> {
  const now = Date.now();
  await store.put("course", {
    id: tutorialCourseId,
    title: "Let's Get Started",
    teacherId: teacher,
    joinCode: tutorialJoinCode,
    createdAt: new Date(now).toISOString(),
  });
  for (const [index, item] of tutorialPosts.entries()) {
    const post: Post = {
      id: `tutorial-${index + 1}`,
      courseId: tutorialCourseId,
      text: item.text,
      images: [{ source: "bundled", path: item.image }],
      createdAt: new Date(now - index * 60000).toISOString(),
      removedAt: null,
    };
    await store.put("post", post);
  }
  await store.put("assignment", firstLessonAssignment(new Date(now).toISOString()));
  await store.setSetting("tutorial-seeded", "seeded");
}
