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
- A local read-only MCP endpoint, including a names-free class recap tool.
- A Chrome extension that lets U-Bot call those tools through a JSON chat protocol, one click per tool run.

## Remaining work

U-Bot has no native MCP client, so the bridge relies on U-Bot following a chat protocol. The bridge panel ran inside a signed-in u.bot page; a full U-Bot round trip awaits the operator's clicks. The current live assessor is the configured Local AI gateway.

Automatic individual support flags are deferred until the system can record a fresh application question and evidence that the same specific misconception persists after a review opportunity. Current concept gaps remain visible for the teacher's recap. Repeated main submissions or a missed optional question alone must not trigger intervention.

Accounts, class enrollment, assignment authoring, custom avatars, diagnostic teacher overrides, unfinished-scene resume, and production authorization are outside this first proof. The server runs locally on loopback.

The happy path has been exercised with synthetic audio and actual providers. Broader adversarial assessment evaluation, accessibility evaluation with learners, and real classroom validation remain future work. Restricted transcript editing and spoken follow-ups can provide useful evidence; they do not prove that cheating is prevented or understanding is established reliably.

## Rerun verification

Run `npm test` and `npm run build` from the repository root. With the app running and both providers configured, run `node scripts/verify-live.mjs`. The live verifier uses the separate walkthrough learner, retains original audio, and asserts that real-learner completion is unchanged. It sends synthetic audio to ElevenLabs and text to the configured assessor, which may incur provider charges.

The accepted design is preserved in [docs/design](design/teaching-scene.md). It includes planned behavior beyond this implementation.
