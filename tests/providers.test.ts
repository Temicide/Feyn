import test from "node:test";
import assert from "node:assert/strict";

process.env.UBOT_EMAIL = "teacher@example.com";
process.env.UBOT_PASSWORD = "secret";
process.env.UBOT_SUPABASE_ANON_KEY = "anon";
process.env.ELEVENLABS_API_KEY = "test-key";
const { assessMain, transcribe } = await import("../server/providers.js");
const { rubric } = await import("./support.js");

test("unreachable providers report a named operational error instead of a bare network failure", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(assessMain("Speed is how fast distance changes.", false, rubric), { message: /^U-Bot could not be reached during sign-in\..*No conceptual result was recorded\.$/ });
  await assert.rejects(transcribe(Buffer.from("audio"), "a.wav", "audio/wav"), { message: /^ElevenLabs could not be reached\. Recording saved\./ });
});

test("a U-Bot HTTP failure records no conceptual result, and scripted samples skip U-Bot", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 503 }));
  await assert.rejects(assessMain("Speed is how fast distance changes.", false, rubric), {
    message: /^U-Bot sign-in failed with HTTP 503\. No conceptual result was recorded\.$/,
  });
  const scripted = await assessMain("Speed is how fast distance changes.", true, rubric);
  assert.equal(scripted.provider, "Scripted sample walkthrough");
});

test("U-Bot assessment sends the assignment in its chat and derives the result from its criteria", async (t) => {
  const transcript =
    "Distance is how far it went. Speed is how fast distance changes. Average uses an interval but instantaneous is one moment. At three seconds it moves six meters per second.";
  const quotes = [
    "Speed is how fast distance changes.",
    "instantaneous is one moment",
    "six meters per second",
  ];
  const requests: { url: string; body: { userText: string } }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url.includes("supabase")) return Response.json({ access_token: "t" });
    requests.push({ url, body: JSON.parse(String(init.body)) });
    const result = {
      criteria: rubric.concepts.map((c) => c.id).map((id, i) => ({
        id,
        state: "demonstrated",
        quote: quotes[i],
        reason: "Stated in the student's words.",
      })),
      majorError: false,
      summary: "Complete explanation.",
    };
    return new Response("[STATUS:thinking]```json\n" + JSON.stringify(result) + "\n```");
  });
  const assessment = await assessMain(transcript, false, rubric);
  const [request] = requests;
  assert.ok(request, "U-Bot received a chat");
  assert.equal(request.url, "https://u.bot/api/chat");
  assert.ok(request.body.userText.includes(JSON.stringify(transcript)), "chat carries the transcript");
  assert.equal(assessment.outcome, "pass");
  assert.equal(assessment.provider, "U-Bot (unofficial chat API)");
});
