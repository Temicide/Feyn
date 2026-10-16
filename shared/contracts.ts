import { z } from "zod";

export const conceptIdSchema = z.string().min(1).max(80);
export type ConceptId = z.infer<typeof conceptIdSchema>;
export const profileSchema = z.enum(["curious", "playful"]);
export type Profile = z.infer<typeof profileSchema>;
const followupIdSchema = z.enum(["followup-1", "followup-2"]);
const strictText = (max: number) => z.string().trim().min(1).max(max);
const looseText = (max: number) => z.string().trim().max(max);
function rubricParts(text: typeof strictText) {
  return {
    title: text(120),
    question: text(2000),
    reference: text(4000),
    profile: profileSchema,
    concepts: z
      .array(
        z.object({
          id: conceptIdSchema,
          title: text(120),
          description: text(600),
        }),
      )
      .max(5),
    followups: z
      .array(
        z.object({
          id: followupIdSchema,
          question: text(1000),
          expected: text(1000),
          conceptIds: z.array(conceptIdSchema),
        }),
      )
      .max(2),
  };
}
const strictParts = rubricParts(strictText);
export const rubricSchema = z
  .object({
    ...strictParts,
    concepts: strictParts.concepts.min(1),
    followups: strictParts.followups.min(1),
    revision: z.number().int().nonnegative(),
  })
  .superRefine((rubric, ctx) => {
    const ids = rubric.concepts.map((c) => c.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Each concept needs its own title." });
    rubric.followups.forEach((q, index) => {
      if (q.id !== `followup-${index + 1}`)
        ctx.addIssue({ code: "custom", message: "Follow-ups are numbered in order." });
      if (q.conceptIds.length === 0 || q.conceptIds.some((id) => !ids.includes(id)))
        ctx.addIssue({
          code: "custom",
          message: "Each follow-up must test at least one of this assignment's concepts.",
        });
    });
  });
export type Rubric = z.infer<typeof rubricSchema>;
export const criterionSchema = z.object({
  id: conceptIdSchema,
  state: z.enum(["demonstrated", "missing", "contradicted", "not-assessable"]),
  quote: z.string().max(2000),
  reason: z.string().max(2000),
});
export type Criterion = z.infer<typeof criterionSchema>;
export const mainAssessmentSchema = z.object({
  kind: z.literal("main"),
  outcome: z.enum(["pass", "needs-work", "not-enough-evidence"]),
  criteria: z.array(criterionSchema).min(1).max(5),
  majorError: z.boolean(),
  summary: z.string(),
  provider: z.string(),
  model: z.string(),
  at: z.string(),
});
export type MainAssessment = z.infer<typeof mainAssessmentSchema>;
export const diagnosticAssessmentSchema = z.object({
  kind: z.literal("diagnostic"),
  outcome: z.enum(["correct", "incorrect", "not-enough-evidence"]),
  quote: z.string(),
  reason: z.string(),
  observations: z.array(criterionSchema),
  provider: z.string(),
  model: z.string(),
  at: z.string(),
});
export type DiagnosticAssessment = z.infer<typeof diagnosticAssessmentSchema>;
export const correctionSchema = z.object({
  index: z.number().int().nonnegative(),
  before: z.string(),
  after: z.string(),
  at: z.string(),
});
export const answerSchema = z.object({
  id: z.string().uuid(),
  attemptId: z.string().uuid(),
  kind: z.enum(["main", "followup-1", "followup-2"]),
  originalTranscript: z.string(),
  corrections: z.array(correctionSchema).max(3),
  audioId: z.string().nullable(),
  audioMetadata: z
    .object({ filename: z.string(), mime: z.string() })
    .nullable()
    .default(null),
  provenance: z.enum(["microphone", "uploaded-recording", "scripted-sample"]),
  transcription: z.string(),
  createdAt: z.string(),
  submittedAt: z.string().nullable(),
});
export type Answer = z.infer<typeof answerSchema>;
export const reviewSchema = z.object({
  id: z.string().uuid(),
  at: z.string(),
  action: z.enum(["accept", "correct"]),
  note: z.string().min(1),
  criteria: z.array(criterionSchema).min(1).max(5),
  outcome: z.enum(["pass", "needs-work", "not-enough-evidence"]),
});
export type Review = z.infer<typeof reviewSchema>;
export const attemptSchema = z.object({
  id: z.string().uuid(),
  learnerId: z.string(),
  assignmentId: z.string(),
  rubric: rubricSchema,
  sample: z.boolean(),
  reviewedOpportunity: z.boolean(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  mainAnswerId: z.string().uuid().nullable(),
  mainAssessment: mainAssessmentSchema.nullable(),
  diagnostics: z.array(
    z.object({
      answerId: z.string().uuid(),
      questionId: followupIdSchema,
      assessment: diagnosticAssessmentSchema,
    }),
  ),
  reviews: z.array(reviewSchema),
  reviewRequest: z
    .object({ at: z.string(), note: z.string().max(300) })
    .nullable()
    .default(null),
  endingVariant: z.number().int().min(0).max(1),
});
export type Attempt = z.infer<typeof attemptSchema>;
const workStatusBase = { attemptId: z.string(), turnedInAt: z.string(), canRequestReview: z.boolean() };
export const workStatusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("waiting"),
    reason: z.enum(["pip-passed", "requested"]),
    ...workStatusBase,
  }),
  z.object({ kind: z.literal("approved"), ...workStatusBase }),
  z.object({
    kind: z.literal("not-approved"),
    by: z.enum(["pip", "teacher"]),
    ...workStatusBase,
  }),
]);
export type WorkStatus = z.infer<typeof workStatusSchema>;
export const reviewRequestInputSchema = z.object({
  note: z.string().trim().max(300),
});
export const learnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  sample: z.boolean(),
});
export type Learner = z.infer<typeof learnerSchema>;
export const courseSchema = z.object({
  id: z.string(),
  title: z.string(),
  teacherId: z.string(),
  joinCode: z.string(),
  createdAt: z.string(),
});
export type Course = z.infer<typeof courseSchema>;
export const enrollmentSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  learnerId: z.string(),
  joinedAt: z.string(),
  endedAt: z.string().nullable(),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;
