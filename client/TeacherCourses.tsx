import { useEffect, useState } from "react";
import { z } from "zod";
import {
  assignmentSchema,
  courseSchema,
  teacherCourseSchema,
  teacherCoursesSchema,
  type TeacherCourse,
} from "../shared/contracts.js";
import { api, json } from "./api.js";
import { PostCard, PostComposer } from "./Posts.js";
import { go, href } from "./route.js";
import { Confirm, dueLabel, ErrorBanner, failure, Loading } from "./ui.js";

type CourseRow = z.infer<typeof teacherCoursesSchema>[number];

export function DeskHome({
  setContext,
}: {
  setContext: (text: string) => void;
}) {
  const [courses, setCourses] = useState<CourseRow[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => setContext(""), [setContext]);
  useEffect(() => {
    api("/teacher/courses", teacherCoursesSchema).then(setCourses, (e) =>
      setError(failure(e, "Could not load your courses.")),
    );
  }, []);
  return (
    <div className="teacher-page">
      <div className="page-heading">
        <div>
          <h1>Teacher's desk</h1>
          <p>
            Your courses, their join codes, and the evidence your students leave
            when they teach Pip.
          </p>
        </div>
      </div>
      <ErrorBanner error={error} onDismiss={() => setError("")} />
      <div className="desk-grid">
        <div className="stream-posts">
          {!courses ? (
            !error && <Loading text="Opening your courses" />
          ) : courses.length === 0 ? (
            <p className="card post fine-print">
              You don't teach any courses yet. Create one, then share its join
              code with your students.
            </p>
          ) : (
            courses.map((course) => (
              <a
                key={course.id}
                className="card post post-assignment teach-course-row"
                href={href({ kind: "teach-course", courseId: course.id })}
              >
                <span className="post-body">
                  <span className="post-title">{course.title}</span>
                  <span className="post-meta">
                    {course.students}{" "}
                    {course.students === 1 ? "student" : "students"} ·{" "}
                    {course.posted} posted
                  </span>
                </span>
                <span className="join-code join-code-sm" title="Join code">
                  {course.joinCode}
                </span>
              </a>
            ))
          )}
        </div>
        <div className="desk-side">
          <CreateCourse />
          <AddTeacher />
        </div>
      </div>
    </div>
  );
}

