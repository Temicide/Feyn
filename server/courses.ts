import { randomInt, randomUUID } from "node:crypto";
import {
  type Assignment,
  type AssignmentInput,
  type Course,
  type Enrollment,
  type Post,
  type PostImage,
  type StudentCourse,
  type TeacherCourse,
} from "../shared/contracts.js";
import { isComplete, workStatus } from "../shared/work-status.js";
import { projectRecap } from "./attempts.js";
import { HttpError } from "./auth.js";
import { applyInput, rubricOf } from "./rubric.js";
import type { Kind, RecordStore, Records } from "./store.js";

const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newJoinCode(): string {
  return Array.from(
    { length: 6 },
    () => codeAlphabet[randomInt(codeAlphabet.length)],
  ).join("");
}
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
export function enrollmentId(courseId: string, learnerId: string): string {
  return `${courseId}:${learnerId}`;
}

function visiblePosts(posts: Post[], courseId: string): Post[] {
  return posts
    .filter((p) => p.courseId === courseId && !p.removedAt)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function completenessProblem(a: Assignment): string | null {
  if (!a.title || !a.question || !a.reference)
    return "Add a title, a question and a reference answer.";
  if (a.concepts.length < 1)
    return "Add at least one essential concept.";
  if (a.concepts.some((c) => !c.title || !c.description))
    return "Give every concept a title and a description.";
  if (new Set(a.concepts.map((c) => c.id)).size !== a.concepts.length)
    return "Give each concept its own title.";
  if (a.followups.length < 1) return "Add at least one follow-up question.";
  if (a.followups.some((q) => !q.question || !q.expected))
    return "Give every follow-up a question and an expected answer.";
  if (a.followups.some((q) => q.conceptIds.length === 0))
    return "Tick at least one concept for every follow-up.";
  return null;
}

export class Courses {
  constructor(
    private store: RecordStore,
    private ready: () => Promise<void>,
  ) {}
  private async list<K extends Kind>(kind: K): Promise<Records[K][]> {
    await this.ready();
    return this.store.list(kind);
  }
  async isTeacher(email: string): Promise<boolean> {
    const wanted = normalizeEmail(email);
    return (await this.list("teacher")).some((t) => t.id === wanted);
  }
  async addTeacher(email: string, addedBy: string): Promise<void> {
    const id = normalizeEmail(email);
    if (await this.isTeacher(id)) return;
    await this.store.put("teacher", {
      id,
      addedBy: normalizeEmail(addedBy),
      addedAt: new Date().toISOString(),
    });
  }
  async create(teacherEmail: string, title: string): Promise<Course> {
    const taken = new Set((await this.list("course")).map((c) => c.joinCode));
    let joinCode = newJoinCode();
    while (taken.has(joinCode)) joinCode = newJoinCode();
    const course: Course = {
      id: randomUUID(),
      title,
      teacherId: normalizeEmail(teacherEmail),
      joinCode,
      createdAt: new Date().toISOString(),
    };
    await this.store.put("course", course);
    return course;
  }
  async taughtBy(email: string): Promise<Course[]> {
    const wanted = normalizeEmail(email);
    return (await this.list("course")).filter((c) => c.teacherId === wanted);
  }
  async course(id: string): Promise<Course> {
    const found = (await this.list("course")).find((c) => c.id === id);
    if (!found) throw new HttpError(404, "Course not found.");
    return found;
  }
  async owned(email: string, courseId: string): Promise<Course> {
    const course = await this.course(courseId).catch(() => null);
    if (!course || course.teacherId !== normalizeEmail(email))
      throw new HttpError(404, "Course not found.");
    return course;
  }
  async assignment(id: string): Promise<Assignment> {
    const found = (await this.list("assignment")).find((a) => a.id === id);
    if (!found) throw new HttpError(404, "Assignment not found.");
    return found;
  }
  async ownedAssignment(email: string, id: string) {
    const assignment = await this.assignment(id),
      course = await this.owned(email, assignment.courseId);
    return { assignment, course };
  }
  async newCode(course: Course): Promise<Course> {
    const taken = new Set((await this.list("course")).map((c) => c.joinCode));
    let joinCode = newJoinCode();
    while (taken.has(joinCode)) joinCode = newJoinCode();
    const updated = { ...course, joinCode };
    await this.store.put("course", updated);
    return updated;
  }
  async join(learnerId: string, rawCode: string): Promise<Course> {
    const code = rawCode.trim().toUpperCase(),
      course = (await this.list("course")).find((c) => c.joinCode === code);
    if (!course)
      throw new HttpError(
        404,
        "That join code doesn't match a course. Check it and try again.",
      );
    const id = enrollmentId(course.id, learnerId),
      existing = (await this.list("enrollment")).find((e) => e.id === id);
    await this.store.put("enrollment", {
      id,
      courseId: course.id,
      learnerId,
      joinedAt: existing?.joinedAt ?? new Date().toISOString(),
      endedAt: null,
    });
    return course;
  }
  async end(courseId: string, learnerId: string): Promise<void> {
    const found = (await this.list("enrollment")).find(
      (e) => e.id === enrollmentId(courseId, learnerId),
    );
    if (!found) throw new HttpError(404, "That student is not in this course.");
    if (!found.endedAt)
      await this.store.put("enrollment", {
        ...found,
        endedAt: new Date().toISOString(),
      });
  }
  async activeEnrollments(filter: {
    learnerId?: string;
    courseId?: string;
  }): Promise<Enrollment[]> {
    return (await this.list("enrollment")).filter(
      (e) =>
        !e.endedAt &&
        (filter.learnerId === undefined || e.learnerId === filter.learnerId) &&
        (filter.courseId === undefined || e.courseId === filter.courseId),
    );
  }
  async rosterIds(courseId: string): Promise<string[]> {
    return (await this.activeEnrollments({ courseId })).map((e) => e.learnerId);
  }
  async studentCourses(learnerId: string): Promise<StudentCourse[]> {
    const [enrollments, courses, assignments, attempts, posts] = await Promise.all([
      this.activeEnrollments({ learnerId }),
      this.list("course"),
      this.list("assignment"),
      this.list("attempt"),
      this.list("post"),
    ]);
    return enrollments.flatMap((e) => {
      const course = courses.find((c) => c.id === e.courseId);
      if (!course) return [];
      return [
        {
          id: course.id,
          title: course.title,
          posts: visiblePosts(posts, course.id),
          assignments: assignments
            .filter((a) => a.courseId === course.id && a.state === "posted")
            .map((a) => ({
              id: a.id,
              title: a.title,
              dueDate: a.dueDate,
              status: workStatus(
                attempts.filter(
                  (t) => t.learnerId === learnerId && t.assignmentId === a.id,
                ),
              ),
            })),
        },
      ];
    });
  }
  async member(
    learner: { id: string; email: string },
    course: Course,
  ): Promise<boolean> {
    return (
      course.teacherId === normalizeEmail(learner.email) ||
      (await this.activeEnrollments({ learnerId: learner.id, courseId: course.id }))
        .length > 0
    );
  }
  async takeable(
    learner: { id: string; email: string },
    assignmentId: string,
  ): Promise<{ assignment: Assignment; course: Course }> {
    const assignment = await this.assignment(assignmentId).catch(() => null),
      course = assignment
        ? await this.course(assignment.courseId).catch(() => null)
        : null;
    const allowed =
      assignment &&
      course &&
      assignment.state === "posted" &&
      (await this.member(learner, course));
    if (!assignment || !course || !allowed)
      throw new HttpError(404, "Assignment not found.");
    return { assignment, course };
  }
  async teacherCourse(course: Course): Promise<TeacherCourse> {
    const [enrollments, learners, assignments, attempts, posts] =
      await Promise.all([
        this.activeEnrollments({ courseId: course.id }),
        this.list("learner"),
        this.list("assignment"),
        this.list("attempt"),
        this.list("post"),
      ]);
    const rosterIds = enrollments.map((e) => e.learnerId),
      roster = learners.filter((l) => rosterIds.includes(l.id));
    return {
      course,
      roster: enrollments.map((e) => ({
        learnerId: e.learnerId,
        name: learners.find((l) => l.id === e.learnerId)?.name ?? e.learnerId,
        joinedAt: e.joinedAt,
      })),
      posts: visiblePosts(posts, course.id),
      assignments: assignments
        .filter((a) => a.courseId === course.id)
        .map((a) => {
          const statuses = rosterIds.map((learnerId) =>
            workStatus(
              attempts.filter(
                (t) => t.learnerId === learnerId && t.assignmentId === a.id,
              ),
            ),
          );
          return {
            id: a.id,
            title: a.title,
            state: a.state,
            locked: a.locked,
            dueDate: a.dueDate,
            enrolled: rosterIds.length,
            completed: statuses.filter(isComplete).length,
            waiting: statuses.filter((s) => s.kind === "waiting").length,
            gapConcepts: projectRecap(a, roster, attempts).filter(
              (row) => row.gaps.length > 0,
            ).length,
          };
        }),
    };
  }
  async createDraft(course: Course): Promise<Assignment> {
    const assignment: Assignment = {
      id: randomUUID(),
      courseId: course.id,
      title: "",
      question: "",
      reference: "",
      profile: "curious",
      concepts: [],
      followups: [],
      state: "draft",
      locked: false,
      dueDate: null,
      revision: 0,
      createdAt: new Date().toISOString(),
    };
    await this.store.put("assignment", assignment);
    return assignment;
  }
  async save(id: string, input: AssignmentInput): Promise<Assignment> {
    const current = await this.assignment(id);
    if (current.state === "posted" && current.locked)
      throw new HttpError(409, "Students have started this assignment. Unlock it to edit.");
    let next = applyInput(current, input);
    if (current.state === "posted") {
      const problem = completenessProblem(next);
      if (problem) throw new HttpError(400, problem);
      rubricOf(next);
      const started = (await this.list("attempt")).some(
        (a) => a.assignmentId === id && !a.sample && a.mainAssessment,
      );
      if (started) next = { ...next, revision: current.revision + 1, locked: true };
    }
    await this.store.put("assignment", next);
    return next;
  }
  async post(id: string): Promise<Assignment> {
    const current = await this.assignment(id);
    const problem = completenessProblem(current);
    if (problem) throw new HttpError(400, problem);
    rubricOf(current);
    const posted: Assignment = { ...current, state: "posted" };
    await this.store.put("assignment", posted);
    return posted;
  }
  async unlock(id: string): Promise<Assignment> {
    const current = await this.assignment(id);
    if (current.state !== "posted")
      throw new HttpError(400, "Only a posted assignment can be locked.");
    const unlocked = { ...current, locked: false };
    await this.store.put("assignment", unlocked);
    return unlocked;
  }
  async findPost(id: string): Promise<Post> {
    const found = (await this.list("post")).find((p) => p.id === id && !p.removedAt);
    if (!found) throw new HttpError(404, "Post not found.");
    return found;
  }
  async createPost(
    course: Course,
    id: string,
    text: string,
    images: PostImage[],
  ): Promise<Post> {
    if (!text && images.length === 0)
      throw new HttpError(400, "Write something or add a picture.");
    const post: Post = {
      id,
      courseId: course.id,
      text,
      images,
      createdAt: new Date().toISOString(),
      removedAt: null,
    };
    await this.store.put("post", post);
    return post;
  }
  async removePost(post: Post): Promise<void> {
    await this.store.put("post", { ...post, removedAt: new Date().toISOString() });
  }
  async welcome(courseId: string, learnerId: string, email: string): Promise<void> {
    const course = (await this.list("course")).find((c) => c.id === courseId);
    if (!course || course.teacherId === normalizeEmail(email)) return;
    const id = enrollmentId(course.id, learnerId);
    if ((await this.list("enrollment")).some((e) => e.id === id)) return;
    await this.store.put("enrollment", {
      id,
      courseId: course.id,
      learnerId,
      joinedAt: new Date().toISOString(),
      endedAt: null,
    });
  }
}
