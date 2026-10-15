import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { z } from "zod";
import { createApp } from "../server/main.ts";
import { Attempts } from "../server/attempts.ts";
import { bootstrapSchema } from "../shared/contracts.ts";

function localRequest(
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const call = request(
      url,
      { method: body ? "POST" : "GET", headers },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(text),
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    call.on("error", reject);
    call.end(body);
  });
}
test("HTTP boundary rejects rebinding hosts and foreign origins while local app and MCP requests work", async () => {
  const server = createApp(new Attempts(":memory:")).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected loopback TCP listener.");
  const url = `http://127.0.0.1:${address.port}`;
  try {
    for (const host of [
      "review-attacker.invalid:4173",
      "127.0.0.1.attacker.invalid:4173",
      "127.0.0.1:9999",
    ]) {
      const response = await localRequest(`${url}/api/teacher`, { host });
      assert.equal(response.status, 403);
      assert.deepEqual(response.body, { error: "Local access only." });
    }
    const denied = await localRequest(`${url}/api/teacher`, {
      host: "127.0.0.1:4173",
      origin: "https://attacker.invalid",
    });
    assert.equal(denied.status, 403);
    for (const host of [
      "127.0.0.1:4173",
      "localhost:4173",
      "[::1]:4173",
      "127.0.0.1:5173",
    ]) {
      const response = await localRequest(`${url}/api/bootstrap`, {
        host,
        origin: "http://127.0.0.1:5173",
      });
      assert.equal(response.status, 200);
      assert.equal(
        bootstrapSchema.parse(response.body).lesson.id,
        "cart-speed",
      );
    }
    const mcp = await localRequest(
      `${url}/mcp`,
      { host: "localhost:4173", "content-type": "application/json" },
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    );
    assert.equal(mcp.status, 200);
    const result = z
      .object({
        result: z.object({ tools: z.array(z.object({ name: z.string() })) }),
      })
      .parse(mcp.body);
    assert.deepEqual(
      result.result.tools.map((tool) => tool.name),
      ["get_assignment", "get_class_recap", "list_attempts", "get_teacher_evidence"],
    );
    const rpc = (method: string, params: unknown, origin?: string) =>
      localRequest(
        `${url}/mcp`,
        {
          host: "127.0.0.1:4173",
          "content-type": "application/json",
          ...(origin ? { origin } : {}),
        },
        JSON.stringify({ jsonrpc: "2.0", id: 2, method, params }),
      );
    const bridge = await rpc(
      "tools/call",
      { name: "get_class_recap", arguments: {} },
      "chrome-extension://feynbridgeextensionid",
    );
    assert.equal(bridge.status, 200);
    const recapText = z
      .object({ result: z.object({ content: z.array(z.object({ text: z.string() })) }) })
      .parse(bridge.body).result.content[0]?.text ?? "";
    const recap = z
      .object({
        learners: z.number(),
        sampleLearners: z.number(),
        concepts: z.array(z.object({ concept: z.string(), currentGaps: z.number() })).length(3),
      })
      .parse(JSON.parse(recapText));
    assert.equal(recap.sampleLearners, recap.learners - 1);
    for (const name of ["Maya", "Noah", "Eli", "June"])
      assert.equal(recapText.includes(name), false, `recap omits ${name}`);
    const unknown = await rpc("tools/call", { name: "toString" });
    assert.deepEqual(
      z.object({ error: z.object({ code: z.number() }) }).parse(unknown.body).error.code,
      -32602,
    );
    const extensionOnApi = await localRequest(`${url}/api/teacher`, {
      host: "127.0.0.1:4173",
      origin: "chrome-extension://feynbridgeextensionid",
    });
    assert.equal(extensionOnApi.status, 403);
  } finally {
    server.close();
    await once(server, "close");
  }
});
