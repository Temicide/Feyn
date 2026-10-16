import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { z } from "zod";
import { createApp } from "../server/main.js";
import { MemoryStore } from "../server/store.js";
import {
  assignmentSchema,
  attemptSchema,
  bootstrapSchema,
  courseSchema,
  meSchema,
  postSchema,
  studentCoursesSchema,
  teacherCourseSchema,
  teacherViewSchema,
} from "../shared/contracts.js";

const env = {
  SESSION_SECRET: "test-session-secret-for-feyn-http-tests",
  APP_ORIGIN: "https://feyn.example",
  GOOGLE_CLIENT_ID: "feyn-client-id",
  GOOGLE_CLIENT_SECRET: "feyn-client-secret",
  TEACHER_EMAILS: " Teacher@School.test , other@school.test",
  DEV_LOGIN: "1",
  MCP_TOKEN: "mcp-test-token",
};
const local = "127.0.0.1:4173";
const server = createApp(new MemoryStore(), env).listen(0, "127.0.0.1");
await once(server, "listening");
after(() => server.close());
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Expected loopback TCP listener.");
const base = `http://127.0.0.1:${address.port}`;

type Reply = { status: number; headers: Headers; body: unknown };
function call(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
  } = {},
  target = base,
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      `${target}${path}`,
      {
        method: options.method ?? "GET",
        headers: { host: local, ...options.headers },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks);
          const headers = new Headers();
          for (const [key, value] of Object.entries(response.headers))
            for (const v of [value ?? []].flat()) headers.append(key, v);
          let body: unknown = text;
          try {
            body = JSON.parse(text.toString("utf8"));
          } catch {}
          resolve({ status: response.statusCode ?? 0, headers, body });
        });
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}
function sessionCookie(reply: Reply): string {
  const cookie = reply.headers
    .getSetCookie()
    .find((c) => c.startsWith("feyn_session="));
  assert.ok(cookie, "a session cookie was set");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  return cookie.split(";")[0] ?? "";
}
async function signIn(email: string, name: string): Promise<string> {
  const reply = await call(
    `/api/auth/dev?${new URLSearchParams({ email, name })}`,
  );
  assert.equal(reply.status, 302);
  return sessionCookie(reply);
}
function json(cookie: string, method: string, body: unknown) {
  return {
    method,
    headers: {
      cookie,
      origin: `http://${local}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

const attemptBody = {
  assignmentId: "cart-speed",
  sample: false,
  reviewedOpportunity: false,
};
const desk = "/api/teacher/assignments/cart-speed";
async function enroll(cookie: string, code = "FEYN01") {
  return call("/api/courses/join", json(cookie, "POST", { code }));
}

test("rebinding hosts, foreign origins, and origin-less writes are rejected", async () => {
  for (const host of [
    "review-attacker.invalid:4173",
    "127.0.0.1.attacker.invalid:4173",
    "127.0.0.1:9999",
  ])
    assert.equal((await call("/api/me", { headers: { host } })).status, 403);
  assert.equal(
    (await call("/api/me", { headers: { origin: "https://attacker.invalid" } }))
      .status,
    403,
  );
  const cookie = await signIn("maya@school.test", "Maya Student");
  assert.equal((await enroll(cookie)).status, 200);
  const create = json(cookie, "POST", attemptBody);
  const { origin: _, ...noOrigin } = create.headers;
  assert.equal(
    (await call("/api/attempts", { ...create, headers: noOrigin })).status,
    403,
  );
  assert.equal((await call("/api/attempts", create)).status, 200);
  const deployed = await call("/api/me", {
    headers: { host: "feyn.example", origin: "https://feyn.example", cookie },
  });
  assert.equal(meSchema.parse(deployed.body).name, "Maya Student");
});

test("signed-out visitors get 401 and the sign-in options", async () => {
  const me = await call("/api/me");
  assert.equal(me.status, 401);
  assert.deepEqual(
    z.object({ google: z.boolean(), devLogin: z.boolean() }).parse(me.body),
    { google: true, devLogin: true },
  );
  for (const path of ["/api/courses", "/api/teacher/courses"])
    assert.equal((await call(path)).status, 401);
});

test("the teacher list lives in the database and is checked on every request", async () => {
  const student = await signIn("noah@school.test", "Noah");
  const teacher = await signIn("teacher@school.test", "Ms Rivera");
  assert.equal(
    (await call("/api/teacher/courses", { headers: { cookie: student } })).status,
    403,
  );
  assert.equal(
    (await call("/api/courses", json(student, "POST", { title: "Mine" }))).status,
    403,
  );
  const view = teacherViewSchema.parse(
    (await call(desk, { headers: { cookie: teacher } })).body,
  );
  for (const name of ["Maya", "Noah", "Eli", "June"])
    assert.ok(
      name === "Noah" || view.learners.some((l) => l.name === name),
      `${name} is on the demo roster`,
    );
  assert.equal(
    meSchema.parse((await call("/api/me", { headers: { cookie: teacher } })).body).role,
    "teacher",
  );
  const promoted = await signIn("new.teacher@school.test", "Mx New");
  const role = async () =>
    meSchema.parse((await call("/api/me", { headers: { cookie: promoted } })).body).role;
  assert.equal(await role(), "student");
  assert.equal(
    (await call("/api/teachers", json(student, "POST", { email: "new.teacher@school.test" }))).status,
    403,
  );
  assert.equal(
    (await call("/api/teachers", json(teacher, "POST", { email: "New.Teacher@school.test" }))).status,
    200,
  );
  assert.equal(await role(), "teacher");
});

test("a student cannot read or change another learner's attempt or audio", async () => {
  const owner = await signIn("eli@school.test", "Eli Owner");
  const other = await signIn("june@school.test", "June Other");
  const teacher = await signIn("teacher@school.test", "Ms Rivera");
  const stranger = await signIn("other@school.test", "Mr Okafor");
  await enroll(owner);
  const attempt = attemptSchema.parse(
    (await call("/api/attempts", json(owner, "POST", attemptBody))).body,
  );
  const form = new FormData();
  const bytes = Buffer.from("RIFF original recording");
  form.set("audio", new File([bytes], "a.wav", { type: "audio/wav" }));
  form.set("kind", "main");
  form.set("provenance", "uploaded-recording");
  const multipart = new Request("http://upload.invalid", {
    method: "POST",
    body: form,
  });
  const uploaded = await call(`/api/attempts/${attempt.id}/audio`, {
    method: "POST",
    headers: {
      cookie: owner,
      origin: `http://${local}`,
      "content-type": multipart.headers.get("content-type") ?? "",
    },
    body: Buffer.from(await multipart.arrayBuffer()),
  });
  assert.equal(uploaded.status, 200);
  const answerId = z
    .object({ answer: z.object({ id: z.string() }) })
    .parse(uploaded.body).answer.id;

  assert.equal(
    (await call(`/api/attempts/${attempt.id}`, { headers: { cookie: other } }))
      .status,
    404,
  );
  assert.equal(
    (
      await call(
        `/api/attempts/${attempt.id}/sample`,
        json(other, "POST", { kind: "main" }),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `/api/answers/${answerId}`,
        json(other, "PATCH", { index: 0, replacement: "Hijacked" }),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(`/api/answers/${answerId}/audio`, {
        headers: { cookie: other },
      })
    ).status,
    404,
  );
  const bootstrapPath = "/api/assignments/cart-speed/bootstrap";
  assert.equal(
    (await call(bootstrapPath, { headers: { cookie: other } })).status,
    404,
    "bootstrap needs an enrollment",
  );
  await enroll(other);
  const otherBootstrap = bootstrapSchema.parse(
    (await call(bootstrapPath, { headers: { cookie: other } })).body,
  );
  assert.equal(otherBootstrap.attempts.length, 0);
  assert.equal(otherBootstrap.assignment.id, "cart-speed");

  for (const reader of [owner, teacher]) {
    const audio = await call(`/api/answers/${answerId}/audio`, {
      headers: { cookie: reader },
    });
    assert.equal(audio.status, 200);
    assert.deepEqual(audio.body, bytes);
  }
  assert.equal(
    (
      await call(`/api/attempts/${attempt.id}`, {
        headers: { cookie: teacher },
      })
    ).status,
    200,
  );
  for (const path of [`/api/attempts/${attempt.id}`, `/api/answers/${answerId}/audio`])
    assert.equal(
      (await call(path, { headers: { cookie: stranger } })).status,
      404,
      "a teacher of another course cannot read this evidence",
    );
  assert.equal((await call(desk, { headers: { cookie: stranger } })).status, 404);
});

