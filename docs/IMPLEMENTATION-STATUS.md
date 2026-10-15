# Feyn proof of concept

Feyn implements one English lesson. A learner explains the cart-speed problem to Pip, answers a spoken application question, and finishes a classroom scene. A teacher can inspect the evidence and prepare a concept recap.

## Implemented

- Microphone recording and audio-file upload with actual ElevenLabs transcription when configured.
- Three ordered word corrections per answer, with original recordings and transcripts preserved.
- Assessment against the three essential concepts, with transcript quotes and provider identity.
- Original pixel classroom, character portraits, typewriter dialogue, processing dots, Curious and Playful profiles, and endings tied to the main result.
- One required application answer and an optional second answer. Incorrect diagnostic answers do not revoke main-explanation completion.
- Durable recordings, separate main and diagnostic results, teacher review history, and the latest usable concept evidence.
- A clearly labeled sample walkthrough and authored example classmates. Synthetic audio fixtures do not demonstrate a learning benefit.
- Google sign-in with student and teacher roles, MongoDB storage, and Vercel hosting.
- A read-only MCP endpoint behind a bearer token, including a names-free class recap tool.

## Remaining work

U-Bot has no native MCP client. The Chrome extension bridge is retired. Teachers can ask U-Bot to draft the class recap plan from names-free concept counts through U-Bot's unpublished chat endpoint. It is tested against stubbed U-Bot replies; a live U-Bot call awaits the operator's U-Bot credentials.

Automatic individual support flags are deferred until the system can record a fresh application question and evidence that the same specific misconception persists after a review opportunity. Current concept gaps remain visible for the teacher's recap. Repeated main submissions or a missed optional question alone must not trigger intervention.

Class enrollment, assignment authoring, custom avatars, diagnostic teacher overrides, and unfinished-scene resume are outside this first proof. Roles come from one TEACHER_EMAILS list rather than per-class membership.

The happy path has been exercised with synthetic audio and actual providers. Broader adversarial assessment evaluation, accessibility evaluation with learners, and real classroom validation remain future work. Restricted transcript editing and spoken follow-ups can provide useful evidence; they do not prove that cheating is prevented or understanding is established reliably.

## Rerun verification

Run `npm test` and `npm run build` from the repository root. With the app running with `DEV_LOGIN=1`, a teacher email, `MCP_TOKEN`, and both providers configured, run `MCP_TOKEN=<token> node scripts/verify-live.mjs`. The live verifier uses the separate walkthrough learner, retains original audio, and asserts that real-learner completion is unchanged. It sends synthetic audio to ElevenLabs and text to the configured assessor, which may incur provider charges.

The accepted design is preserved in [docs/design](design/teaching-scene.md). It includes planned behavior beyond this implementation.
