export {};

type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };
type Outcome = { ok: true; text: string } | { ok: false; error: string };

declare global {
  var FeynBridge: {
    parseToolCall(text: string, toolNames: string[]): ToolCall | null;
    connectPrompt(tools: { name: string; description: string }[]): string;
    resultMessage(call: { id: string; name: string }, outcome: Outcome): string;
    mcpOutcome(response: unknown): Outcome;
  };
}