test("a tampered session cookie is rejected", async () => {
  const cookie = await signIn("ivy@school.test", "Ivy");
  const [name, token] = cookie.split("=");
  const [body, signature] = (token ?? "").split(".");
  const claims = JSON.parse(Buffer.from(body ?? "", "base64url").toString());
  const forged = Buffer.from(
    JSON.stringify({ ...claims, email: "teacher@school.test" }),
  ).toString("base64url");
  for (const bad of [
    `${name}=${forged}.${signature}`,
    `${name}=${body}.${signature?.slice(0, -2)}xx`,
  ]) {
    assert.equal(
      (await call("/api/me", { headers: { cookie: bad } })).status,
      401,
    );
    assert.equal(
      (await call("/api/teacher/courses", { headers: { cookie: bad } })).status,
      401,
    );
  }
});

test("Google callback verifies the ID token, creates a learner, and starts a session", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "test-key",
    alg: "RS256",
  };
  async function idToken(
    claims: Record<string, unknown>,
    audience = env.GOOGLE_CLIENT_ID,
  ) {
    return new SignJWT({
      email: "Ada@School.test",
      email_verified: true,
      name: "Ada Lovelace",
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://accounts.google.com")
      .setAudience(audience)
      .setSubject("google-sub-1234")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }
  let token = await idToken({});
  const tokenRequests: URLSearchParams[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      if (String(url) === "https://www.googleapis.com/oauth2/v3/certs")
        return Response.json({ keys: [jwk] });
      assert.equal(String(url), "https://oauth2.googleapis.com/token");
      tokenRequests.push(new URLSearchParams(String(init?.body)));
      return Response.json({ id_token: token });
    },
  );
  async function begin() {
    const start = await call("/api/auth/google");
    assert.equal(start.status, 302);
    const location = new URL(start.headers.get("location") ?? "");
    assert.equal(location.origin, "https://accounts.google.com");
    assert.equal(
      location.searchParams.get("redirect_uri"),
      "https://feyn.example/api/auth/callback",
    );
    assert.equal(location.searchParams.get("code_challenge_method"), "S256");
    const pending = start.headers
      .getSetCookie()
      .find((c) => c.startsWith("feyn_oauth="))
      ?.split(";")[0];
    assert.ok(pending);
    return { pending, location };
  }

  const { pending, location } = await begin();
  const callback = await call(
    `/api/auth/callback?code=auth-code&state=${location.searchParams.get("state")}`,
    { headers: { cookie: pending } },
  );
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), "/");
  const cookie = sessionCookie(callback);
  const sent = tokenRequests.at(-1);
  assert.equal(sent?.get("code"), "auth-code");
  assert.equal(
    createHash("sha256")
      .update(sent?.get("code_verifier") ?? "")
      .digest("base64url"),
    location.searchParams.get("code_challenge"),
  );
  assert.deepEqual(
    meSchema.parse((await call("/api/me", { headers: { cookie } })).body),
    {
      learnerId: "google:google-sub-1234",
      name: "Ada Lovelace",
      email: "Ada@School.test",
      role: "student",
    },
  );
  await enroll(cookie);
  const teacher = await signIn("teacher@school.test", "Ms Rivera");
  const roster = teacherViewSchema.parse(
    (await call(desk, { headers: { cookie: teacher } })).body,
  );
  assert.deepEqual(
    roster.learners.find((l) => l.id === "google:google-sub-1234"),
    { id: "google:google-sub-1234", name: "Ada Lovelace", sample: false },
  );

  const rejected = [
    { state: "wrong-state", token: await idToken({}) },
    { token: await idToken({ email_verified: false }) },
    { token: await idToken({}, "someone-elses-client") },
  ];
  for (const attempt of rejected) {
    token = attempt.token;
    const next = await begin();
    const failed = await call(
      `/api/auth/callback?code=c&state=${attempt.state ?? next.location.searchParams.get("state")}`,
      { headers: { cookie: next.pending } },
    );
    assert.equal(failed.headers.get("location"), "/?signin=failed");
    assert.ok(
      !failed.headers.getSetCookie().some((c) => c.startsWith("feyn_session=")),
    );
  }
});

