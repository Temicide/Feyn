import { useEffect, useState } from "react";
import {
  attemptSchema,
  bootstrapSchema,
  type Answer,
  type Attempt,
  type Bootstrap,
  type Me,
} from "../shared/contracts.js";
import { isComplete } from "../shared/work-status.js";
import { api, json } from "./api.js";
import { Recorder } from "./Recorder.js";
import { go, href } from "./route.js";
import { Scene } from "./Scene.js";
import {
  dueLabel,
  ErrorBanner,
  failure,
  Loading,
  Sparkle,
  StatusChip,
} from "./ui.js";

type Stage =
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

export function AssignmentPage({
  assignmentId,
  me,
  setContext,
}: {
  assignmentId: string;
  me: Me;
  setContext: (text: string) => void;
}) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null),
    [stage, setStage] = useState<Stage>({ kind: "assignment" }),
    [error, setError] = useState(""),
    [processing, setProcessing] = useState(false),
    [reviewed, setReviewed] = useState(false);
  async function load() {
    const data = await api(
      `/assignments/${assignmentId}/bootstrap`,
      bootstrapSchema,
    );
    setBootstrap(data);
    return data;
  }
  useEffect(() => {
    load().catch((e) => setError(failure(e, "Could not open the assignment.")));
  }, [assignmentId]);
  useEffect(
    () => setContext(bootstrap?.courseTitle ?? ""),
    [bootstrap?.courseTitle, setContext],
  );
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stage.kind]);
  async function start(sample: boolean) {
    setError("");
    try {
      const attempt = await api(
        "/attempts",
        attemptSchema,
        json("POST", { assignmentId, sample, reviewedOpportunity: reviewed }),
      );
      setStage({ kind: "record", attempt, initialAnswer: null });
    } catch (e) {
      setError(failure(e, "Could not begin."));
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
      setStage({ kind: "scene", attempt: result, answer, diagnosticAnswers: [] });
      await load();
    } catch (e) {
      setStage({ kind: "record", attempt, initialAnswer: answer });
      setError(failure(e, "Assessment could not finish. Your recording is saved."));
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
  if (!bootstrap)
    return error ? (
      <div className="home">
        <a className="link-button back-link" href={href({ kind: "courses" })}>
          Your courses
        </a>
        <p className="fine-print">
          {error} It may have been taken down, or you may no longer be in its
          course.
        </p>
      </div>
    ) : (
      <Loading text="Opening the assignment" />
    );
  const { assignment } = bootstrap,
    completed = isComplete(bootstrap.status),
    due = dueLabel(assignment.dueDate),
    passed = (attempt: Attempt) => attempt.mainAssessment?.outcome === "pass";
  return (
    <>
      <ErrorBanner error={error} onDismiss={() => setError("")} />
      {stage.kind === "assignment" && (
        <div className="assignment">
          <div className="assignment-main">
            <a
              className="link-button back-link"
              href={href({ kind: "course", courseId: assignment.courseId })}
            >
              Back to {bootstrap.courseTitle}
            </a>
            <header className="assignment-head">
              <span className="post-icon" aria-hidden="true">
                <Sparkle />
              </span>
              <div>
                <h1>{assignment.title}</h1>
                <p>
                  {due ? `${due} · ` : ""}Pip is feeling {assignment.profile}{" "}
                  today.
                </p>
              </div>
            </header>
            <section className="chalkboard" aria-label="The question">
              <p className="board-title">{assignment.title}</p>
              <h2 className="board-question">{assignment.question}</h2>
            </section>
            <h2 className="section-heading">How it goes</h2>
            <ol className="quest-steps">
              <li>
                <b>Explain it aloud.</b> Help Pip understand the meaning, not
                just the formula.
              </li>
              <li>
                <b>Check your words.</b> Fix up to three misheard words, then
                send.
              </li>
              <li>
                <b>Try an example.</b> Pip asks a question. Take all the time
                you need.
              </li>
            </ol>
            <ul className="card setup-list" aria-label="Class setup">
              <li
                className={
                  bootstrap.providers.transcription ? "ready" : "missing"
                }
              >
                {bootstrap.providers.transcription
                  ? "Speech recognition is set up"
                  : "Speech recognition needs a server key"}
              </li>
              <li className={bootstrap.providers.assessment ? "ready" : "missing"}>
                {bootstrap.providers.assessment
                  ? `Assessed by ${bootstrap.providers.assessor}`
                  : "No assessor set up, so the sample uses a scripted result"}
              </li>
            </ul>
          </div>
          <aside className="card your-work">
            <div className="your-work-head">
              <h2>Your work</h2>
              <StatusChip completed={completed} />
            </div>
            {due && <p className="fine-print">{due}</p>}
            {completed && (
              <p className="gold-star">
                Completed. Practising again keeps your completion.
              </p>
            )}
            {bootstrap.attempts.length > 0 && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                I reviewed the material and am trying a fresh explanation.
              </label>
            )}
            <button
              className="choice choice-primary choice-wide"
              onClick={() => void start(false)}
            >
              {completed ? "Teach Pip again" : "Start teaching Pip"}
            </button>
            <button
              className="choice choice-wide"
              onClick={() => void start(true)}
            >
              Try the sample walkthrough
            </button>
            <p className="fine-print">
              {bootstrap.attempts.length === 0
                ? "No attempts yet."
                : `${bootstrap.attempts.length} saved ${bootstrap.attempts.length === 1 ? "attempt" : "attempts"}.`}
            </p>
          </aside>
        </div>
      )}
      {stage.kind === "record" && (
        <div className="record-page">
          <button
            className="link-button back-link"
            onClick={() => setStage({ kind: "assignment" })}
          >
            Back to the assignment
          </button>
          <h1>
            Explain it to Pip
            {stage.attempt.sample && (
              <span className="sample-tag">Sample walkthrough</span>
            )}
          </h1>
          <section
            className="chalkboard chalkboard-strip"
            aria-label="Your prompt"
          >
            <p className="board-title">{stage.attempt.rubric.title}</p>
            <p className="board-question">{stage.attempt.rubric.question}</p>
          </section>
          <section className="card record-card" aria-label="Your explanation">
            {stage.attempt.sample && (
              <p className="fine-print">
                This walkthrough uses prepared words. Choose the prepared
                transcript, or upload a recording to try real speech
                recognition.
              </p>
            )}
            <Recorder
              key={stage.attempt.id}
              attempt={stage.attempt}
              kind="main"
              initialAnswer={stage.initialAnswer}
              onSubmit={submitMain}
            />
          </section>
          <p className="fine-print">
            Audio goes to ElevenLabs for transcription. Your checked words go to
            the configured AI assessor.
          </p>
        </div>
      )}
      {stage.kind === "preparing" && (
        <div className="game-screen game-loading" role="status">
          <img src="/art/child-thinking.png" alt="Pip thinking" />
          <h1>Preparing scenarios</h1>
          <span className="thinking-dots">
            <i />
            <i />
            <i />
          </span>
          <p>
            Pip is reading your whole explanation and choosing a question for
            it.
          </p>
        </div>
      )}
      {stage.kind === "scene" && (
        <Scene
          attempt={stage.attempt}
          answer={stage.answer}
          diagnosticAnswers={stage.diagnosticAnswers}
          onSubmit={submitDiagnostic}
          onFinish={finish}
          onRetry={() => start(stage.attempt.sample)}
          processing={processing}
        />
      )}
      {stage.kind === "finished" && (
        <section className="card finished" aria-labelledby="finished-title">
          <img
            className="pixel-avatar pixel-avatar-lg"
            src={`/art/child-${passed(stage.attempt) ? "aha" : "listening"}.png`}
            alt=""
          />
          {passed(stage.attempt) && (
            <span className="reward" aria-hidden="true">
              <Sparkle />
            </span>
          )}
          <h1 id="finished-title">
            {passed(stage.attempt) ? "Explanation complete" : "Saved for next time"}
          </h1>
          <p>
            {passed(stage.attempt)
              ? stage.attempt.sample
                ? "The sample explanation met the criteria. Sample walkthroughs show how it works and don't count toward your own completion."
                : "Your main explanation earned completion. Pip's example questions stay in your learning history."
              : "Your explanation and answers are saved. Review the idea and teach Pip again whenever you're ready."}
          </p>
          {completed && !passed(stage.attempt) && (
            <p className="gold-star">Your earlier completion is still yours.</p>
          )}
          <div className="choices">
            <button
              className="choice choice-primary"
              onClick={() => setStage({ kind: "assignment" })}
            >
              Back to the assignment
            </button>
            {me.role === "teacher" && (
              <button
                className="choice"
                onClick={() =>
                  go({
                    kind: "evidence",
                    assignmentId,
                    attemptId: stage.attempt.id,
                  })
                }
              >
                Open in the teacher's desk
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
