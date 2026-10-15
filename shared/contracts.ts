import { z } from "zod";

export const conceptIdSchema = z.enum([
  "distance-speed",
  "average-instantaneous",
  "six-at-three",
]);
export type ConceptId = z.infer<typeof conceptIdSchema>;
export const profileSchema = z.enum(["curious", "playful"]);
export type Profile = z.infer<typeof profileSchema>;
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
  criteria: z.array(criterionSchema).length(3),
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
  criteria: z.array(criterionSchema).length(3),
  outcome: z.enum(["pass", "needs-work", "not-enough-evidence"]),
});
export type Review = z.infer<typeof reviewSchema>;
export const attemptSchema = z.object({
  id: z.string().uuid(),
  learnerId: z.string(),
  profile: profileSchema,
  sample: z.boolean(),
  reviewedOpportunity: z.boolean(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  mainAnswerId: z.string().uuid().nullable(),
  mainAssessment: mainAssessmentSchema.nullable(),
  diagnostics: z.array(
    z.object({
      answerId: z.string().uuid(),
      questionId: z.enum(["followup-1", "followup-2"]),
      assessment: diagnosticAssessmentSchema,
    }),
  ),
  reviews: z.array(reviewSchema),
  endingVariant: z.number().int().min(0).max(1),
});
export type Attempt = z.infer<typeof attemptSchema>;
export const learnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  sample: z.boolean(),
  teacher: z.boolean().default(false),
  completedAt: z.string().nullable(),
});
export type Learner = z.infer<typeof learnerSchema>;
export const lessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  subject: z.string(),
  question: z.string(),
  reference: z.string(),
  concepts: z.array(
    z.object({
      id: conceptIdSchema,
      title: z.string(),
      description: z.string(),
    }),
  ),
  followups: z.array(
    z.object({
      id: z.enum(["followup-1", "followup-2"]),
      question: z.string(),
      expected: z.string(),
      conceptIds: z.array(conceptIdSchema),
    }),
  ),
});
export type Lesson = z.infer<typeof lessonSchema>;
export const teacherSchema = z.object({
  learners: z.array(learnerSchema),
  attempts: z.array(attemptSchema),
  answers: z.array(answerSchema),
  recap: z.array(
    z.object({
      id: conceptIdSchema,
      title: z.string(),
      gaps: z.array(z.string()),
      resolved: z.array(z.string()),
      demonstrated: z.array(z.string()),
      unassessed: z.array(z.string()),
      support: z.array(z.string()),
    }),
  ),
});
export type TeacherData = z.infer<typeof teacherSchema>;
export const teacherViewSchema = teacherSchema.extend({ ubot: z.boolean() });
export const recapDraftSchema = z.object({
  text: z.string(),
  provider: z.string(),
  at: z.string(),
});
export const bootstrapSchema = z.object({
  lesson: lessonSchema,
  learner: learnerSchema,
  attempts: z.array(attemptSchema),
  providers: z.object({
    transcription: z.boolean(),
    assessment: z.boolean(),
    assessor: z.string(),
  }),
  profile: profileSchema,
});
export type Bootstrap = z.infer<typeof bootstrapSchema>;
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
  profile: profileSchema,
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
  criteria: z.array(criterionSchema).length(3),
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
export const sampleMain =
  "Distance tells us how far the cart is from the start, while speed tells us how quickly that distance changes. Average speed is the change in distance divided by the elapsed time over an interval. Instantaneous speed is that average over smaller and smaller intervals around one moment. For s of t equals t squared, the derivative is two t. At three seconds it is six meters per second. That means at that exact moment the distance is changing at six meters each second, not that it traveled six meters in the whole second.";
export const sampleFollowups = {
  "followup-1":
    "No. Seven meters per second is the average speed between three and four seconds. The speed changes during that second. At exactly three seconds its instantaneous speed is six meters per second.",
  "followup-2":
    "At five seconds the speed is ten meters per second, because the derivative is two t. The speed increases as time increases in this example.",
};