test("MCP tools answer only to the configured bearer token", async () => {
  const listing = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  });
  const bearer = {
    "content-type": "application/json",
    authorization: "Bearer mcp-test-token",
  };
  for (const authorization of [undefined, "Bearer wrong-token"])
    assert.equal(
      (
        await call("/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(authorization ? { authorization } : {}),
          },
          body: listing,
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await call("/mcp", {
        method: "POST",
        headers: {
          ...bearer,
          origin: "chrome-extension://feynbridgeextensionid",
        },
        body: listing,
      })
    ).status,
    403,
  );
  const mcp = await call("/mcp", {
    method: "POST",
    headers: bearer,
    body: listing,
  });
  assert.equal(mcp.status, 200);
  assert.deepEqual(
    z
      .object({
        result: z.object({ tools: z.array(z.object({ name: z.string() })) }),
      })
      .parse(mcp.body)
      .result.tools.map((tool) => tool.name),
    [
      "list_courses",
      "get_assignment",
      "get_class_recap",
      "list_attempts",
      "get_teacher_evidence",
    ],
  );
  const recap = await call("/mcp", {
    method: "POST",
    headers: bearer,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_class_recap", arguments: { assignmentId: "cart-speed" } },
    }),
  });
  const text =
    z
      .object({
        result: z.object({ content: z.array(z.object({ text: z.string() })) }),
      })
      .parse(recap.body).result.content[0]?.text ?? "";
  assert.equal(
    z.object({ concepts: z.array(z.unknown()) }).parse(JSON.parse(text))
      .concepts.length,
    3,
  );
  for (const name of ["Maya", "Noah", "Eli", "June"])
    assert.equal(text.includes(name), false, `recap omits ${name}`);
});

