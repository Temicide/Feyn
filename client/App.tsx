import { useState, useEffect } from "react";
import { z } from "zod";
import {
  type Me,
  meSchema,
  signInOptionsSchema,
  type SignInOptions,
} from "../shared/contracts.js";
import { api, json } from "./api.js";
import { AssignmentPage } from "./Assignment.js";
import { AssignmentForm } from "./AssignmentForm.js";
import { CoursePage, StudentHome } from "./Courses.js";
import { href, useRoute, type Route } from "./route.js";
import { Teacher } from "./Teacher.js";
import { DeskHome, TeacherCoursePage } from "./TeacherCourses.js";
import { Typed } from "./Typed.js";

type Session =
  | { kind: "checking" }
  | { kind: "signed-out"; options: SignInOptions }
  | { kind: "signed-in"; me: Me };
export function App() {
  const [session, setSession] = useState<Session>({ kind: "checking" }),
    [failure, setFailure] = useState("");
  async function check() {
    const response = await fetch("/api/me");
    const raw: unknown = await response.json();
    setSession(
      response.status === 401
        ? { kind: "signed-out", options: signInOptionsSchema.parse(raw) }
        : { kind: "signed-in", me: meSchema.parse(raw) },
    );
  }
  useEffect(() => {
    if (new URLSearchParams(location.search).get("signin") === "failed") {
      setFailure("Google sign-in did not finish. Try again.");
      history.replaceState(null, "", "/");
    }
    void check().catch(() =>
      setFailure("Could not reach Feyn. Reload to try again."),
    );
  }, []);
  async function signOut() {
    await api("/auth/logout", z.object({}), json("POST", {}));
    await check();
  }
  if (session.kind === "signed-in")
    return <Classroom me={session.me} onSignOut={signOut} />;
  return (
    <main className="signin">
      <div className="signin-card">
        <img className="signin-logo" src="/brand/feyn-logo.png" alt="Feyn" />
        <p className="signin-tagline">Learn an idea by teaching it to Pip.</p>
        <div className="pip-says">
          <img className="pixel-avatar" src="/art/child-listening.png" alt="" />
          <p className="bubble">
            <Typed text="Hi, I'm Pip! Will you teach me something today? Sign in so I remember what you taught me." />
          </p>
        </div>
        {session.kind === "checking" ? (
          <span className="thinking-dots" role="status">
            <i />
            <i />
            <i />
            <span className="visually-hidden">Checking your sign-in</span>
          </span>
        ) : session.options.google ? (
          <a
            className="choice choice-primary choice-wide"
            href="/api/auth/google"
          >
            Sign in with Google
          </a>
        ) : (
          <p className="fine-print">
            Google sign-in isn't set up on this server.
          </p>
        )}
        {session.kind === "signed-out" && session.options.devLogin && (
          <form className="dev-login" action="/api/auth/dev" method="get">
            <h2>Local test account</h2>
            <label>
              Email
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              Name
              <input name="name" autoComplete="off" />
            </label>
            <button className="choice">Sign in locally</button>
          </form>
        )}
        {failure && (
          <p className="error" role="alert">
            {failure}
          </p>
        )}
      </div>
    </main>
  );
}
function Classroom({
  me,
  onSignOut,
}: {
  me: Me;
  onSignOut: () => Promise<void>;
}) {
  const route = useRoute(),
    [context, setContext] = useState("");
  const teaching =
    me.role === "teacher" &&
    (route.kind === "desk" ||
      route.kind === "teach-course" ||
      route.kind === "evidence" ||
      route.kind === "edit");
  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-left">
          <a
            className="appbar-brand"
            aria-label="Feyn, back to your courses"
            href={href({ kind: "courses" })}
          >
            <img src="/brand/feyn-logo.png" alt="" />
          </a>
          {context && (
            <p className="appbar-class">
              <span>{context}</span>
            </p>
          )}
        </div>
        <nav className="appbar-tabs" aria-label="Main navigation">
          <a
            aria-current={!teaching ? "page" : undefined}
            href={href({ kind: "courses" })}
          >
            Courses
          </a>
          {me.role === "teacher" && (
            <a
              aria-current={teaching ? "page" : undefined}
              href={href({ kind: "desk" })}
            >
              Teacher's desk
            </a>
          )}
        </nav>
        <div className="account">
          <span className="avatar" aria-hidden="true">
            {initial(me.name)}
          </span>
          <span className="account-name" title={me.email}>
            {me.name}
          </span>
          <button className="link-button" onClick={() => void onSignOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="page">
        <Page route={route} me={me} setContext={setContext} />
      </main>
      <footer className="site-footer">
        Prototype. Evidence is saved on the Feyn server.
      </footer>
    </div>
  );
}
function Page({
  route,
  me,
  setContext,
}: {
  route: Route;
  me: Me;
  setContext: (text: string) => void;
}) {
  if (
    me.role !== "teacher" &&
    route.kind !== "course" &&
    route.kind !== "assignment"
  )
    return <StudentHome setContext={setContext} />;
  switch (route.kind) {
    case "courses":
      return <StudentHome setContext={setContext} />;
    case "course":
      return (
        <CoursePage
          key={route.courseId}
          courseId={route.courseId}
          setContext={setContext}
        />
      );
    case "assignment":
      return (
        <AssignmentPage
          key={route.assignmentId}
          assignmentId={route.assignmentId}
          me={me}
          setContext={setContext}
        />
      );
    case "desk":
      return <DeskHome setContext={setContext} />;
    case "teach-course":
      return (
        <TeacherCoursePage
          key={route.courseId}
          courseId={route.courseId}
          setContext={setContext}
        />
      );
    case "evidence":
      return (
        <Teacher
          key={`${route.assignmentId}/${route.attemptId}`}
          assignmentId={route.assignmentId}
          selectedAttemptId={route.attemptId}
          learnerId={me.learnerId}
          setContext={setContext}
        />
      );
    case "edit":
      return (
        <AssignmentForm
          key={route.assignmentId}
          assignmentId={route.assignmentId}
          setContext={setContext}
        />
      );
  }
}
function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}
