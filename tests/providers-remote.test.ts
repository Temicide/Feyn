import test from "node:test";
import assert from "node:assert/strict";

process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com";
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.ANTHROPIC_MODEL = "test-model";
const { assessMain } = await import("../server/providers.js");

test("a remote assessment endpoint is not labeled a local gateway", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("", { status: 503 }),
  );
  await assert.rejects(
    assessMain("Speed is how fast distance changes.", false),
    {
      message:
        /^Anthropic-compatible API returned HTTP 503\. No conceptual result was recorded\.$/,
    },
  );
  const scripted = await assessMain(
    "Speed is how fast distance changes.",
    true,
  );
  assert.equal(scripted.provider, "Scripted sample walkthrough");
});