test("without MCP_TOKEN the MCP endpoint does not exist", async () => {
  const { MCP_TOKEN: _, ...withoutToken } = env;
  const closed = createApp(new MemoryStore(), withoutToken).listen(
    0,
    "127.0.0.1",
  );
  await once(closed, "listening");
  try {
    const port = (closed.address() as { port: number }).port;
    const response = await call(
      "/mcp",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer anything",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      },
      `http://127.0.0.1:${port}`,
    );
    assert.equal(response.status, 404);
  } finally {
    closed.close();
  }
});

test("recordings over 4 MB are refused with a named limit", async () => {
  const cookie = await signIn("long@school.test", "Long Talker");
  await enroll(cookie);
  const attempt = attemptSchema.parse(
    (await call("/api/attempts", json(cookie, "POST", attemptBody))).body,
  );
  const form = new FormData();
  form.set(
    "audio",
    new File([Buffer.alloc(4 * 1024 * 1024 + 1)], "long.webm", {
      type: "audio/webm",
    }),
  );
  form.set("kind", "main");
  form.set("provenance", "microphone");
  const multipart = new Request("http://upload.invalid", {
    method: "POST",
    body: form,
  });
  const response = await call(`/api/attempts/${attempt.id}/audio`, {
    method: "POST",
    headers: {
      cookie,
      origin: `http://${local}`,
      "content-type": multipart.headers.get("content-type") ?? "",
    },
    body: Buffer.from(await multipart.arrayBuffer()),
  });
  assert.equal(response.status, 413);
  assert.match(
    z.object({ error: z.string() }).parse(response.body).error,
    /limited to 4 MB/,
  );
});

