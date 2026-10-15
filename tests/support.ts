import { Attempts } from "../server/attempts.js";
import { Courses } from "../server/courses.js";
import { rubricOf } from "../server/rubric.js";
import { cartSpeedAssignment, prepare } from "../server/seed.js";
import { MemoryStore, type RecordStore } from "../server/store.js";

export const assignment = cartSpeedAssignment("2026-10-15T00:00:00.000Z");
export const rubric = rubricOf(assignment);
export const [distance, interval, moment] = rubric.concepts.map((c) => c.id) as [
  string,
  string,
  string,
];
export const teacherEmail = "teacher@school.test";

export function workspace(records: RecordStore = new MemoryStore()) {
  let preparing: Promise<void> | null = null;
  const ready = () => (preparing ??= prepare(records, [teacherEmail]));
  return {
    records,
    store: new Attempts(records, ready),
    courses: new Courses(records, ready),
  };
}
