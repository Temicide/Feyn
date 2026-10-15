import { useEffect, useState } from "react";
import { z } from "zod";
import {
  studentCourseSchema,
  studentCoursesSchema,
  type StudentCourse,
} from "../shared/contracts.js";
import { api, json } from "./api.js";
import { go, href } from "./route.js";
import {
  Confirm,
  dueLabel,
  ErrorBanner,
  failure,
  Loading,
  Sparkle,
  StatusChip,
} from "./ui.js";

type Card = StudentCourse["assignments"][number];

function nextUp(course: StudentCourse): Card | undefined {
  return course.assignments
    .filter((a) => !a.completedAt)
    .toSorted((a, b) =>
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
    )[0];
}

function useCourses() {
  const [courses, setCourses] = useState<StudentCourse[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/courses", studentCoursesSchema).then(setCourses, (e) =>
      setError(failure(e, "Could not load your courses.")),
    );
  }, []);
  return { courses, error, setError };
}

export function StudentHome({
  setContext,
}: {
  setContext: (text: string) => void;
}) {
  const { courses, error, setError } = useCourses();
  useEffect(() => setContext(""), [setContext]);
  return (
    <div className="home">
      <div className="page-heading">
        <div>
          <h1>Your courses</h1>
          <p>Pick a course to see what Pip is waiting to learn.</p>
        </div>
        <JoinForm />
      </div>
      <ErrorBanner error={error} onDismiss={() => setError("")} />
      {!courses ? (
        !error && <Loading text="Opening your courses" />
      ) : courses.length === 0 ? (
        <article className="card post empty-state">
          <img
            className="pixel-avatar"
            src="/art/child-listening.png"
            alt=""
          />
          <div className="post-body">
            <p className="post-title">No courses yet</p>
            <p className="bubble">
              Ask your teacher for a join code, then type it in above. I'll be
              here when you're ready!
            </p>
          </div>
        </article>
      ) : (
        <div className="course-grid">
          {courses.map((course) => {
            const next = nextUp(course),
              due = dueLabel(next?.dueDate ?? null);
            return (
              <a
                key={course.id}
                className="card course-card"
                href={href({ kind: "course", courseId: course.id })}
              >
                <span className="course-card-banner">
                  <span>{course.title}</span>
                </span>
                <span className="course-card-body">
                  <span className="post-meta">
                    {course.assignments.length === 0
                      ? "No assignments yet"
                      : `${course.assignments.length} ${course.assignments.length === 1 ? "assignment" : "assignments"}`}
                  </span>
                  <span className="course-card-next">
                    {next
                      ? `Next: ${next.title}${due ? ` · ${due}` : ""}`
                      : course.assignments.length > 0
                        ? "All caught up"
                        : "Nothing to do yet"}
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function JoinForm() {
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function join() {
    setBusy(true);
    setError("");
    try {
      const course = await api(
        "/courses/join",
        studentCourseSchema,
        json("POST", { code }),
      );
      go({ kind: "course", courseId: course.id });
    } catch (e) {
      setError(failure(e, "Could not join that course."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="card join-form"
      onSubmit={(event) => {
        event.preventDefault();
        void join();
      }}
    >
      <label htmlFor="join-code">Join a course</label>
      <div className="join-row">
        <input
          id="join-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Class code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
        />
        <button
          className="choice choice-primary"
          disabled={busy || !code.trim()}
        >
          {busy ? "Joining" : "Join"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function CoursePage({
  courseId,
  setContext,
}: {
  courseId: string;
  setContext: (text: string) => void;
}) {
  const { courses, error, setError } = useCourses();
  const course = courses?.find((c) => c.id === courseId);
  useEffect(() => setContext(course?.title ?? ""), [course?.title, setContext]);
  async function leave() {
    try {
      await api(`/courses/${courseId}/leave`, z.object({}), json("POST", {}));
      go({ kind: "courses" });
    } catch (e) {
      setError(failure(e, "Could not leave the course."));
    }
  }
  if (!courses)
    return error ? (
      <ErrorBanner error={error} onDismiss={() => setError("")} />
    ) : (
      <Loading text="Opening your course" />
    );
  if (!course)
    return (
      <div className="home">
        <a className="link-button back-link" href={href({ kind: "courses" })}>
          Your courses
        </a>
        <p className="fine-print">
          This course isn't in your list. If you left it, join again with its
          code and your earlier work comes back.
        </p>
      </div>
    );
  const upcoming = course.assignments
    .filter((a) => !a.completedAt)
    .toSorted((a, b) =>
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
    );
  return (
    <div className="stream">
      <ErrorBanner error={error} onDismiss={() => setError("")} />
      <section className="class-banner" aria-labelledby="class-title">
        <div>
          <h1 id="class-title">{course.title}</h1>
          <p>Teaching lab with Pip</p>
        </div>
        <img src="/art/classroom.svg" alt="" />
      </section>
      <div className="stream-grid">
        <aside className="card upcoming">
          <h2>Upcoming</h2>
          {upcoming.length === 0 ? (
            <p className="fine-print">Nothing due right now.</p>
          ) : (
            upcoming.slice(0, 3).map((a) => (
              <a
                key={a.id}
                className="upcoming-item"
                href={href({ kind: "assignment", assignmentId: a.id })}
              >
                <span>{dueLabel(a.dueDate) ?? "Due when you're ready"}</span>
                {a.title}
              </a>
            ))
          )}
        </aside>
        <div className="stream-posts">
          {course.assignments.length === 0 && (
            <p className="card post fine-print">
              Nothing posted yet. New assignments from your teacher will show
              up here.
            </p>
          )}
          {course.assignments.map((a) => {
            const due = dueLabel(a.dueDate);
            return (
              <a
                key={a.id}
                className="card post post-assignment"
                href={href({ kind: "assignment", assignmentId: a.id })}
              >
                <span className="post-icon" aria-hidden="true">
                  <Sparkle />
                </span>
                <span className="post-body">
                  <span className="post-title">New assignment: {a.title}</span>
                  <span className="post-meta">
                    {due ? `${due} · ` : ""}Teach Pip out loud, then answer a
                    question or two
                  </span>
                </span>
                <StatusChip completed={Boolean(a.completedAt)} />
              </a>
            );
          })}
          <article className="card post">
            <img
              className="pixel-avatar"
              src="/art/child-puzzled.png"
              alt=""
            />
            <div className="post-body">
              <p className="post-title">Pip</p>
              <p className="bubble">
                I'm ready to learn! Explain it to me like I've never heard of
                it, and I'll ask you about the tricky parts.
              </p>
            </div>
          </article>
          <div className="course-actions">
            <Confirm
              label="Leave course"
              question="Leave this course?"
              confirmLabel="Leave course"
              onConfirm={leave}
            >
              Your work is kept. Join again with the code to pick up where you
              left off.
            </Confirm>
          </div>
        </div>
      </div>
    </div>
  );
}
