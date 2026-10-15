import { useTypewriter, type Voice } from "./voice.js";

export function Typed({ text, voice }: { text: string; voice: Voice }) {
  const { shown } = useTypewriter(text, voice);
  return (
    <>
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      <span className="visually-hidden">{text}</span>
    </>
  );
}
