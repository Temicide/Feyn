# Run Feyn locally

Feyn lets a student explain a calculus idea aloud to Pip, then lets a teacher inspect the recording and assessment. The classroom and all character art are original.

## Start the app

Use Node.js 26 or newer. The server uses Node's built-in SQLite module.

```sh
git clone https://github.com/Temicide/Feyn.git
cd Feyn
npm install
npm run dev
```

Open [Feyn at localhost](http://127.0.0.1:5173). Vite serves the browser on port 5173 and proxies API calls to the loopback server on port 4173. Both processes stop with Ctrl+C.

The **Your classroom** tab contains the lesson. The **Teacher's desk** tab shows saved evidence and the class recap. The teacher selects Pip's Curious or Playful profile for new attempts.

## Configure live providers

Copy `.env.example` to `.env` at the repository root, then set your provider values. The server loads this file at startup. Restart the server after changing it. Keep credentials on the server.

```dotenv
ELEVENLABS_API_KEY=your-elevenlabs-key
ANTHROPIC_BASE_URL=http://your-local-compatible-gateway
ANTHROPIC_API_KEY=your-gateway-key
ANTHROPIC_MODEL=your-configured-proxy-model
```

The running environment can also supply these variables. Existing process environment values take precedence over the file.

Live recording and audio upload use ElevenLabs batch speech recognition with `scribe_v2` and English language code `eng`. Assessment uses the configured Anthropic-compatible Messages endpoint and is labeled **Local AI gateway**. The application does not claim a native Anthropic model identity or an established U-Bot connection.

Use **Enter the classroom** to record through the microphone or upload an existing audio recording. Upload sends the actual audio to ElevenLabs. It does not accept a typed explanation. Review the transcript, optionally replace up to three individual words, then select **Send to Pip**. Submitted evidence is immutable. Larger changes require a new recording.

The first application question is required. The second is optional. A correct main explanation earns completion independently of either diagnostic answer. Later practice can update the current evidence without removing earned completion.

Provider setup and request failures remain operational errors. An unreachable provider is named in the error message. A missing key never creates a transcript or a conceptual-failure assessment. The original uploaded recording remains saved when transcription fails, and **Retry transcription** can process it after setup is repaired.

## Try the sample walkthrough

Select **Take a clearly labeled sample walkthrough** on the lesson page. Then select **Use the prepared sample transcript** in the recording panel. The scene offers prepared follow-up transcripts as well.

Sample attempts belong to the separate **You · walkthrough** learner. They cannot grant the real learner's completion or change that learner's current concept evidence. The sample transcripts have no original recording attached. A configured gateway assesses the prepared words. Without a configured gateway, the sample uses an explicitly labeled scripted assessment.

The file `public/sample-audio/main.wav` is synthetic spoken example audio. It is separate from the prepared transcript fixture. To check real speech recognition, upload the WAV through **Upload a recording**. The resulting transcript comes from ElevenLabs and may differ from the prepared sample words. Choose the live classroom path if you want that recording to belong to the real learner.

Maya, Noah, Eli, and June in the teacher's desk are authored example classmates. They illustrate a current gap, a persistent gap, a resolved gap, and missing evidence. They are not classroom validation or evidence of a learning benefit.

## Inspect teacher evidence

Open **Teacher's desk**, select a saved attempt, and inspect the original audio, original transcript, submitted transcript, ordered word corrections, criteria, diagnostic answers, and provider timestamps. Add a review note and accept or correct the interpretation. Reviews are preserved in an audit history.

The class recap counts each learner once per concept using the latest usable timestamped main, diagnostic, or teacher-review observation. A resolving diagnostic can clear a current gap while a wrong diagnostic can expose one. Neither changes the main result. Missing or unclear evidence stays separate. Automatic individual help flags are deferred. Repeated main-explanation gaps alone do not establish that a specific misconception persisted after a fresh application question without meaningful progress. The recap still shows current gaps, and the teacher can inspect the evidence to decide who needs support. No optional question or choice not to retry creates a help flag.

## Verify the app

```sh
npm test
npm run typecheck
npm run build
```

The policy tests run against real in-memory SQLite. They cover completion with a wrong diagnostic, weaker retries, sample separation, ordered corrections and immutable originals, invalid model evidence, late assessment responses, timestamped concept recap, conservative support deferral, microphone lifetime, loopback Host and Origin restrictions, and required or bounded follow-ups.

To serve the production build on one port, stop the development processes, then run the following commands.

```sh
npm run build
npm start
```

Open [the production app](http://127.0.0.1:4173). Set `PORT` to serve on another loopback port. The development proxy expects 4173.

## Attach a local MCP client

The server exposes a stateless Streamable HTTP MCP endpoint at `http://127.0.0.1:4173/mcp`. It supports `initialize`, `ping`, `tools/list`, and `tools/call` with protocol version `2025-03-26`.

The read tools are `get_assignment`, `get_class_recap`, `list_attempts`, and `get_teacher_evidence`. `get_class_recap` returns per-concept counts without learner names. They read the same persisted records and policy projection as the app. A client must support Streamable HTTP with JSON responses. There is no SSE subscription or standalone stdio transport.

U-Bot has no MCP client. The [Feyn bridge extension](extension/README.md) lets U-Bot request these tools through a JSON chat protocol. Each tool run and each message needs a click in the bridge panel. Feyn accepts `chrome-extension://` origins on `/mcp` only.

## Local data and limits

SQLite records live in `data/lesson.sqlite`, and original recordings live in `data/audio/`. The database and audio survive server restarts. `.env`, `data/`, `.audit/`, `node_modules/`, and `dist/` are ignored by Git. Browser reloads retain earned completion and teacher evidence. An unfinished scene's presentation position is not restored after reload.

This is a local, single-learner prototype. It has no sign-in, enrollment, assignment editor, production authorization, or remote deployment. The app and MCP server bind to loopback. The teacher's desk is available to anyone who can access this local app. Do not expose the server publicly without adding authentication and authorization.

The interface uses hosted Google fonts with system fallbacks. Microphone capture requires browser permission. Uploading an audio file is an alternate input method. Audio uploads are limited to 25 MB. Full spoken child dialogue is not included; optional character blips are muted by default and pause during recording.
