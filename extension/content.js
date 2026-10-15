const bridge = globalThis.FeynBridge;
const handled = new Set();
let tools = [];
let pending = null;

const panel = document.createElement("div");
panel.style.cssText =
  "position:fixed;right:16px;bottom:96px;z-index:2147483647;width:260px;padding:12px;border-radius:12px;background:#24382c;color:#f6f1e7;font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)";
const title = document.createElement("strong");
title.textContent = "Feyn bridge";
const status = document.createElement("p");
status.style.cssText = "margin:6px 0 10px;opacity:.85";
const connect = button("Connect Feyn");
const run = button("Run tool");
run.style.display = "none";
const note = document.createElement("p");
note.style.cssText = "margin:8px 0 0;font-size:11px;opacity:.7";
note.textContent =
  "Results are sent to U-Bot. get_class_recap has no names. Evidence tools include student transcripts.";
panel.append(title, status, connect, run, note);
document.body.append(panel);

function button(label) {
  const element = document.createElement("button");
  element.textContent = label;
  element.style.cssText =
    "display:block;width:100%;margin-top:6px;padding:7px;border:0;border-radius:8px;background:#f6f1e7;color:#24382c;font-weight:600;cursor:pointer";
  return element;
}

function mcp(method, params) {
  return chrome.runtime.sendMessage({ kind: "mcp", method, params });
}

async function loadTools() {
  const response = await mcp("tools/list", {});
  if (response.error) throw new Error(response.error.message);
  tools = response.result.tools;
  return tools;
}

async function send(text) {
  const box = document.querySelector('textarea[placeholder="Ask U-Bot"]');
  if (!box) throw new Error("U-Bot message box not found. Open a chat first.");
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  setValue.call(box, text);
  box.dispatchEvent(new Event("input", { bubbles: true }));
  for (let tries = 0; tries < 20; tries++) {
    const sendButton = document.querySelector("button.ubot-send");
    if (sendButton && !sendButton.disabled) {
      sendButton.click();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("U-Bot send button stayed disabled.");
}

async function attempt(action) {
  connect.disabled = run.disabled = true;
  try {
    await action();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    connect.disabled = run.disabled = false;
  }
}

connect.onclick = () =>
  attempt(async () => {
    await loadTools();
    await send(bridge.connectPrompt(tools));
    status.textContent = `Offered ${tools.length} Feyn tools to U-Bot.`;
  });

run.onclick = () =>
  attempt(async () => {
    const call = pending;
    if (!call) return;
    const outcome = bridge.mcpOutcome(await mcp("tools/call", { name: call.name, arguments: {} }));
    handled.add(call.id);
    pending = null;
    run.style.display = "none";
    await send(bridge.resultMessage(call, outcome));
    status.textContent = outcome.ok
      ? `Sent ${call.name} result (${outcome.text.length} characters).`
      : `Sent ${call.name} error: ${outcome.error}`;
  });

function inspectLatestReply() {
  const replies = document.querySelectorAll(".ubot-assistant");
  const latest = replies[replies.length - 1];
  const call = latest && bridge.parseToolCall(latest.textContent ?? "", tools.map((t) => t.name));
  if (!call || handled.has(call.id) || pending?.id === call.id) return;
  pending = call;
  run.textContent = `Run ${call.name}`;
  run.style.display = "block";
  status.textContent = `U-Bot requested ${call.name} (id ${call.id}).`;
}

new MutationObserver(inspectLatestReply).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});
loadTools().then(
  () => {
    status.textContent = `Feyn ready with ${tools.length} tools.`;
    inspectLatestReply();
  },
  (error) => {
    status.textContent = error.message;
  },
);
