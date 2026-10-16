import type { WorkStatus } from "../shared/contracts.js";
import type { AttemptStanding } from "../shared/work-status.js";

export type StatusTone = "assigned" | "missing" | "waiting" | "approved" | "not-approved";
export type StatusFilter = "all" | StatusTone;
export type StatusView = {
  label: string;
  tone: StatusTone;
  details: string[];
  explain: string;
};

export const statusFilters: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "assigned", label: "Assigned" },
  { id: "missing", label: "Missing" },
  { id: "waiting", label: "Waiting for review" },
  { id: "approved", label: "Approved" },
  { id: "not-approved", label: "Not approved" },
];

type Row = { label: string; tone: StatusTone; who?: string; explain: string };
const rows: Record<string, Row> = {
  assigned: {
    label: "Assigned",
    tone: "assigned",
    explain: "Nothing turned in yet. Teach Pip when you're ready.",
  },
  missing: {
    label: "Missing",
    tone: "missing",
    explain: "This was due and nothing is turned in yet. You can still teach Pip.",
  },
  "waiting:pip-passed": {
    label: "Waiting for review",
    tone: "waiting",
    explain: "Pip approved your explanation. Your teacher will check it soon.",
  },
  "waiting:requested": {
    label: "Waiting for review",
    tone: "waiting",
    explain: "You asked your teacher to check this. They'll look at it soon.",
  },
  approved: {
    label: "Approved",
    tone: "approved",
    who: "Your teacher's check",
    explain: "Your teacher approved this.",
  },
  "not-approved:pip": {
    label: "Not approved",
    tone: "not-approved",
    who: "Pip's check",
    explain: "Not approved yet. Teach Pip again when you're ready.",
  },
  "not-approved:teacher": {
    label: "Not approved",
    tone: "not-approved",
    who: "Your teacher's check",
    explain: "Your teacher didn't approve this yet. Teach Pip again when you're ready.",
  },
};

function standingKey(standing: AttemptStanding): string {
  switch (standing.kind) {
    case "waiting":
      return `waiting:${standing.reason}`;
    case "approved":
      return "approved";
    case "not-approved":
      return `not-approved:${standing.by}`;
  }
}

export function standingView(standing: AttemptStanding) {
  return rows[standingKey(standing)] as Row;
}

function endOfDay(dueDate: string): Date | null {
  const [year, month, day] = dueDate.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day + 1) : null;
}

export function workStatusView(
  status: WorkStatus,
  dueDate: string | null,
  now = new Date(),
): StatusView {
  const end = dueDate ? endOfDay(dueDate) : null,
    pastDue = Boolean(end && now >= end),
    row =
      status.kind === "none"
        ? (rows[pastDue ? "missing" : "assigned"] as Row)
        : standingView(status),
    late = status.kind !== "none" && end && new Date(status.turnedInAt) >= end;
  return {
    label: row.label,
    tone: row.tone,
    details: [row.who, late ? "Done late" : undefined].filter(
      (line): line is string => Boolean(line),
    ),
    explain: row.explain,
  };
}