const draftParts = rubricParts(looseText);
export const assignmentSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  ...draftParts,
  state: z.enum(["draft", "posted"]),
  locked: z.boolean(),
  dueDate: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Assignment = z.infer<typeof assignmentSchema>;
export const teacherEmailSchema = z.object({
  id: z.string(),
  addedBy: z.string(),
  addedAt: z.string(),
});
export type TeacherEmail = z.infer<typeof teacherEmailSchema>;

export const assignmentInputSchema = z.object({
  title: looseText(120),
  question: looseText(2000),
  reference: looseText(4000),
  profile: profileSchema,
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-30.")
    .nullable(),
  concepts: z
    .array(z.object({ title: looseText(120), description: looseText(600) }))
    .max(5),
  followups: z
    .array(
      z.object({
        question: looseText(1000),
        expected: looseText(1000),
        concepts: z.array(z.number().int().min(0).max(4)),
      }),
    )
    .max(2),
});
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
export const rubricDraftSchema = z.object({
  concepts: assignmentInputSchema.shape.concepts.min(1),
  followups: assignmentInputSchema.shape.followups.min(1),
});
export type RubricDraft = z.infer<typeof rubricDraftSchema>;
export const draftRequestSchema = z.object({
  question: strictText(2000),
  reference: strictText(4000),
});

const recapRowSchema = z.object({
  id: conceptIdSchema,
  title: z.string(),
  gaps: z.array(z.string()),
  resolved: z.array(z.string()),
  demonstrated: z.array(z.string()),
  unassessed: z.array(z.string()),
  support: z.array(z.string()),
});
export const teacherSchema = z.object({
  learners: z.array(learnerSchema),
  roster: z.array(z.string()),
  attempts: z.array(attemptSchema),
  answers: z.array(answerSchema),
  recap: z.array(recapRowSchema),
});
export type TeacherData = z.infer<typeof teacherSchema>;
export const teacherViewSchema = teacherSchema.extend({
  ubot: z.boolean(),
  assignment: assignmentSchema,
  course: z.object({ id: z.string(), title: z.string() }),
});
export type TeacherView = z.infer<typeof teacherViewSchema>;
export const recapDraftSchema = z.object({
  text: z.string(),
  provider: z.string(),
  at: z.string(),
});
const assignmentCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  dueDate: z.string().nullable(),
  status: workStatusSchema,
});
export const studentCourseSchema = z.object({
  id: z.string(),
  title: z.string(),
  assignments: z.array(assignmentCardSchema),
});
export type StudentCourse = z.infer<typeof studentCourseSchema>;
export const studentCoursesSchema = z.array(studentCourseSchema);
export const bootstrapSchema = z.object({
  assignment: assignmentSchema,
  courseTitle: z.string(),
  learner: learnerSchema,
  status: workStatusSchema,
  attempts: z.array(attemptSchema),
  providers: z.object({
    transcription: z.boolean(),
    assessment: z.boolean(),
    assessor: z.string(),
  }),
});
export type Bootstrap = z.infer<typeof bootstrapSchema>;
const teacherAssignmentCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  state: z.enum(["draft", "posted"]),
  locked: z.boolean(),
  dueDate: z.string().nullable(),
  enrolled: z.number().int(),
  completed: z.number().int(),
  waiting: z.number().int(),
  gapConcepts: z.number().int(),
});
export const teacherCourseSchema = z.object({
  course: courseSchema,
  roster: z.array(
    z.object({ learnerId: z.string(), name: z.string(), joinedAt: z.string() }),
  ),
  assignments: z.array(teacherAssignmentCardSchema),
});
export type TeacherCourse = z.infer<typeof teacherCourseSchema>;
export const teacherCoursesSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    joinCode: z.string(),
    students: z.number().int(),
    posted: z.number().int(),
  }),
);
export const meSchema = z.object({
  learnerId: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(["teacher", "student"]),
});
export type Me = z.infer<typeof meSchema>;
export const signInOptionsSchema = z.object({
  error: z.string(),
  google: z.boolean(),
  devLogin: z.boolean(),
});
export type SignInOptions = z.infer<typeof signInOptionsSchema>;
export const createAttemptSchema = z.object({
  assignmentId: z.string(),
  sample: z.boolean(),
  reviewedOpportunity: z.boolean(),
});
export const replacementSchema = z.object({
  index: z.number().int().nonnegative(),
  replacement: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^\S+$/, "Replace one word only."),
});
export const teacherReviewRequestSchema = z.object({
  action: z.enum(["accept", "correct"]),
  note: z.string().trim().min(1).max(3000),
  criteria: z.array(criterionSchema).min(1).max(5),
});
export const maxAudioBytes = 4 * 1024 * 1024;
export const submissionSchema = z.object({ answerId: z.string().uuid() });
export function words(text: string): string[] {
  return text.match(/\S+/g) ?? [];
}
export function reviewedTranscript(answer: Answer): string {
  const tokens = words(answer.originalTranscript);
  for (const edit of answer.corrections) tokens[edit.index] = edit.after;
  return tokens.join(" ");
}
