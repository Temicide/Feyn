import { useState, type ReactNode } from "react";

export function failure(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function dueLabel(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const [year, month, day] = dueDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  return `Due ${new Date(year, month - 1, day).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })}`;
}

export function StatusChip({ completed }: { completed: boolean }) {
  return (
    <span className={`status-chip ${completed ? "done" : ""}`}>
      {completed ? "Done" : "Assigned"}
    </span>
  );
}

export function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2c.6 4.6 2.4 7.4 10 10-7.6 2.6-9.4 5.4-10 10-.6-4.6-2.4-7.4-10-10 7.6-2.6 9.4-5.4 10-10Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="loading" role="status">
      <span className="thinking-dots">
        <i />
        <i />
        <i />
      </span>
      <p>{text}</p>
    </div>
  );
}

export function ErrorBanner({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  if (!error) return null;
  return (
    <div className="banner-error" role="alert">
      <p>{error}</p>
      <button
        className="link-button"
        onClick={onDismiss}
        aria-label="Dismiss error"
      >
        Dismiss
      </button>
    </div>
  );
}

export function Confirm({
  label,
  question,
  confirmLabel,
  onConfirm,
  className = "link-button",
  children,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  className?: string;
  children?: ReactNode;
}) {
  const [asking, setAsking] = useState(false),
    [busy, setBusy] = useState(false);
  if (!asking)
    return (
      <button className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  return (
    <div className="confirm" role="group" aria-label={question}>
      <p>
        <b>{question}</b>
        {children && <> {children}</>}
      </p>
      <div className="choices">
        <button
          className="choice choice-danger"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onConfirm().finally(() => {
              setBusy(false);
              setAsking(false);
            });
          }}
        >
          {confirmLabel}
        </button>
        <button
          className="choice"
          disabled={busy}
          onClick={() => setAsking(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
