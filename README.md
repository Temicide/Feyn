# Feyn

Feyn lets a student explain an idea aloud to Pip, then lets a teacher inspect the recording and assessment. Teachers run courses, students join them with a code, and a teacher posts assignments by hand or with a U-Bot draft. The classroom and all character art are original.

Students and teachers sign in with Google. Records live in MongoDB, and the app is hosted on Vercel.

## Start the app locally

Use Node.js 24 or newer.

```sh
git clone https://github.com/Temicide/Feyn.git
cd Feyn
npm install
DEV_LOGIN=1 TEACHER_EMAILS=teacher@example.com npm run dev
```

Open [Feyn at localhost](http://127.0.0.1:5173). A fresh database holds one demo course, **Calculus 1 · Rates of change**, with join code `FEYN01`. Vite serves the browser on port 5173 and proxies `/api` and `/mcp` to the API server on port 4173. Both processes stop with Ctrl+C.

Without `MONGODB_URI`, records stay in memory and disappear when the API restarts. Without Google credentials, the sign-in page offers a local test account when `DEV_LOGIN=1`. Sign in as `teacher@example.com` to open the **Teacher's desk**. Any other email signs in as a student, who can enter `FEYN01` under **Join a course**.

To use real storage and Google sign-in locally, copy `.env.example` to `.env` and fill in the values. `.env.example` explains each variable in one line. The API loads `.env` at startup, and existing process environment values take precedence. Restart the API after changing it.

## Deploy to Vercel

1. Create a MongoDB database, for example a MongoDB Atlas cluster, and allow connections from Vercel.
2. In Google Cloud Console, create an OAuth client of type **Web application**. Add `https://<your-domain>/api/auth/callback` as an authorized redirect URI. Add `http://127.0.0.1:5173/api/auth/callback` too if you want Google sign-in during local development.
3. Import the repository into Vercel. `vercel.json` sets the build command, the `dist` output directory, and the rewrites. `api/index.ts` serves every `/api/*` request and `/mcp`.
4. In the Vercel project settings, set `MONGODB_URI`, `SESSION_SECRET`, `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `TEACHER_EMAILS`. Set `MONGODB_DB`, `MCP_TOKEN`, `ELEVENLABS_API_KEY`, `UBOT_EMAIL`, `UBOT_PASSWORD`, and `UBOT_SUPABASE_ANON_KEY` as needed. `APP_ORIGIN` must be the exact public origin, such as `https://feyn.example.com`.

A function missing `MONGODB_URI`, `SESSION_SECRET`, or `APP_ORIGIN` answers every API request with HTTP 500 and names the missing variable. `DEV_LOGIN` has no effect on Vercel. Requests whose host is not `APP_ORIGIN`, such as preview deployment URLs, are refused.

## Accounts and roles

Google sign-in uses the authorization code flow with state and PKCE. The server verifies the ID token's signature, issuer, audience, and verified email. The session is an HttpOnly, SameSite=Lax cookie signed with `SESSION_SECRET` and valid for seven days.

The session holds identity only. The server checks the account's email against the `teacher` collection on every request, so a new teacher takes effect without signing in again. On startup the server copies any missing `TEACHER_EMAILS` addresses into that collection, and any teacher can add another teacher's email from the teacher's desk. Everyone else is a student.

Students see only their own attempts and recordings, and only for courses they are enrolled in. A teacher reads attempts, recordings and recaps only from courses they teach. Only teachers create courses. Every state-changing request must carry an allowed `Origin`.

## Configure live providers

Live recording and audio upload use ElevenLabs batch speech recognition with `scribe_v2` and English language code `eng`. Assessment runs on U-Bot through the same unofficial chat API as the recap draft. Set `UBOT_EMAIL`, `UBOT_PASSWORD`, and `UBOT_SUPABASE_ANON_KEY`. Results are labeled **U-Bot (unofficial chat API)**.

Use **Enter the classroom** to record through the microphone or upload an existing audio recording. Recordings and uploads are limited to 4 MB because Vercel limits request bodies to 4.5 MB. The microphone records at 32 kbps, so 4 MB holds about 15 minutes of speech. Upload sends the actual audio to ElevenLabs. It does not accept a typed explanation. Review the transcript, optionally replace up to three individual words, then select **Send to Pip**. Submitted evidence is immutable. Larger changes require a new recording.

The first application question is required. The second is optional. A correct main explanation earns completion independently of either diagnostic answer. Later practice can update the current evidence without removing earned completion.

Provider setup and request failures remain operational errors. An unreachable provider is named in the error message. A missing key never creates a transcript or a conceptual-failure assessment. The original uploaded recording remains saved when transcription fails, and **Retry transcription** can process it after setup is repaired.

## Courses and assignments

A teacher creates a course and shares its six-character join code. A student who enters the code is enrolled. Leaving a course, or being removed by the teacher, ends the enrollment without deleting attempts, and rejoining with a current code restores it. The teacher can issue a new code, which disables the old one.

A teacher writes an assignment in one form: title, question, reference answer, Pip's personality, an optional due date, one to five essential concepts and one or two follow-up questions. **Draft with U-Bot** fills the empty concept and follow-up fields from the question and reference answer. The teacher reviews and edits the draft before posting, and the form works by hand when U-Bot is not configured or its reply is unusable. Students see only posted assignments. The due date is shown but never enforced.

An assignment locks when its first real student submission arrives. **Unlock to edit** lets the teacher change it, and saving locks it again and raises its revision. Every attempt keeps a copy of the rubric it started with, so results and reviews stay tied to what the student saw. A concept whose title changes gets a new ID, and the teacher's desk labels attempts made before the latest edit.

## Try the sample walkthrough

Select **Try the sample walkthrough** on an assignment page. Then select **Use the prepared sample transcript** in the recording panel. The scene offers prepared follow-up transcripts as well.

Sample attempts belong to a separate learner named after the student, such as **Ada · walkthrough**. They cannot grant the student's own completion or change that student's current concept evidence. The sample transcripts are the assignment's reference answer and expected follow-up answers, with no original recording attached. A configured assessor assesses the prepared words. Without one, the sample uses an explicitly labeled scripted assessment.

The file `public/sample-audio/main.wav` is synthetic spoken example audio. It is separate from the prepared transcript fixture. To check real speech recognition, upload the WAV through **Upload a recording**. The resulting transcript comes from ElevenLabs and may differ from the prepared sample words.

Maya, Noah, Eli, and June are authored example classmates, enrolled only in the seeded demo course. They illustrate a current gap, a persistent gap, a resolved gap, and missing evidence. They are not classroom validation or evidence of a learning benefit.

## Inspect teacher evidence

Open **Teacher's desk**, choose a course and an assignment, select a saved attempt, and inspect the original audio, original transcript, submitted transcript, ordered word corrections, criteria, diagnostic answers, and provider timestamps. Add a review note and accept or correct the interpretation. Reviews are preserved in an audit history.

Each assignment has its own class recap over its own concepts and the students currently enrolled in its course. It counts each learner once per concept using the latest usable timestamped main, diagnostic, or teacher-review observation. A resolving diagnostic can clear a current gap while a wrong diagnostic can expose one. Neither changes the main result. Missing or unclear evidence stays separate. Automatic individual help flags are deferred. Repeated main-explanation gaps alone do not establish that a specific misconception persisted after a fresh application question without meaningful progress. The recap still shows current gaps, and the teacher can inspect the evidence to decide who needs support. No optional question or choice not to retry creates a help flag.

## Draft the recap with U-Bot

With `UBOT_EMAIL`, `UBOT_PASSWORD`, and `UBOT_SUPABASE_ANON_KEY` set, the class recap shows **Draft recap with U-Bot**. The server signs in to that U-Bot account and asks U-Bot for a short recap plan. It sends only the per-concept counts and how many records are samples. No names, transcripts, or recordings leave Feyn. The reply is labeled **U-Bot (unofficial chat API)**.

U-Bot publishes no API. This uses the same sign-in and chat endpoint as the u.bot website, so a change on their side can break it. `UBOT_SUPABASE_ANON_KEY` is the public key embedded in the u.bot website. Only enrolled students count as learners in the recap.

## Verify the app

```sh
npm test
npm run typecheck
npm run build
```

The tests run the policy against the in-memory store. They cover completion with a wrong diagnostic, weaker retries, sample separation, ordered corrections and immutable originals, invalid model evidence, late assessment responses, timestamped concept recap, conservative support deferral, microphone lifetime, Host and Origin restrictions, sign-in, roles, attempt ownership, the MCP token, the upload limit, and missing Vercel configuration.

To run the same lesson flow against MongoDB, point `MONGODB_TEST_URI` at a server. The test creates a throwaway database and drops it afterwards.

```sh
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test
```

To serve the production build on one port, stop the development processes, then run the following commands.

```sh
npm run build
npm start
```

Open [the production app](http://127.0.0.1:4173). Set `PORT` to serve on another loopback port. The development proxy expects 4173.

`scripts/verify-live.mjs` exercises real providers against a running local server. Start the server with `DEV_LOGIN=1`, `TEACHER_EMAILS` starting with `FEYN_TEACHER_EMAIL` (default `teacher@example.com`, which then teaches the demo course), `MCP_TOKEN`, and both providers configured, then run `MCP_TOKEN=<token> node scripts/verify-live.mjs`. It sends synthetic audio to ElevenLabs and text to the configured assessor, which may incur provider charges.

## Attach an MCP client

Set `MCP_TOKEN` to expose a stateless Streamable HTTP MCP endpoint at `/mcp`. Clients send `Authorization: Bearer <MCP_TOKEN>`. Without `MCP_TOKEN`, `/mcp` answers 404. It supports `initialize`, `ping`, `tools/list`, and `tools/call` with protocol version `2025-03-26`.

The read tools are `list_courses`, `get_assignment`, `get_class_recap`, `list_attempts`, and `get_teacher_evidence`. The assignment tools take an `assignmentId`, and `list_attempts` takes a `courseId` or an `assignmentId`. `get_class_recap` returns per-concept counts without learner names. The other tools return the same teacher-level records as the teacher's desk, for every course, so guard the token like an administrator credential. A client must support Streamable HTTP with JSON responses. There is no SSE subscription or standalone stdio transport.

## Data and limits

MongoDB holds one collection each for learners, courses, enrollments, assignments, teachers, completions, attempts, and answers, plus `settings`, `counters`, and the GridFS bucket `audio` for original recordings. Browser reloads retain earned completion and teacher evidence. An unfinished scene's presentation position is not restored after reload.

Every request reads whole collections, which suits a demo but not a large school. Attempts saved before courses existed have no assignment and fail validation, so use a fresh database name such as `MONGODB_DB=feyn-courses` instead of migrating.

The interface uses hosted Google fonts with system fallbacks. Microphone capture requires browser permission. Uploading an audio file is an alternate input method. Full spoken child dialogue is not included; optional character blips are muted by default and pause during recording.
