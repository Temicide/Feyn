import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Profile } from "../shared/contracts.js";

export type Speaker = "You" | "Pip";
export type Expression = "listening" | "puzzled" | "aha" | "thinking";
export type Voice = {
  frequency: number;
  wobble: number;
  volume: number;
  delay: number;
};

const you: Voice = { frequency: 210, wobble: 0.03, volume: 0.03, delay: 35 },
  pip = { frequency: 440, volume: 0.05, delay: 35 },
  moods: Record<Expression, { pitch: number; wobble: number; pace: number }> = {
    listening: { pitch: 1, wobble: 0, pace: 1 },
    aha: { pitch: 1.12, wobble: 0, pace: 0.85 },
    puzzled: { pitch: 0.92, wobble: 0.05, pace: 1 },
    thinking: { pitch: 1, wobble: 0, pace: 1.3 },
  },
  jitter: Record<Profile, number> = { curious: 0.03, playful: 0.1 };

export function voiceFor(
  speaker: Speaker,
  expression: Expression,
  profile: Profile,
): Voice {
  if (speaker === "You") return you;
  const mood = moods[expression];
  return {
    frequency: pip.frequency * mood.pitch,
    wobble: jitter[profile] + mood.wobble,
    volume: pip.volume,
    delay: pip.delay * mood.pace,
  };
}
export const pipVoice = voiceFor("Pip", "listening", "curious");

const storageKey = "feyn.sound",
  listeners = new Set<() => void>();
let sound = (() => {
  try {
    return localStorage.getItem(storageKey) !== "off";
  } catch {
    return true;
  }
})();
function setSound(value: boolean) {
  sound = value;
  try {
    localStorage.setItem(storageKey, value ? "on" : "off");
  } catch {}
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useSound() {
  return [useSyncExternalStore(subscribe, () => sound), setSound] as const;
}

let context: AudioContext | null = null;
// Browsers only let an AudioContext start inside a user gesture. Unlocking on
// every pointerdown/keydown means the click that opened a cutscene has already
// started audio by the time its first line types.
function unlock() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {}
}
addEventListener("pointerdown", unlock, { capture: true });
addEventListener("keydown", unlock, { capture: true });

function blip(voice: Voice) {
  if (!sound || context?.state !== "running") return;
  const now = context.currentTime,
    oscillator = context.createOscillator(),
    gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value =
    voice.frequency * (1 + (Math.random() * 2 - 1) * voice.wobble);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(voice.volume, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.045);
}

const pauses: Record<string, number> = {
  ",": 150,
  ";": 150,
  ":": 150,
  ".": 300,
  "!": 300,
  "?": 300,
  "…": 250,
};
export function pauseAfter(text: string, index: number): number {
  const char = text[index] ?? "",
    after = text[index + 1],
    pause = pauses[char] ?? 0;
  if (char === "." && (text[index - 1] === "." || after === ".")) return 250;
  if (pause === 300 && after !== undefined && !/\s/.test(after)) return 0;
  return pause;
}

export function useTypewriter(text: string, voice: Voice) {
  const [state, setState] = useState(() => ({ text, shown: 0 })),
    voiceRef = useRef(voice);
  useEffect(() => {
    voiceRef.current = voice;
  });
  if (state.text !== text)
    setState({ text, shown: 0 });
  const { shown } = state;
  useEffect(() => {
    if (shown >= text.length) return;
    const timer = setTimeout(
      () => {
        setState({ text, shown: shown + 1 });
        if (/[\p{L}\p{N}]/u.test(text[shown] ?? "")) blip(voiceRef.current);
      },
      voiceRef.current.delay + pauseAfter(text, shown - 1),
    );
    return () => clearTimeout(timer);
  }, [text, shown]);
  return { shown, skip: () => setState({ text, shown: text.length }) };
}
