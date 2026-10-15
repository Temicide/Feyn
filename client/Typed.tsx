import { useEffect, useState } from "react";

export function Typed({ text, speed = 28 }: { text: string; speed?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const interval = setInterval(
      () =>
        setShown((value) => {
          if (value >= text.length) clearInterval(interval);
          return Math.min(value + 1, text.length);
        }),
      speed,
    );
    return () => clearInterval(interval);
  }, [text, speed]);
  return (
    <>
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      <span className="visually-hidden">{text}</span>
    </>
  );
}
