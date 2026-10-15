# Course ecosystem implementation plan

Feyn moves from one built-in lesson to many courses. Decisions are in [the glossary](GLOSSARY.md) and ADRs [0003](adr/0003-course-scoped-teacher-access.md) to [0007](adr/0007-course-roster-and-assignment-defaults.md). This plan orders the work so each milestone ends in a working, deployable app. If time runs out, ship the last finished milestone.

| Milestone | Demo at the end | Cut if late? |
| --- | --- | --- |
| 1. Data spine | Today's app, unchanged on screen, running on stored records | No |
| 2. Student courses | Judge signs in, enters `FEYN01`, does cart-speed | No |
| 3. Teacher courses | Teacher creates a course, shares its code, reads its recap | No |
| 4. Assignment form | Teacher writes and posts an assignment by hand | No |
| 5. U-Bot drafting | U-Bot fills the form from a question and reference | Yes |
| 6. Lock, due dates, MCP, docs | Full ADR set honoured | Partly |

Milestones 1–4 are the minimum honest "course ecosystem". Milestone 5 is the showpiece and builds on 4's form, so it cannot move earlier.

## 1. Data spine

Make assignments data, without changing what anyone sees.

**Contracts** (`shared/contracts.ts`)
- Replace the `conceptIdSchema` enum with a slug string. Add `rubricSchema`: question, reference, title, profile, 1–5 concepts, 1–2 follow-ups (ids stay `followup-1`/`followup-2`).
- Add `courseSchema` (id, title, teacherId, joinCode, createdAt), `enrollmentSchema` (id, courseId, learnerId, joinedAt, endedAt), `assignmentSchema` (id, courseId, rubric fields, state `draft | posted`, locked, dueDate, revision, createdAt), `teacherEmailSchema` (id = email, addedBy, addedAt).
- `attemptSchema` gains `assignmentId` and `rubric` (the rubric copy, ADR 0005). Drop the global `profile` from the attempt request; it comes from the rubric.
- `mainAssessmentSchema.criteria` and `reviewSchema.criteria` drop `.length(3)`. The server checks the length against the attempt's rubric instead.
- Completion moves off `Learner.completedAt` to a `completionSchema` (id = `learnerId:assignmentId`, at). Completion stays an earned grant that is never revoked (ADR 0002).

**Store** (`server/store.ts`)
- Add kinds `course`, `enrollment`, `assignment`, `teacher`, `completion` to `Records` and both implementations. No new store methods.

**Policy** (`server/attempts.ts`, `server/providers.ts`)
- `create(learnerId, assignmentId, sample, reviewedOpportunity)` copies the assignment's rubric into the attempt.
- `validateMain`, `assessMain`, `assessDiagnostic`, `projectRecap` and the review route read concepts and follow-ups from `attempt.rubric` or the assignment, never from `lesson`.
- `projectRecap(assignment, enrolledLearners, attempts)`: one recap per assignment, over learners with an active enrollment in its course (ADR 0007), keyed by concept ID of the current assignment (ADR 0005).
- `grant` writes a completion record per learner and assignment.