test("a student joins with a code, leaves, and gets their history back on rejoining", async () => {
  const cookie = await signIn("rejoin@school.test", "Rae Joiner");
  const courses = async () =>
    studentCoursesSchema
      .parse((await call("/api/courses", { headers: { cookie } })).body)
      .filter((c) => c.id !== "lets-get-started");
  assert.deepEqual(await courses(), []);
  const unknown = await enroll(cookie, "NOPE99");
  assert.equal(unknown.status, 404);
  assert.match(z.object({ error: z.string() }).parse(unknown.body).error, /join code/);

  assert.equal((await enroll(cookie, " feyn01 ")).status, 200);
  const [course] = await courses();
  assert.equal(course?.title, "Calculus 1 · Rates of change");
  assert.deepEqual(course?.assignments.map((a) => [a.id, a.completedAt]), [["cart-speed", null]]);

  const attempt = attemptSchema.parse(
    (await call("/api/attempts", json(cookie, "POST", { ...attemptBody, sample: true }))).body,
  );
  assert.equal(attempt.rubric.concepts.length, 3);
  assert.equal(attempt.learnerId, "walkthrough:dev:rejoin@school.test:demo-calculus-1");

  assert.equal((await call(`/api/courses/demo-calculus-1/leave`, json(cookie, "POST", {}))).status, 200);
  assert.deepEqual(await courses(), []);
  assert.equal(
    (await call("/api/assignments/cart-speed/bootstrap", { headers: { cookie } })).status,
    404,
  );
  assert.equal(
    (await call("/api/attempts", json(cookie, "POST", attemptBody))).status,
    404,
    "a student who left cannot start attempts",
  );

  await enroll(cookie);
  const restored = bootstrapSchema.parse(
    (await call("/api/assignments/cart-speed/bootstrap", { headers: { cookie } })).body,
  );
  assert.deepEqual(restored.attempts.map((a) => a.id), [attempt.id]);
});

