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
  attemptSchema,
  bootstrapSchema,
  meSchema,
  teacherSchema,
} from "../shared/contracts.js";

const env = {
  SESSION_SECRET: "test-session-secret-for-feyn-http-tests",
  APP_ORIGIN: "https://feyn.example",
  GOOGLE_CLIENT_ID: "feyn-client-id",
  GOOGLE_CLIENT_SECRET: "feyn-client-secret",
  TEACHER_EMAILS: " Teacher@School.test , other@school.test",
  DEV_LOGIN: "1",
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
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      `${base}${path}`,
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
  const create = json(cookie, "POST", {
    profile: "curious",
    sample: false,
    reviewedOpportunity: false,
  });
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
  for (const path of ["/api/bootstrap", "/api/teacher"])
    assert.equal((await call(path)).status, 401);
});

test("only teachers named in TEACHER_EMAILS open the teacher's desk", async () => {
  const student = await signIn("noah@school.test", "Noah");
  const teacher = await signIn("teacher@school.test", "Ms Rivera");
  assert.equal(
    (await call("/api/teacher", { headers: { cookie: student } })).status,
    403,
  );
  assert.equal(
    (await call("/api/profile", json(student, "PUT", { profile: "playful" })))
      .status,
    403,
  );
  const desk = await call("/api/teacher", { headers: { cookie: teacher } });
  assert.equal(desk.status, 200);
  for (const name of ["Maya", "Noah", "Eli", "June"])
    assert.ok(
      teacherSchema.parse(desk.body).learners.some((l) => l.name === name),
    );
  assert.equal(
    meSchema.parse(
      (await call("/api/me", { headers: { cookie: teacher } })).body,
    ).role,
    "teacher",
  );
});

test("a student cannot read or change another learner's attempt or audio", async () => {
  const owner = await signIn("eli@school.test", "Eli Owner");
  const other = await signIn("june@school.test", "June Other");
  const teacher = await signIn("other@school.test", "Mr Okafor");
  const attempt = attemptSchema.parse(
    (
      await call(
        "/api/attempts",
        json(owner, "POST", {
          profile: "curious",
          sample: false,
          reviewedOpportunity: false,
        }),
      )
    ).body,
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
  const otherBootstrap = bootstrapSchema.parse(
    (await call("/api/bootstrap", { headers: { cookie: other } })).body,
  );
  assert.equal(otherBootstrap.attempts.length, 0);

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
});

test("a tampered session cookie is rejected", async () => {
  const cookie = await signIn("ivy@school.test", "Ivy");
  const [name, token] = cookie.split("=");
  const [body, signature] = (token ?? "").split(".");
  const claims = JSON.parse(Buffer.from(body ?? "", "base64url").toString());
  const forged = Buffer.from(
    JSON.stringify({ ...claims, role: "teacher" }),
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
      (await call("/api/teacher", { headers: { cookie: bad } })).status,
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
  const teacher = await signIn("teacher@school.test", "Ms Rivera");
  const desk = teacherSchema.parse(
    (await call("/api/teacher", { headers: { cookie: teacher } })).body,
  );
  assert.deepEqual(
    desk.learners.find((l) => l.id === "google:google-sub-1234"),
    {
      id: "google:google-sub-1234",
      name: "Ada Lovelace",
      sample: false,
      completedAt: null,
    },
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

test("read-only MCP tools stay available to a local client", async () => {
  const mcp = await call("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
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
      "get_assignment",
      "get_class_recap",
      "list_attempts",
      "get_teacher_evidence",
    ],
  );
  const recap = await call("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_class_recap", arguments: {} },
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
