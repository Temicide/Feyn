<p align="center">
  <img src="public/brand/feyn-logo.png" alt="Feyn" width="200">
</p>

Feyn is a web app where a student explains an idea aloud to Pip, a pixel-art classroom character, and a teacher reviews the recording and the assessment. Teachers run courses and post assignments. Students join a course with a code.

- A student records an explanation or uploads audio. ElevenLabs transcribes it, and U-Bot assesses it against the teacher's essential concepts.
- A teacher inspects each attempt, adds a review note, and reads a per-assignment class recap.
- The classroom and all character art are original.

This is a proof of concept. [Implementation status](docs/IMPLEMENTATION-STATUS.md) lists what works and what is deferred.

## Quick start

You need Node.js 24 or newer.

```sh
git clone https://github.com/Temicide/Feyn.git
cd Feyn
npm install
DEV_LOGIN=1 TEACHER_EMAILS=teacher@example.com npm run dev
```

Open <http://127.0.0.1:5173>. Vite serves the browser on port 5173 and proxies `/api` and `/mcp` to the API server on port 4173. Press Ctrl+C to stop both.

With `DEV_LOGIN=1`, the sign-in page offers local test accounts and needs no Google credentials.

1. Sign in as `teacher@example.com` to open the **Teacher's desk**.
2. Sign in with any other email to act as a student. Enter the join code `FEYN01` under **Join a course**.
3. Open the assignment and select **Try the sample walkthrough**. This needs no microphone and no provider keys.

A fresh database holds two courses. **Calculus 1 · Rates of change** is the demo course. **Let's get started** (join code `HELLO1`) is a tutorial that explains Feyn to new students.

Without `MONGODB_URI`, records stay in memory and disappear when the API restarts.

## Configuration

Copy `.env.example` to `.env` and fill in the values. The API loads `.env` at startup. Variables already set in the process environment take precedence. Restart the API after you change a value.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `MONGODB_URI` | Vercel, persistent storage | Unset locally to keep records in memory. |
| `MONGODB_DB` | Optional | Database name. Defaults to `feyn`. |
| `SESSION_SECRET` | Vercel | Random string of at least 32 characters. Signs session cookies. |
| `APP_ORIGIN` | Vercel | Exact public origin, such as `https://feyn.example.com`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in | Web application OAuth client. |
| `TEACHER_EMAILS` | Teacher access | Comma-separated. Copied into the teacher list at startup. The first address teaches the demo course. |
| `DEV_LOGIN` | Local development | Set to `1` for local test accounts. Ignored on Vercel. |
| `ELEVENLABS_API_KEY` | Live transcription | ElevenLabs Scribe v2. |
| `UBOT_EMAIL`, `UBOT_PASSWORD`, `UBOT_SUPABASE_ANON_KEY` | Live assessment, drafts | U-Bot account that assesses explanations and drafts recaps and assignments. |
| `MCP_TOKEN` | MCP endpoint | Bearer token for `/mcp`. Unset turns the endpoint off. |

To use Google sign-in locally, add `http://127.0.0.1:5173/api/auth/callback` as an authorized redirect URI and set `APP_ORIGIN=http://127.0.0.1:5173`.

## Deploy to Vercel

1. Create a MongoDB database, such as a MongoDB Atlas cluster, and allow connections from Vercel.
2. In Google Cloud Console, create an OAuth client of type **Web application**. Add `https://<your-domain>/api/auth/callback` as an authorized redirect URI.
3. Import the repository into Vercel. `vercel.json` sets the build command, the `dist` output directory, and the rewrites. `api/index.ts` serves every `/api/*` request and `/mcp`.
4. In the Vercel project settings, set `MONGODB_URI`, `SESSION_SECRET`, `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `TEACHER_EMAILS`. Add the optional variables from the table as you need them.

If `MONGODB_URI`, `SESSION_SECRET`, or `APP_ORIGIN` is missing, every API request returns HTTP 500 and names the missing variable. The app refuses requests whose host is not `APP_ORIGIN`, including preview deployment URLs.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the API and the Vite dev server with reload. |
| `npm test` | Runs the test suite against the in-memory store. |
| `npm run typecheck` | Runs `tsc --noEmit`. |
| `npm run build` | Typechecks, then builds the browser app into `dist`. |
| `npm start` | Serves the production build and the API on port 4173. Set `PORT` to change it. |

To run the tests against MongoDB, set `MONGODB_TEST_URI`. The tests create a throwaway database and drop it afterward.

```sh
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test
```

## Project layout

| Path | Contents |
| --- | --- |
| `client/` | React browser app. |
| `server/` | Express API, attempt policy, rubric, provider clients, MongoDB store. |
| `api/index.ts` | Vercel function entry point. |
| `shared/contracts.ts` | Types shared by the client and the server. |
| `tests/` | Tests for policy, storage, providers, HTTP, and Vercel configuration. |
| `scripts/verify-live.mjs` | End-to-end check against real providers. |
| `public/` | Brand, character art, and sample audio. |

## Documentation

- [Feyn guide](docs/guide.md) covers roles, providers, courses, assignments, teacher evidence, the MCP endpoint, and data limits.
- [Architecture](ARCHITECTURE.md) explains the teaching scene and why the server owns attempts.
- [Design decisions](docs/design/adr/) records each architecture decision.
- [Glossary](docs/design/GLOSSARY.md) defines the project's terms.
- [Implementation status](docs/IMPLEMENTATION-STATUS.md) lists what is built and what remains.
