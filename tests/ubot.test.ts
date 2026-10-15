import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { draftRecap, draftRubric, ubotConfig, type ClassRecapCounts } from "../server/ubot.js";

const config = { email: "teacher@example.com", password: "secret", anonKey: "anon" };
const recap: ClassRecapCounts = {
  learners: 6,
  sampleLearners: 5,
  concepts: [
    { concept: "An interval or a moment", currentGaps: 3, resolved: 1, demonstrated: 1, unassessed: 2 },
  ],
};

test("U-Bot is disabled until all three credentials are configured", () => {
  assert.equal(ubotConfig({ UBOT_EMAIL: "teacher@example.com", UBOT_PASSWORD: "x" }), null);
  assert.deepEqual(
    ubotConfig({ UBOT_EMAIL: "teacher@example.com", UBOT_PASSWORD: "x", UBOT_SUPABASE_ANON_KEY: "k" }),
    { email: "teacher@example.com", password: "x", anonKey: "k" },
  );
});

test("a recap draft signs in, sends only class counts, and strips U-Bot status markers", async (t) => {
  const calls: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return calls.length === 1
      ? Response.json({ access_token: "session-token" })
      : new Response("[STATUS:thinking]Start with interval versus moment.");
  });
  const draft = await draftRecap(config, "What is the speed at three seconds?", recap);
  const [login, chat] = calls;
  assert.ok(login && chat);
  assert.match(login.url, /grant_type=password$/);
  assert.equal(new Headers(login.init.headers).get("apikey"), "anon");
  assert.equal(chat.url, "https://u.bot/api/chat");
  assert.equal(new Headers(chat.init.headers).get("authorization"), "Bearer session-token");
  const body = JSON.parse(String(chat.init.body));
  assert.equal(body.mode, "professional");
  assert.match(body.userText, /An interval or a moment: 3 current gaps/);
  assert.match(body.userText, /5 of them illustrative sample records/);
  assert.equal(draft.text, "Start with interval versus moment.");
  assert.equal(draft.provider, "U-Bot (unofficial chat API)");
});

test("U-Bot failures are named operational errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 400 }));
  await assert.rejects(draftRecap(config, "q", recap), { message: /^U-Bot sign-in failed with HTTP 400\.$/ });
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(draftRecap(config, "q", recap), { message: /^U-Bot could not be reached during sign-in\./ });
});

test("a garbled U-Bot reply is rejected instead of shown", async (t) => {
  let n = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++n === 1 ? Response.json({ access_token: "t" }) : new Response("aaaa[DEGENERATE]"),
  );
  await assert.rejects(draftRecap(config, "q", recap), { message: /unusable reply/ });
});

function stubReply(t: import("node:test").TestContext, reply: string) {
  let n = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++n === 1 ? Response.json({ access_token: "t" }) : new Response(reply),
  );
}
const concept = (title: string) => ({ title, description: `${title} in the student's words.` });
const followup = (concepts: number[]) => ({ question: "Why?", expected: "Because.", concepts });

test("a rubric draft returns three concepts and two follow-ups without saving them", async (t) => {
  stubReply(
    t,
    "[STATUS:thinking]```json\n" +
      JSON.stringify({
        concepts: [concept("Cause"), concept("Effect"), concept("Example")],
        followups: [followup([0, 1]), followup([2])],
      }) +
      "\n```",
  );
  const draft = await draftRubric(config, "Why do seasons change?", "Earth's axis is tilted.");
  assert.deepEqual(draft.concepts.map((c) => c.title), ["Cause", "Effect", "Example"]);
  assert.deepEqual(draft.followups.map((q) => q.concepts), [[0, 1], [2]]);
  assert.equal(draft.provider, "U-Bot (unofficial chat API)");
});

