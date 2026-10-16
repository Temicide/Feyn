# Teaching scene architecture

## Usage

The student records an English explanation, reviews its words, and submits. The server preserves the original evidence, assesses the main explanation, and returns scene material. The classroom asks one or two follow-ups. The teacher reviews the same saved evidence and current concept summary.

## Shape

Use React and TypeScript with Vite for the browser and a small TypeScript Node server, deployed as one Vercel function. The server owns durable evidence and policy. MongoDB holds records, settings, and original audio in GridFS. The browser owns microphone lifetime, dialogue playback, and presentation only.

An assignment is a stored record in a teacher's course. It holds the question, reference, one to five essential concepts with slug IDs, and one or two follow-up definitions. Each attempt keeps a copy of that rubric from the moment it starts, and results and reviews are read against the copy. Main and diagnostic assessments use separate types and write paths. Derive completion from an earned grant and never revoke it during optional retries. Derive current concept status independently from the latest usable evidence and teacher review. Unknown or failed providers never become a conceptual-failure assessment.

Keep modules shallow in number and deep in capability. shared/contracts.ts owns validated domain/request schemas. server/courses.ts owns the teacher list, courses, join codes, enrollments, course posts and the assignment lifecycle (draft, post, lock, unlock). server/rubric.ts turns form input into concept IDs and rubric copies. server/seed.ts syncs TEACHER_EMAILS and seeds the demo course and the Let's Get Started tutorial course once. server/attempts.ts owns transcript correction policy, completion, teacher revisions, and class projections over records. server/store.ts owns the one RecordStore seam with an in-memory and a MongoDB implementation. server/auth.ts owns sessions and Google sign-in; the role is resolved from the teacher collection on each request. server/providers.ts owns remote protocols and external response parsing. server/main.ts owns HTTP and MCP transport, enrollment checks and course-scoped teacher access. api/index.ts adapts the app to Vercel and reports missing configuration. client modules render views and handle audio; they cannot import server code.

Corrections are ordered operations over stable word positions. Each accepted replacement consumes one of three operations, including another replacement at the same position. Preserve the original transcript/audio and every before/after correction. Derive the reviewed transcript. Never permit whole-paragraph insertion via the correction route.

Require every criterion of the attempt's rubric exactly once in provider results. Evidence quotes must actually occur in the submitted transcript. Compute the accepted main result from criterion states rather than trusting an unconstrained pass flag. Do not let a diagnostic route update the main result. Keep ambiguous transcript evidence distinct from clear mistakes.

Bind asynchronous work to answer/attempt identity so late results cannot attach to a replacement recording. Keep persistence behind RecordStore: list by kind in insertion order, upsert by id, settings, and audio. Avoid a generic repository, plugin registry, or event bus.

Identify each learner by the signed-in account (google:<sub>). Each learner's sample walkthrough belongs to a separate labeled learner per course, walkthrough:<learner id>:<course id>, so it can never grant that learner's completion. Completion is a record per learner and assignment and is never revoked. Seed the demo course and its authored classmates once per database. A student reaches only their own attempts in courses they are enrolled in. A teacher reads evidence only from courses they teach, and owns reviews and Pip's personality, which is set per assignment.

## Why the server owns attempts

Browser-owned IndexedDB sessions were considered and rejected because teacher inspection and original recordings are core deliverables. The separate main/diagnostic types and the ordered correction-operation log came from that alternative. The agreed design is in docs/design/.

## Providers

U-Bot is the assessor, and evidence retains that provider name. Credentials stay in ignored server configuration. U-Bot has no MCP client or connector setting. server/ubot.ts signs in through U-Bot's own Supabase password login and posts to its private /api/chat endpoint. server/providers.ts sends each assessment through that chat and validates the JSON reply, and the class recap plan uses the same call. Assessment sends the transcript to U-Bot, while the recap sends only names-free counts. That endpoint is unpublished and can change without notice. Provider errors remain operational errors rather than conceptual failures.

Expose a standards-based MCP endpoint over the same application owner, only to clients holding MCP_TOKEN. A server endpoint is not evidence of a connected U-Bot host.

## Verification

Check policy with rerunnable behavior tests. Check real structured assessment separately from sample scene playback. Drive the actual browser workflow and inspect the classroom on desktop and narrow viewports. Check persisted audio, original/edited transcripts, teacher revisions, separate follow-ups, and completion after reload. A labeled sample transcript can exercise live assessment but cannot prove ElevenLabs transcription.
