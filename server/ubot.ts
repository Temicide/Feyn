import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { TeacherData } from "../shared/contracts.js";

const supabase = "https://jspyarovtaqokysihujr.supabase.co";
const chatUrl = "https://u.bot/api/chat";
export const ubotProvider = "U-Bot (unofficial chat API)";

export type UbotConfig = { email: string; password: string; anonKey: string };
export type ClassRecapCounts = {
  learners: number;
  sampleLearners: number;
  concepts: {
    concept: string;
    currentGaps: number;
    resolved: number;
    demonstrated: number;
    unassessed: number;
  }[];
};
export type RecapDraft = { text: string; provider: string; at: string };

export function classRecapCounts({ learners, recap }: TeacherData): ClassRecapCounts {
  return {
    learners: learners.length,
    sampleLearners: learners.filter((l) => l.sample).length,
    concepts: recap.map((row) => ({
      concept: row.title,
      currentGaps: row.gaps.length,
      resolved: row.resolved.length,
      demonstrated: row.demonstrated.length,
      unassessed: row.unassessed.length,
    })),
  };
}

export function ubotConfig(env: NodeJS.ProcessEnv): UbotConfig | null {
  const parsed = z
    .object({
      UBOT_EMAIL: z.string().email(),
      UBOT_PASSWORD: z.string().min(1),
      UBOT_SUPABASE_ANON_KEY: z.string().min(1),
    })
    .safeParse(env);
  return parsed.success
    ? {
        email: parsed.data.UBOT_EMAIL,
        password: parsed.data.UBOT_PASSWORD,
        anonKey: parsed.data.UBOT_SUPABASE_ANON_KEY,
      }
    : null;
}

export function recapPrompt(question: string, recap: ClassRecapCounts): string {
  const rows = recap.concepts
    .map(
      (c) =>
        `- ${c.concept}: ${c.currentGaps} current gaps, ${c.resolved} resolved, ${c.demonstrated} demonstrated, ${c.unassessed} not yet assessed`,
    )
    .join("\n");
  return [
    "I am a teacher planning a short recap before my next lesson.",
    `Students explained this problem aloud: ${question}`,
    `Latest evidence for ${recap.learners} learners, ${recap.sampleLearners} of them illustrative sample records:`,
    rows,
    "Write a recap plan under 250 words. Start with the concepts that have the most current gaps.",
    "For each of those concepts give a two-sentence explanation I can say aloud and one quick check question.",
    "Do not invent students or results beyond these counts.",
  ].join("\n");
}

async function reach(step: string, request: () => Promise<Response>) {
  let response: Response;
  try {
    response = await request();
  } catch {
    throw new Error(`U-Bot could not be reached during ${step}. Retry later.`);
  }
  if (!response.ok)
    throw new Error(`U-Bot ${step} failed with HTTP ${response.status}.`);
  return response;
}

export async function draftRecap(
  config: UbotConfig,
  question: string,
  recap: ClassRecapCounts,
): Promise<RecapDraft> {
  const login = await reach("sign-in", () =>
    fetch(`${supabase}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: config.anonKey, "content-type": "application/json" },
      body: JSON.stringify({ email: config.email, password: config.password }),
      signal: AbortSignal.timeout(20000),
    }),
  );
  const { access_token } = z
    .object({ access_token: z.string() })
    .parse(await login.json());
  const prompt = recapPrompt(question, recap);
  const chat = await reach("chat", () =>
    fetch(chatUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${access_token}`,
        "content-type": "application/json",
        "x-tester-id": `t_${[...randomBytes(24)].map((b) => (b % 36).toString(36)).join("")}`,
      },
      body: JSON.stringify({
        mode: "professional",
        sessionId: `c_${Date.now()}`,
        messages: [{ role: "user", content: prompt }],
        userText: prompt,
      }),
      signal: AbortSignal.timeout(60000),
    }),
  );
  const raw = await chat.text();
  const text = raw.replace(/\[STATUS:\w+\]/g, "").trim();
  if (raw.includes("[DEGENERATE]") || !text)
    throw new Error("U-Bot returned an unusable reply. Retry the draft.");
  return { text, provider: ubotProvider, at: new Date().toISOString() };
}