test("each teacher sees only their own course, and a removed student leaves the recap but not the evidence", async () => {
  const ada = await signIn("teacher@school.test", "Ms Rivera");
  const bo = await signIn("other@school.test", "Mr Okafor");
  const created = courseSchema.parse(
    (await call("/api/courses", json(bo, "POST", { title: "Biology 1" }))).body,
  );
  assert.match(created.joinCode, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal(created.teacherId, "other@school.test");
  const mine = async (cookie: string) =>
    z.array(z.object({ id: z.string() })).parse(
      (await call("/api/teacher/courses", { headers: { cookie } })).body,
    ).map((c) => c.id);
  assert.deepEqual(await mine(bo), [created.id]);
  assert.deepEqual(await mine(ada), ["demo-calculus-1", "lets-get-started"]);
  const path = `/api/teacher/courses/${created.id}`;
  assert.equal((await call(path, { headers: { cookie: ada } })).status, 404);
  assert.equal((await call(`${path}/code`, json(ada, "POST", {}))).status, 404);

  const draft = assignmentSchema.parse(
    (await call(`${path}/assignments`, json(bo, "POST", {}))).body,
  );
  assert.equal(
    (await call(`/api/teacher/assignments/${draft.id}`, { headers: { cookie: ada } })).status,
    404,
  );
  const incomplete = await call(`/api/teacher/assignments/${draft.id}/post`, json(bo, "POST", {}));
  assert.equal(incomplete.status, 400);

  const student = await signIn("bio@school.test", "Bea Student");
  assert.equal((await enroll(student, created.joinCode)).status, 200);
  assert.equal((await enroll(student, "FEYN01")).status, 200);

  const rotated = courseSchema.parse(
    (await call(`${path}/code`, json(bo, "POST", {}))).body,
  );
  assert.notEqual(rotated.joinCode, created.joinCode);
  const late = await signIn("late@school.test", "Lou Late");
  assert.equal((await enroll(late, created.joinCode)).status, 404, "the old code stops working");

  const attempt = attemptSchema.parse(
    (await call("/api/attempts", json(student, "POST", { ...attemptBody, sample: false }))).body,
  );
  const before = teacherCourseSchema.parse(
    (await call(`/api/teacher/courses/demo-calculus-1`, { headers: { cookie: ada } })).body,
  );
  assert.ok(before.roster.some((r) => r.name === "Bea Student"));
  const remove = await call(
    "/api/teacher/courses/demo-calculus-1/remove",
    json(ada, "POST", { learnerId: "dev:bio@school.test" }),
  );
  assert.equal(remove.status, 200);
  const view = teacherViewSchema.parse((await call(desk, { headers: { cookie: ada } })).body);
  assert.ok(!view.roster.includes("dev:bio@school.test"));
  assert.ok(view.recap.every((row) => !row.unassessed.includes("dev:bio@school.test")));
  assert.ok(view.attempts.some((a) => a.id === attempt.id), "their attempt stays visible");
});

test("a teacher writes an assignment by hand, posts it, and a student sees its rubric", async () => {
  const teacher = await signIn("other@school.test", "Mr Okafor");
  const course = courseSchema.parse(
    (await call("/api/courses", json(teacher, "POST", { title: "Chemistry" }))).body,
  );
  const draft = assignmentSchema.parse(
    (await call(`/api/teacher/courses/${course.id}/assignments`, json(teacher, "POST", {}))).body,
  );
  const student = await signIn("chem@school.test", "Cy Student");
  await enroll(student, course.joinCode);
  assert.equal(
    (await call(`/api/assignments/${draft.id}/bootstrap`, { headers: { cookie: student } })).status,
    404,
    "students never see a draft",
  );
  const form = {
    title: "Why ice floats",
    question: "Explain why ice floats on water.",
    reference: "Ice is less dense than liquid water.",
    profile: "playful",
    dueDate: "2026-11-02",
    concepts: [
      { title: "Density", description: "Mass per volume decides floating." },
      { title: "Hydrogen bonds", description: "Bonds hold ice in an open lattice." },
    ],
    followups: [
      { question: "What if ice were denser?", expected: "It would sink.", concepts: [0] },
    ],
  };
  const save = (body: unknown) =>
    call(`/api/teacher/assignments/${draft.id}`, json(teacher, "PUT", body));
  assert.equal(
    (await save({ ...form, followups: [{ ...form.followups[0], concepts: [4] }] })).status,
    400,
  );
  const saved = assignmentSchema.parse((await save(form)).body);
  assert.deepEqual(saved.concepts.map((c) => c.id), ["density", "hydrogen-bonds"]);
  assert.deepEqual(saved.followups[0]?.conceptIds, ["density"]);
  const posted = assignmentSchema.parse(
    (await call(`/api/teacher/assignments/${draft.id}/post`, json(teacher, "POST", {}))).body,
  );
  assert.equal(posted.state, "posted");

  const boot = bootstrapSchema.parse(
    (await call(`/api/assignments/${draft.id}/bootstrap`, { headers: { cookie: student } })).body,
  );
  assert.equal(boot.assignment.dueDate, "2026-11-02");
  const attempt = attemptSchema.parse(
    (await call("/api/attempts", json(student, "POST", { assignmentId: draft.id, sample: false, reviewedOpportunity: false }))).body,
  );
  assert.deepEqual(attempt.rubric.concepts.map((c) => c.title), ["Density", "Hydrogen bonds"]);
  assert.equal(attempt.rubric.profile, "playful");

  const sample = await call(`/api/attempts/${attempt.id}/sample`, json(student, "POST", { kind: "followup-2" }));
  assert.equal(sample.status, 400, "this assignment has only one follow-up");
});

async function multipartCall(path: string, cookie: string, form: FormData) {
  const multipart = new Request("http://upload.invalid", { method: "POST", body: form });
  return call(path, {
    method: "POST",
    headers: {
      cookie,
      origin: `http://${local}`,
      "content-type": multipart.headers.get("content-type") ?? "",
    },
    body: Buffer.from(await multipart.arrayBuffer()),
  });
}

test("a new account starts in Let's Get Started and is not put back after leaving", async () => {
  const cookie = await signIn("newcomer@school.test", "Nia Newcomer");
  const tutorial = async (who = cookie) =>
    studentCoursesSchema
      .parse((await call("/api/courses", { headers: { cookie: who } })).body)
      .find((c) => c.id === "lets-get-started");
  const course = await tutorial();
  assert.equal(course?.title, "Let's Get Started");
  assert.equal(course?.posts.length, 6);
  assert.match(course?.posts[0]?.text ?? "", /^Welcome to Feyn!/);
  assert.deepEqual(course?.posts[0]?.images, [
    { source: "bundled", path: "/art/child-listening.png" },
  ]);
  assert.deepEqual(course?.assignments.map((a) => a.id), ["first-lesson"]);
  assert.equal(
    (await call("/api/assignments/first-lesson/bootstrap", { headers: { cookie } })).status,
    200,
  );

  assert.equal(
    (await call("/api/courses/lets-get-started/leave", json(cookie, "POST", {}))).status,
    200,
  );
  const again = await signIn("newcomer@school.test", "Nia Newcomer");
  assert.equal(await tutorial(again), undefined, "signing in again does not re-enroll");
  assert.equal((await enroll(again, "hello1")).status, 200);
  assert.equal((await tutorial(again))?.id, "lets-get-started");

  const owner = await signIn("teacher@school.test", "Ms Rivera");
  assert.equal(await tutorial(owner), undefined, "the tutorial's teacher is not its student");
});

test("a teacher posts text and pictures that only their class can see, and can delete them", async () => {
  const bo = await signIn("other@school.test", "Mr Okafor");
  const ada = await signIn("teacher@school.test", "Ms Rivera");
  const created = courseSchema.parse(
    (await call("/api/courses", json(bo, "POST", { title: "Art 1" }))).body,
  );
  const student = await signIn("painter@school.test", "Pat Painter");
  assert.equal((await enroll(student, created.joinCode)).status, 200);
  const outsider = await signIn("outside@school.test", "Out Sider");
  const path = `/api/teacher/courses/${created.id}/posts`;
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const form = (text: string, files: File[] = []) => {
    const body = new FormData();
    body.set("text", text);
    for (const file of files) body.append("images", file);
    return body;
  };

  const posted = await multipartCall(
    path,
    bo,
    form("  Field trip on Friday!\nBring a sketchbook.  ", [
      new File([png], "trip.png", { type: "image/png" }),
    ]),
  );
  assert.equal(posted.status, 200);
  const post = postSchema.parse(posted.body);
  assert.equal(post.text, "Field trip on Friday!\nBring a sketchbook.");
  const [image] = post.images;
  assert.equal(image?.source, "upload");
  if (image?.source !== "upload") return;

  const seen = studentCoursesSchema
    .parse((await call("/api/courses", { headers: { cookie: student } })).body)
    .find((c) => c.id === created.id);
  assert.deepEqual(seen?.posts.map((p) => p.text), [post.text]);
  const imagePath = `/api/posts/${post.id}/images/${image.id}`;
  const picture = await call(imagePath, { headers: { cookie: student } });
  assert.equal(picture.status, 200);
  assert.equal(picture.headers.get("content-type"), "image/png");
  assert.equal(picture.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(picture.body, png);
  assert.equal((await call(imagePath, { headers: { cookie: outsider } })).status, 404);
  assert.equal((await call(imagePath, { headers: { cookie: bo } })).status, 200);

  assert.equal((await multipartCall(path, ada, form("Not my class"))).status, 404);
  assert.notEqual((await multipartCall(path, student, form("Hi"))).status, 200);
  const empty = await multipartCall(path, bo, form("   "));
  assert.equal(empty.status, 400);
  assert.match(z.object({ error: z.string() }).parse(empty.body).error, /Write something/);
  const svg = await multipartCall(
    path,
    bo,
    form("Vector", [new File(["<svg/>"], "x.svg", { type: "image/svg+xml" })]),
  );
  assert.equal(svg.status, 400);
  const big = await multipartCall(
    path,
    bo,
    form("Huge", [new File([Buffer.alloc(1024 * 1024 + 1)], "big.png", { type: "image/png" })]),
  );
  assert.equal(big.status, 413);
  assert.match(z.object({ error: z.string() }).parse(big.body).error, /under 1 MB/);

  const remove = (cookie: string) =>
    call(`/api/teacher/posts/${post.id}`, {
      method: "DELETE",
      headers: { cookie, origin: `http://${local}` },
    });
  assert.equal((await remove(ada)).status, 404);
  assert.equal((await remove(bo)).status, 200);
  const after = studentCoursesSchema
    .parse((await call("/api/courses", { headers: { cookie: student } })).body)
    .find((c) => c.id === created.id);
  assert.deepEqual(after?.posts, []);
  assert.equal((await call(imagePath, { headers: { cookie: student } })).status, 404);
});
