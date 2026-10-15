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

test("gateway assessment sends the assignment to the configured model and derives the result from its criteria", async (t) => {
  const transcript =
    "Distance is how far it went. Speed is how fast distance changes. Average uses an interval but instantaneous is one moment. At three seconds it moves six meters per second.";
  const quotes = [
    "Speed is how fast distance changes.",
    "instantaneous is one moment",
    "six meters per second",
  ];
  const requests: { url: string; body: { model: string; system: string; messages: { content: string }[] } }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    const result = {
      criteria: ["distance-speed", "average-instantaneous", "six-at-three"].map((id, i) => ({
        id,
        state: "demonstrated",
        quote: quotes[i],
        reason: "Stated in the student's words.",
      })),
      majorError: false,
      summary: "Complete explanation.",
    };
    return Response.json({
      content: [{ type: "text", text: "```json\n" + JSON.stringify(result) + "\n```" }],
    });
  });
  const assessment = await assessMain(transcript, false);
  const [request] = requests;
  assert.ok(request, "gateway received a request");
  assert.equal(request.url, "http://127.0.0.1:9/v1/messages");
  assert.equal(request.body.model, "test-model");
  assert.equal(JSON.parse(request.body.messages[0]?.content ?? "{}").transcript, transcript);
  assert.equal(assessment.outcome, "pass");
  assert.equal(assessment.provider, "Local AI gateway");
  assert.equal(assessment.model, "test-model");
});