function CreateCourse() {
  const [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const course = await api(
        "/courses",
        courseSchema,
        json("POST", { title }),
      );
      go({ kind: "teach-course", courseId: course.id });
    } catch (e) {
      setError(failure(e, "Could not create the course."));
      setBusy(false);
    }
  }
  return (
    <form
      className="card side-form"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <h2>Create course</h2>
      <label>
        Course name
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Physics 2 · Period 3"
          maxLength={120}
        />
      </label>
      <button
        className="choice choice-primary"
        disabled={busy || !title.trim()}
      >
        {busy ? "Creating" : "Create course"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function AddTeacher() {
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  async function add() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await api("/teachers", z.object({}), json("POST", { email }));
      setNote(`${email.trim()} can now create courses.`);
      setEmail("");
    } catch (e) {
      setError(failure(e, "Could not add that teacher."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="card side-form"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <h2>Add a teacher</h2>
      <label>
        Their email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="colleague@school.edu"
          autoComplete="off"
        />
      </label>
      <button className="choice" disabled={busy || !email.trim()}>
        {busy ? "Adding" : "Add teacher"}
      </button>
      {note && <p className="fine-print">{note}</p>}
      {error && <p className="error">{error}</p>}
      <p className="fine-print">
        Teachers see only the courses they create.
      </p>
    </form>
  );
}

export function TeacherCoursePage({
  courseId,
  setContext,
}: {
  courseId: string;
  setContext: (text: string) => void;
}) {
  const [data, setData] = useState<TeacherCourse | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"assignments" | "posts" | "students">("assignments"),
    [copied, setCopied] = useState(false),
    [creating, setCreating] = useState(false);
  async function load() {
    try {
      setData(await api(`/teacher/courses/${courseId}`, teacherCourseSchema));
    } catch (e) {
      setError(failure(e, "Could not open the course."));
    }
  }
  useEffect(() => {
    void load();
  }, [courseId]);
  useEffect(
    () => setContext(data?.course.title ?? ""),
    [data?.course.title, setContext],
  );
  async function act(task: () => Promise<unknown>, fallback: string) {
    setError("");
    try {
      await task();
      await load();
    } catch (e) {
      setError(failure(e, fallback));
    }
  }
  async function newAssignment() {
    setCreating(true);
    setError("");
    try {
      const draft = await api(
        `/teacher/courses/${courseId}/assignments`,
        assignmentSchema,
        json("POST", {}),
      );
      go({ kind: "edit", assignmentId: draft.id });
    } catch (e) {
      setError(failure(e, "Could not start a new assignment."));
      setCreating(false);
    }
  }
  async function unlock(assignmentId: string) {
    setError("");
    try {
      await api(
        `/teacher/assignments/${assignmentId}/unlock`,
        assignmentSchema,
        json("POST", {}),
      );
      go({ kind: "edit", assignmentId });
    } catch (e) {
      setError(failure(e, "Could not unlock the assignment."));
    }
  }
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const shown = document.querySelector(".code-card .join-code");
      if (shown) getSelection()?.selectAllChildren(shown);
      setError("This browser blocked copying. The code is selected, so press Ctrl+C or ⌘C.");
    }
  }
  if (!data)
    return error ? (
      <div className="teacher-page">
        <a className="link-button back-link" href={href({ kind: "desk" })}>
          Your courses
        </a>
        <p className="error">{error}</p>
      </div>
    ) : (
      <Loading text="Opening the course" />
    );
  const { course, roster, assignments, posts } = data;
  return (
    <div className="teacher-page">
      <a className="link-button back-link" href={href({ kind: "desk" })}>
        Your courses
      </a>
      <section className="class-banner course-head" aria-labelledby="course-title">
        <div>
          <h1 id="course-title">{course.title}</h1>
          <p>
            {roster.length} {roster.length === 1 ? "student" : "students"}
          </p>
        </div>
        <div className="code-card">
          <span className="code-label">Join code</span>
          <span className="join-code">{course.joinCode}</span>
          <div className="code-actions">
            <button
              className="choice"
              onClick={() => void copy(course.joinCode)}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <Confirm
              className="choice"
              label="New code"
              question="Make a new join code?"
              confirmLabel="Make new code"
              onConfirm={() =>
                act(
                  () =>
                    api(
                      `/teacher/courses/${courseId}/code`,
                      courseSchema,
                      json("POST", {}),
                    ),
                  "Could not make a new code.",
                )
              }
            >
              The old code stops working. Students already in the course stay.
            </Confirm>
          </div>
        </div>
      </section>
      <ErrorBanner error={error} onDismiss={() => setError("")} />
      <div className="teacher-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "assignments"}
          onClick={() => setTab("assignments")}
        >
          Assignments
        </button>
        <button
          role="tab"
          aria-selected={tab === "posts"}
          onClick={() => setTab("posts")}
        >
          Posts <span className="tab-count">{posts.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "students"}
          onClick={() => setTab("students")}
        >
          Students <span className="tab-count">{roster.length}</span>
        </button>
      </div>
      {tab === "assignments" && (
        <div className="stream-posts">
          <button
            className="choice choice-primary new-assignment"
            disabled={creating}
            onClick={() => void newAssignment()}
          >
            {creating ? "Starting a draft" : "New assignment"}
          </button>
          {assignments.length === 0 && (
            <p className="card post fine-print">
              No assignments yet. Write a question and a reference answer, and
              Pip will be ready for your students.
            </p>
          )}
          {assignments.map((a) => {
            const due = dueLabel(a.dueDate);
            return (
              <article key={a.id} className="card post teach-assignment">
                <div className="post-body">
                  <p className="post-title">
                    {a.title || "Untitled draft"}{" "}
                    <span
                      className={`status-chip ${a.state === "posted" ? "done" : ""}`}
                    >
                      {a.state === "draft"
                        ? "Draft"
                        : a.locked
                          ? "Posted · locked"
                          : "Posted"}
                    </span>
                  </p>
                  <p className="post-meta">
                    {a.state === "posted"
                      ? `${a.completed} of ${a.enrolled} completed · ${a.gapConcepts} ${a.gapConcepts === 1 ? "concept" : "concepts"} with current gaps`
                      : "Students can't see drafts."}
                    {due && ` · ${due}`}
                  </p>
                </div>
                <div className="post-actions">
                  {a.state === "posted" && (
                    <a
                      className="choice"
                      href={href({
                        kind: "evidence",
                        assignmentId: a.id,
                        attemptId: null,
                      })}
                    >
                      Open evidence
                    </a>
                  )}
                  {a.locked ? (
                    <button
                      className="link-button"
                      onClick={() => void unlock(a.id)}
                    >
                      Unlock to edit
                    </button>
                  ) : (
                    <a
                      className="link-button"
                      href={href({ kind: "edit", assignmentId: a.id })}
                    >
                      Edit
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {tab === "posts" && (
        <div className="stream-posts">
          <PostComposer courseId={courseId} onPosted={load} />
          {posts.length === 0 && (
            <p className="card post fine-print">
              No posts yet. Share news, reminders or pictures with your class.
            </p>
          )}
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              byline="You posted"
              onRemove={() =>
                act(
                  () =>
                    api(
                      `/teacher/posts/${encodeURIComponent(post.id)}`,
                      z.object({}),
                      { method: "DELETE" },
                    ),
                  "Could not delete the post.",
                )
              }
            />
          ))}
        </div>
      )}
      {tab === "students" && (
        <div className="card roster">
          {roster.length === 0 ? (
            <p className="fine-print">
              No students yet. Share the join code{" "}
              <b>{course.joinCode}</b> and they'll appear here.
            </p>
          ) : (
            roster.map((student) => (
              <div className="roster-row" key={student.learnerId}>
                <span className="avatar" aria-hidden="true">
                  {student.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <span className="roster-name">
                  {student.name}
                  <small>
                    Joined {new Date(student.joinedAt).toLocaleDateString()}
                  </small>
                </span>
                <Confirm
                  label="Remove"
                  question={`Remove ${student.name}?`}
                  confirmLabel="Remove"
                  onConfirm={() =>
                    act(
                      () =>
                        api(
                          `/teacher/courses/${courseId}/remove`,
                          z.object({}),
                          json("POST", { learnerId: student.learnerId }),
                        ),
                      "Could not remove that student.",
                    )
                  }
                >
                  Their attempts stay in the evidence. They can rejoin with a
                  current code.
                </Confirm>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