**Seed** (ADR 0006)
- Replace `seedSamples` with `seedDemo`, guarded by the `demo-seeded` setting. It creates the course "Calculus 1 · Rates of change" with join code `FEYN01`, taught by the first `TEACHER_EMAILS` address, posts cart-speed (content from today's `lesson.ts`) as an ordinary assignment, enrolls Maya, Noah, Eli and June, and writes their authored attempts with rubric copies.
- Delete `server/lesson.ts`. Move the cart-speed text into the seed.

**Routes**: temporarily resolve "the assignment" to the demo course's cart-speed so the existing client keeps working.

**Done when** `npm test` and `npm run typecheck` pass with tests updated for dynamic concept counts, and the app looks and behaves as before.

## 2. Student courses

**Server**
- `GET /api/courses`: the student's active enrollments, with each course's posted assignments and the student's completion per assignment.
- `POST /api/courses/join { code }`: enroll or restore an ended enrollment. Unknown codes return 404 with a plain message.
- `POST /api/courses/:id/leave`: set `endedAt`.
- `GET /api/assignments/:id/bootstrap` replaces `/api/bootstrap`: rubric, completion, own attempts for that assignment, providers. Requires an active enrollment.
- Attempt routes check that the attempt's assignment belongs to a course the learner is enrolled in, on top of today's ownership check.
- Walkthrough learner becomes `walkthrough:<learnerId>:<courseId>` (ADR 0006).

**Client**
- Student home lists course cards and a **Join a course** field.
- Course page: the existing stream view, populated from the course's posted assignments, with a **Leave course** action behind a confirm.
- Assignment page and scene take the rubric from the assignment bootstrap. Pip's profile comes from the rubric.

**Done when** a fresh student account can join with `FEYN01`, finish cart-speed, see completion survive reload, leave, rejoin, and see history restored.

## 3. Teacher courses

**Server** (ADR 0003)
- On startup, insert missing `TEACHER_EMAILS` addresses into the `teacher` kind.
- The session stores identity only. `auth.ts` resolves the role on each request from the teacher list. `Me.role` is computed per request.
- `POST /api/teachers { email }`: any teacher adds a teacher.
- `POST /api/courses { title }`: teacher only. Generates a 6-character join code from an unambiguous alphabet, retried on collision.
- `GET /api/teacher/courses/:id`: course, roster, join code, assignments with per-assignment summary ("12 of 20 completed · 2 concepts with current gaps").
- `POST /api/teacher/courses/:id/code`: issue a new join code.
- `POST /api/teacher/courses/:id/remove { learnerId }`: end the enrollment.
- `GET /api/teacher/assignments/:id`: today's teacher's desk payload scoped to one assignment. Recap draft and review routes check that the teacher teaches the attempt's course.
- Remove the global `profile` setting and `PUT /api/profile`.

**Client**
- Teacher home lists their courses and **Create course**, plus a small **Add teacher** form.
- Teacher course page: join code with copy and regenerate, roster with remove, assignment list with summaries.
- The existing `Teacher.tsx` desk opens per assignment and reads concept titles from the attempt's rubric copy.

**Done when** two teacher accounts each see only their own course's evidence, verified by an HTTP test, and a removed student disappears from the recap but their attempts stay visible.

## 4. Assignment form

**Server**
- `POST /api/teacher/courses/:id/assignments`: create a draft.
- `PUT /api/teacher/assignments/:id`: edit a draft, or a posted assignment that is unlocked. Validate the rubric with zod, 1–5 concepts, 1–2 follow-ups. Concept IDs are slugs of the concept title; a changed title gets a new ID (ADR 0005).
- `POST /api/teacher/assignments/:id/post`.

**Client**
- One form: title, question, reference, Pip's profile, due date, concepts (title + description, add/remove up to 5), follow-ups (question + expected answer, concept checkboxes, second one removable). Save draft and Post buttons.

**Done when** a teacher writes a new assignment by hand, posts it, and a student completes it with a live U-Bot assessment against those concepts.

## 5. U-Bot drafting (ADR 0004)

- `POST /api/teacher/assignments/:id/draft { question, reference }` asks U-Bot, through the existing `server/ubot.ts` chat call, for three concepts and two follow-ups as JSON. Validate the reply with the rubric schema and return it without saving.
- The form gets **Draft with U-Bot**, which fills empty concept and follow-up fields, labelled "Drafted by U-Bot — review before posting".
- On any provider or validation error, show the error and leave the form editable.
- Tests use a stubbed U-Bot reply like `tests/ubot.test.ts`, covering a valid reply, malformed JSON and an over-long concept list.

**Done when** a teacher can create a course, draft an assignment with U-Bot, edit it and post it in under two minutes.

## 6. Lock, due dates, MCP, docs

- **Lock** (ADR 0005): the first submitted main answer sets `locked`. **Unlock to edit** clears it, saving re-locks it and bumps `revision`. The teacher's desk labels attempts whose rubric copy revision is older.
- **Due date**: shown on cards and the assignment page. No enforcement.
- **MCP** (ADR 0007): add `list_courses`. Existing tools take `courseId` or `assignmentId`.
- **Docs**: update `README.md`, `ARCHITECTURE.md` and `IMPLEMENTATION-STATUS.md` for courses, the teacher collection and the removed `lesson.ts`.

## Verification each milestone

Run `npm test`, `npm run typecheck` and `npm run build`. Then drive the browser through that milestone's "done when" path at desktop and narrow widths, and fix what fails before starting the next milestone. Deploy to Vercel after milestones 2, 3 and 4 so a working version is always live.

## Risks

- **Deadline.** The event brief gives 14:00 Bangkok time on 16 October. Milestones 1–4 are the shippable core; 5 and 6 follow only if time remains.
- **Existing MongoDB data.** Attempts without `assignmentId` fail the new schema. Use a fresh database name (`MONGODB_DB=feyn-courses`) instead of migrating.
- **U-Bot's chat endpoint** is unpublished. The hand-written form is the fallback by design.
- **Whole-collection reads** continue. That's fine for a demo, and noted in the README.
