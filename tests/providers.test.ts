import test from "node:test";
import assert from "node:assert/strict";

process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9";
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.ANTHROPIC_MODEL = "test-model";
process.env.ELEVENLABS_API_KEY = "test-key";
const { assessMain, transcribe } = await import("../server/providers.ts");

test("unreachable providers report a named operational error instead of a bare network failure", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(assessMain("Speed is how fast distance changes.", false), { message: /^Local AI gateway could not be reached\..*No conceptual result was recorded\.$/ });
  await assert.rejects(transcribe(Buffer.from("audio"), "a.wav", "audio/wav"), { message: /^ElevenLabs could not be reached\. Recording saved\./ });
});
