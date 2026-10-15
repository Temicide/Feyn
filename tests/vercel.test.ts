import test, { after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";

process.env.VERCEL = "1";
delete process.env.MONGODB_URI;
delete process.env.SESSION_SECRET;
delete process.env.APP_ORIGIN;
const { default: handler } = await import("../api/index.js");
const server = createServer(handler).listen(0, "127.0.0.1");
await once(server, "listening");
after(() => server.close());
const address = server.address();
if (!address || typeof address === "string") throw new Error("Expected TCP.");
const base = `http://127.0.0.1:${address.port}`;

async function me() {
  const response = await fetch(`${base}/api/me`);
  return { status: response.status, body: await response.json() };
}

test("a Vercel function names missing configuration and recovers once it is set", async () => {
  assert.deepEqual(await me(), {
    status: 500,
    body: {
      error:
        "MONGODB_URI is not configured on the server. Set it in the Vercel project environment.",
    },
  });
  process.env.MONGODB_URI = "mongodb://127.0.0.1:9";
  const missingSecret = await me();
  assert.equal(missingSecret.status, 500);
  assert.match(missingSecret.body.error, /^SESSION_SECRET is not configured/);
  process.env.SESSION_SECRET = "vercel-test-secret";
  process.env.APP_ORIGIN = base;
  assert.equal((await me()).status, 401);
});
