const feyn = "http://127.0.0.1:4173";

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.kind !== "mcp") return false;
  fetch(`${feyn}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: message.method,
      params: message.params,
    }),
  })
    .then((response) => response.json())
    .then(reply, () =>
      reply({
        error: { message: `Feyn could not be reached at ${feyn}. Start Feyn, then retry.` },
      }),
    );
  return true;
});
