import { useEffect, useState } from "react";
import { z } from "zod";
import {
  answerSchema,
  attemptSchema,
  bootstrapSchema,
  reviewedTranscript,
  type Answer,
  type Attempt,
  type Bootstrap,
  type Profile,
} from "../shared/contracts.js";
import { api, json } from "./api.js";
import { Recorder } from "./Recorder.js";
import { Scene } from "./Scene.js";
import { Teacher } from "./Teacher.js";

type StudentStage =
  | { kind: "assignment" }
  | { kind: "record"; attempt: Attempt; initialAnswer: Answer | null }
  | { kind: "preparing"; attempt: Attempt; answer: Answer }
  | {
      kind: "scene";
      attempt: Attempt;
      answer: Answer;
      diagnosticAnswers: Answer[];
    }
  | { kind: "finished"; attempt: Attempt };
export function App() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null),
    [view, setView] = useState<"student" | "teacher">("student"),
    [stage, setStage] = useState<StudentStage>({ kind: "assignment" }),
    [error, setError] = useState(""),
    [processing, setProcessing] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [brandMissing, setBrandMissing] = useState(false),
    [teacherAttemptId, setTeacherAttemptId] = useState<string | null>(null);
  async function load() {
    const data = await api("/bootstrap", bootstrapSchema);
    setBootstrap(data);
    return data;
  }
  useEffect(() => {
    void load().catch((e) =>
      setError(
        e instanceof Error ? e.message : "Could not reach the local app.",
      ),
    );
  }, []);
  async function start(sample: boolean) {
    if (!bootstrap) return;
    setError("");
    try {
      const attempt = await api(
        "/attempts",
        attemptSchema,
        json("POST", {
          profile: bootstrap.profile,
          sample,
          reviewedOpportunity: reviewed,
        }),
      );
      setStage({ kind: "record", attempt, initialAnswer: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not begin.");
    }
  }
  async function submitMain(answer: Answer) {
    if (stage.kind !== "record") return;
    const attempt = stage.attempt;
    setStage({ kind: "preparing", attempt, answer });
    try {
      const result = await api(
        `/attempts/${attempt.id}/submit`,
        attemptSchema,
        json("POST", { answerId: answer.id }),
      );
      setStage({
        kind: "scene",
        attempt: result,
        answer,
        diagnosticAnswers: [],
      });
      await load();
    } catch (e) {
      setStage({ kind: "record", attempt, initialAnswer: answer });
      setError(
        e instanceof Error
          ? e.message
          : "Assessment could not finish. Your recording is saved.",
      );
    }
  }
  async function submitDiagnostic(answer: Answer) {
    if (stage.kind !== "scene") return;
    setProcessing(true);
    try {
      const result = await api(
        `/attempts/${stage.attempt.id}/submit`,
        attemptSchema,
        json("POST", { answerId: answer.id }),
      );
      setStage({
        ...stage,
        attempt: result,
        diagnosticAnswers: [...stage.diagnosticAnswers, answer],
      });
      await load();
    } finally {
      setProcessing(false);
    }
  }
  async function finish() {
    if (stage.kind !== "scene") return;
    const attempt = await api(
      `/attempts/${stage.attempt.id}/finish`,
      attemptSchema,
      json("POST", {}),
    );
    setStage({ kind: "finished", attempt });
    await load();
  }
  async function changeProfile(profile: Profile) {
    await api(
      "/profile",
      z.object({ profile: z.enum(["curious", "playful"]) }),
      json("PUT", { profile }),
    );
    await load();
  }
  const lesson = bootstrap?.lesson;
  return (
    <>
      <header className="site-header">
        <a
          className="wordmark"
          aria-label="Feyn home"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setView("student");
          }}
        >
          {!brandMissing && (
            <img
              src="/brand/feyn-logo.png"
              alt=""
              onError={() => setBrandMissing(true)}
            />
          )}
          <span>
            feyn<span className="brand-dot">✦</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={view === "student" ? "active" : ""}
            onClick={() => setView("student")}
          >
            Your classroom
          </button>
          <button
            className={view === "teacher" ? "active" : ""}
            onClick={() => {
              setTeacherAttemptId(null);
              setView("teacher");
            }}
          >
            Teacher’s desk
          </button>
        </nav>
        <div className="header-note">
          A little teaching. A lot of understanding.
        </div>
      </header>
      <main>
        {!bootstrap ? (
          <div className="opening">
            <span className="thinking-dots">•••</span>
            <p>{error || "Opening your classroom"}</p>
          </div>
        ) : view === "teacher" ? (
          <Teacher
            selectedAttemptId={teacherAttemptId}
            lesson={bootstrap.lesson}
            profile={bootstrap.profile}
            onProfile={changeProfile}
          />
        ) : (
          <>
            {error && (
              <div className="global-error" role="alert">
                {error}
                <button onClick={() => setError("")} aria-label="Dismiss error">
                  ×
                </button>
              </div>
            )}
            {stage.kind === "assignment" && lesson && (
              <div className="assignment-page">
                <div className="lesson-intro">
                  <div className="eyebrow">
                    <span className="tiny-star">✦</span> LEARN IT BY TEACHING IT
                  </div>
                  <h1>
                    You’ve got an idea.
                    <br />
                    <em>Help it click for Pip.</em>
                  </h1>
                  <p className="intro-copy">
                    A small classroom. A curious mind.
                    <br />
                    Explain it in your own words and see what happens.
                  </p>
                  <div className="lesson-meta">
                    <span>01</span>
                    <div>
                      <b>{lesson.title}</b>
                      <small>{lesson.subject}</small>
                    </div>
                  </div>
                  <div className="intro-footer">
                    <img
                      src="/art/child-listening.svg"
                      alt="Pip, your curious learning partner"
                    />
                    <p>
                      “I know what distance is.
                      <br />
                      But what does speed mean for one moment?”
                      <span>
                        PIP · YOUR {bootstrap.profile.toUpperCase()} LISTENER
                      </span>
                    </p>
                  </div>
                </div>
                <section className="lesson-paper">
                  <div className="paper-top">
                    <span className="section-label">YOUR TEACHING PROMPT</span>
                    <span className="paper-number">LESSON 001</span>
                  </div>
                  <div className="formula-strip">
                    <span>s(t) = t²</span>
                    <div>
                      distance in meters
                      <br />
                      time in seconds
                    </div>
                    <div className="cart-doodle">
                      ▱<i />
                      <i />
                    </div>
                  </div>
                  <h2>
                    What does speed mean
                    <br />
                    at exactly three seconds?
                  </h2>
                  <p>{lesson.question}</p>
                  <div className="paper-rule" />
                  <div className="what-to-do">
                    <span className="step-number">1</span>
                    <div>
                      <b>Explain it aloud.</b>
                      <p>
                        Help Pip understand the meaning, not just the formula.
                      </p>
                    </div>
                  </div>
                  <div className="what-to-do">
                    <span className="step-number">2</span>
                    <div>
                      <b>Explore an example together.</b>
                      <p>
                        Pip asks a question. You take all the time you need.
                      </p>
                    </div>
                  </div>
                  {bootstrap.learner.completedAt && (
                    <div className="earned-completion">
                      ✦ You’ve completed this explanation. More practice keeps
                      your completion.
                    </div>
                  )}
                  {bootstrap.attempts.length > 0 && (
                    <label className="review-opportunity">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        onChange={(event) => setReviewed(event.target.checked)}
                      />{" "}
                      I reviewed the material and am trying a fresh explanation.
                    </label>
                  )}
                  <button
                    className="button primary start-button"
                    onClick={() => void start(false)}
                  >
                    Enter the classroom <span>→</span>
                  </button>
                  <button
                    className="sample-link"
                    onClick={() => void start(true)}
                  >
                    Take a clearly labeled sample walkthrough
                  </button>
                  <div className="provider-line">
                    <span
                      className={
                        bootstrap.providers.transcription ? "ready" : "missing"
                      }
                    />{" "}
                    {bootstrap.providers.transcription
                      ? "Speech recognition configured"
                      : "Speech recognition needs a server key"}{" "}
                    <span
                      className={
                        bootstrap.providers.assessment ? "ready" : "missing"
                      }
                    />{" "}
                    {bootstrap.providers.assessment
                      ? "Local AI gateway"
                      : "Sample mode available"}
                  </div>
                </section>
                <div className="assignment-bottom">
                  <span>Speak. Reflect. Make it your own.</span>
                  <span>One lesson at a time.</span>
                </div>
              </div>
            )}
            {stage.kind === "record" && lesson && (
              <div className="record-page">
                <button
                  className="back-link"
                  onClick={() => setStage({ kind: "assignment" })}
                >
                  ← Back to your lesson
                </button>
                <div className="record-layout">
                  <section className="record-context">
                    <div className="eyebrow">YOUR TURN TO TEACH</div>
                    <h1>
                      Make a moment
                      <br />
                      <em>make sense.</em>
                    </h1>
                    <p>{lesson.question}</p>
                    <div className="formula-note">
                      s(t) = t² <small>What happens at t = 3?</small>
                    </div>
                    <div className="record-pip">
                      <img src="/art/child-listening.svg" alt="Pip listening" />
                      <p>
                        “I’m all ears.”<span>PIP</span>
                      </p>
                    </div>
                  </section>
                  <section className="record-paper">
                    <div className="section-label">
                      YOUR EXPLANATION{" "}
                      {stage.attempt.sample && <span>SAMPLE WALKTHROUGH</span>}
                    </div>
                    {stage.attempt.sample && (
                      <p className="sample-notice">
                        This walkthrough uses prepared words. Choose the sample
                        transcript below, or upload synthetic audio to exercise
                        real speech recognition.
                      </p>
                    )}
                    <Recorder
                      key={stage.attempt.id}
                      attempt={stage.attempt}
                      kind="main"
                      initialAnswer={stage.initialAnswer}
                      onSubmit={submitMain}
                    />
                    <p className="fine-print">
                      Audio is sent to ElevenLabs for transcription. Reviewed
                      text is sent to the configured AI assessor.
                    </p>
                    <div className="record-guidance">
                      <span>✧</span>
                      <p>
                        Think of a friend who’s seeing this for the first time.
                        <br />A clear example can go a long way.
                      </p>
                    </div>
                  </section>
                </div>
              </div>
            )}
            {stage.kind === "preparing" && (
              <div className="preparing-page" role="status">
                <div className="preparing-art">
                  <img src="/art/child-thinking.svg" alt="Pip thinking" />
                  <span className="thinking-dots">•••</span>
                </div>
                <div className="eyebrow">GETTING THE CLASSROOM READY</div>
                <h1>Preparing scenarios</h1>
                <p>Pip is finding a question for your explanation.</p>
                <p className="fine-print">
                  Your complete explanation is being assessed against the lesson
                  criteria.
                </p>
              </div>
            )}
            {stage.kind === "scene" && lesson && (
              <Scene
                attempt={stage.attempt}
                answer={stage.answer}
                diagnosticAnswers={stage.diagnosticAnswers}
                lesson={lesson}
                onSubmit={submitDiagnostic}
                onFinish={finish}
                onRetry={() => start(stage.attempt.sample)}
                processing={processing}
              />
            )}
            {stage.kind === "finished" && (
              <div className="finished-page">
                <img
                  src={`/art/child-${stage.attempt.mainAssessment?.outcome === "pass" ? "aha" : "listening"}.svg`}
                  alt="Pip"
                />
                <div className="eyebrow">UNTIL NEXT TIME</div>
                <h1>
                  {stage.attempt.mainAssessment?.outcome === "pass"
                    ? "A little clearer."
                    : "Keep the curiosity."}
                </h1>
                <p>
                  {stage.attempt.mainAssessment?.outcome === "pass"
                    ? "Your main explanation earned completion. The examples stay in your learning history."
                    : "Your explanation and examples are saved. You can review and try again whenever you’re ready."}
                </p>
                {bootstrap.learner.completedAt &&
                  stage.attempt.mainAssessment?.outcome !== "pass" && (
                    <p className="earned-completion">
                      Your earlier earned completion is still yours.
                    </p>
                  )}
                <div className="recorder-actions">
                  <button
                    className="button primary"
                    onClick={() => setStage({ kind: "assignment" })}
                  >
                    Back to your lesson
                  </button>
                  <button
                    className="button"
                    onClick={() => {
                      setTeacherAttemptId(stage.attempt.id);
                      setView("teacher");
                    }}
                  >
                    Open teacher evidence →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>
          feyn <span>✦</span> Ideas grow when you share them.
        </span>
        <span>Local prototype · Evidence saved locally</span>
      </footer>
    </>
  );
}