test("a malformed, over-long or mis-pointed rubric draft is refused", async (t) => {
  const unreadable = { message: /returned a draft Feyn could not read/ };
  stubReply(t, "Sure! Here are some ideas.");
  await assert.rejects(draftRubric(config, "q", "r"), unreadable);
  stubReply(
    t,
    JSON.stringify({
      concepts: ["a", "b", "c", "d", "e", "f"].map(concept),
      followups: [followup([0])],
    }),
  );
  await assert.rejects(draftRubric(config, "q", "r"), unreadable);
  stubReply(
    t,
    JSON.stringify({ concepts: [concept("Only")], followups: [followup([3])] }),
  );
  await assert.rejects(draftRubric(config, "q", "r"), unreadable);
});

test("only teachers can draft a recap, and U-Bot receives counts without learner names", async (t) => {
  const { once } = await import("node:events");
  const { request } = await import("node:http");
  const { createApp } = await import("../server/main.js");
  const { MemoryStore } = await import("../server/store.js");
  const base = {
    SESSION_SECRET: "ubot-route-test-secret",
    APP_ORIGIN: "https://feyn.example",
    TEACHER_EMAILS: "teacher@school.test",
    DEV_LOGIN: "1",
  };
  const ubotEnv = { UBOT_EMAIL: "teacher@school.test", UBOT_PASSWORD: "x", UBOT_SUPABASE_ANON_KEY: "anon" };
  async function serve(env: Record<string, string>) {
    const server = createApp(new MemoryStore(), env).listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => server.close());
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener.");
    return (path: string, method = "GET", cookie = "", body: unknown = {}) =>
      new Promise<{ status: number; cookie: string; body: unknown }>((resolve, reject) => {
        const req = request(
          `http://127.0.0.1:${address.port}${path}`,
          {
            method,
            headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173", cookie, "content-type": "application/json" },
          },
          (response) => {
            let text = "";
            response.on("data", (chunk) => (text += chunk));
            response.on("end", () =>
              resolve({
                status: response.statusCode ?? 0,
                cookie: (response.headers["set-cookie"] ?? []).find((c) => c.startsWith("feyn_session="))?.split(";")[0] ?? "",
                body: response.headers["content-type"]?.includes("json") ? JSON.parse(text) : text,
              }),
            );
          },
        );
        req.on("error", reject);
        req.end(method === "POST" ? JSON.stringify(body) : undefined);
      });
  }
  const sent: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    sent.push(String(init.body));
    return url.includes("supabase") ? Response.json({ access_token: "t" }) : new Response("Revisit interval versus moment.");
  });
  const call = await serve({ ...base, ...ubotEnv });
  const teacher = (await call("/api/auth/dev?email=teacher%40school.test&name=Ms%20T")).cookie;
  const student = (await call("/api/auth/dev?email=kid%40school.test&name=Kid")).cookie;
  const desk = "/api/teacher/assignments/cart-speed";
  assert.equal((await call(`${desk}/recap-draft`, "POST", student)).status, 403);
  await call("/api/courses/join", "POST", student, { code: "FEYN01" });
  const view = z
    .object({ ubot: z.boolean(), learners: z.array(z.object({ name: z.string() })) })
    .parse((await call(desk, "GET", teacher)).body);
  assert.equal(view.ubot, true);
  const roster = view.learners.map((l) => l.name);
  assert.ok(roster.includes("Kid"), "students are in the class roster");
  assert.equal(roster.includes("Ms T"), false, "teachers are not counted as learners");
  const draft = await call(`${desk}/recap-draft`, "POST", teacher);
  assert.equal(draft.status, 200);
  assert.equal((draft.body as { text: string }).text, "Revisit interval versus moment.");
  const chat = sent.at(-1) ?? "";
  assert.match(chat, /current gaps/);
  for (const name of ["Maya", "Noah", "Eli", "June", "Kid", "Ms T"]) assert.equal(chat.includes(name), false, `omits ${name}`);
  const plain = await serve(base);
  const plainTeacher = (await plain("/api/auth/dev?email=teacher%40school.test&name=Ms%20T")).cookie;
  assert.equal((await plain(`${desk}/recap-draft`, "POST", plainTeacher)).status, 404);
});
