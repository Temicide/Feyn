import test from "node:test";
import assert from "node:assert/strict";

await import("../extension/protocol.js");
const bridge = globalThis.FeynBridge;
const names = ["get_assignment", "get_class_recap"];

test("a U-Bot reply becomes a tool call only when it names an offered tool", () => {
  assert.deepEqual(
    bridge.parseToolCall(
      'Sure.\n```json\n{"type": "tool_call", "id": 7, "name": "get_class_recap", "arguments": {}}\n```',
      names,
    ),
    { id: "7", name: "get_class_recap", arguments: {} },
  );
  assert.equal(
    bridge.parseToolCall('{"type":"tool_call","id":"1","name":"read_file","arguments":{}}', names),
    null,
  );
  assert.equal(bridge.parseToolCall("The recap shows two gaps.", names), null);
  assert.equal(bridge.parseToolCall('{"type":"tool_call", "id": }', names), null);
});

test("the connect prompt offers every Feyn tool", () => {
  const prompt = bridge.connectPrompt([
    { name: "get_assignment", description: "Read the lesson." },
    { name: "get_class_recap", description: "Read counts." },
  ]);
  for (const name of names) assert.ok(prompt.includes(name), name);
});

test("MCP responses become tool results that echo the call id and cap their size", () => {
  const call = { id: "a1", name: "get_class_recap" };
  const ok = JSON.parse(
    bridge.resultMessage(
      call,
      bridge.mcpOutcome({ result: { content: [{ type: "text", text: "x".repeat(20000) }] } }),
    ),
  );
  assert.equal(ok.id, "a1");
  assert.equal(ok.ok, true);
  assert.equal(ok.truncated, true);
  assert.ok(ok.content.length < 20000);
  const failed = JSON.parse(
    bridge.resultMessage(call, bridge.mcpOutcome({ error: { code: -32602, message: "Unknown tool" } })),
  );
  assert.deepEqual([failed.ok, failed.error], [false, "Unknown tool"]);
});

test("extension content scripts compile together in their shared global scope", async () => {
  const { readFile } = await import("node:fs/promises");
  const { Script } = await import("node:vm");
  const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
  const files: string[] = manifest.content_scripts[0].js;
  const sources = await Promise.all(files.map((file) => readFile(`extension/${file}`, "utf8")));
  assert.doesNotThrow(() => new Script(sources.join("\n")));
});
