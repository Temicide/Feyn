import { useCallback, useEffect, useRef, useState } from "react";
import {
  reviewedTranscript,
  type Answer,
  type Attempt,
  type Lesson,
} from "../shared/contracts.js";
import { Recorder } from "./Recorder.js";

type Line = {
  speaker: "You" | "Pip";
  text: string;
  expression: "listening" | "puzzled" | "aha" | "thinking";
};
type SceneStage =
  | { kind: "intro"; index: number }
  | { kind: "question"; number: 1 | 2 }
  | { kind: "response"; number: 1 | 2; index: number }
  | { kind: "ending"; index: number }
  | { kind: "done" };
function excerpt(text: string): string {
  if (text.length <= 200) return text;
  const part = text.slice(0, 200);
  return part.slice(0, part.lastIndexOf(" "));
}
function mainLines(attempt: Attempt, answer: Answer): Line[] {
  const result = attempt.mainAssessment;
  const excerptText = excerpt(
    result?.criteria.find((c) => c.quote)?.quote || reviewedTranscript(answer),
  );
  const gap = result?.criteria.find((c) => c.state !== "demonstrated");
  return [
    { speaker: "You", text: excerptText, expression: "listening" },
    {
      speaker: "Pip",
      text:
        result?.outcome === "pass"
          ? attempt.profile === "playful"
            ? "Okay! My little toy cart has a speed for one tiny moment. Let me try a tricky example."
            : "I think I follow your explanation. Can I check it with a different example?"
          : result?.outcome === "not-enough-evidence"
            ? "I couldn’t quite catch enough of that. Can we try a little example together?"
            : `I’m still wondering about ${gap?.id === "distance-speed" ? "how distance and speed are different" : gap?.id === "average-instantaneous" ? "one whole second compared with one tiny moment" : "what the number at three seconds actually means"}. Can we look at an example?`,
      expression: result?.outcome === "pass" ? "aha" : "puzzled",
    },
  ];
}
function endingLines(attempt: Attempt): Line[] {
  const pass = attempt.mainAssessment?.outcome === "pass",
    unresolved = attempt.diagnostics.some(
      (d) => d.assessment.outcome !== "correct",
    );
  if (pass)
    return [
      {
        speaker: "Pip",
        text: unresolved
          ? "Your explanation helped! I’m still puzzled by that last example. Maybe we can try it again sometime."
          : "Your explanation helped me see the difference between a whole interval and one moment!",
        expression: "aha",
      },
      {
        speaker: "Pip",
        text:
          attempt.endingVariant === 0
            ? "There’s the bell! I’m taking this idea with me. Thanks for teaching me."
            : "I’m going to draw our cart on the board. One little moment can tell us so much!",
        expression: "aha",
      },
    ];
  return [
    {
      speaker: "Pip",
      text:
        attempt.endingVariant === 0
          ? "I found a toy cart for next time. I’d like to understand that confusing part a little better."
          : "I’m opening my notebook at the part I’m still wondering about. We can take another look together.",
      expression: "puzzled",
    },
    {
      speaker: "Pip",
      text: "Thanks for thinking it through with me. When you’re ready, try teaching it again in your own words.",
      expression: "listening",
    },
  ];
}
export function Scene({
  attempt,
  answer,
  diagnosticAnswers,
  lesson,
  onSubmit,
  onFinish,
  onRetry,
  processing,
}: {
  attempt: Attempt;
  answer: Answer;
  diagnosticAnswers: Answer[];
  lesson: Lesson;
  onSubmit: (answer: Answer) => Promise<void>;
  onFinish: () => Promise<void>;
  onRetry: () => Promise<void>;
  processing: boolean;
}) {
  const [roomArt, setRoomArt] = useState<string | null>(null);
  const [stage, setStage] = useState<SceneStage>({ kind: "intro", index: 0 }),
    [visible, setVisible] = useState(0),
    [muted, setMuted] = useState(true),
    [recordBusy, setRecordBusy] = useState(false),
    [finishError, setFinishError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/art/classroom.svg")
      .then((response) => {
        if (!response.ok) throw new Error("Classroom art unavailable.");
        return response.text();
      })
      .then((source) => {
        if (active) setRoomArt(source);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const context = useRef<AudioContext | null>(null),
    prevDiagnosticCount = useRef(attempt.diagnostics.length);
  const busy = useCallback((value: boolean) => setRecordBusy(value), []);
  useEffect(() => {
    if (attempt.diagnostics.length > prevDiagnosticCount.current) {
      const number = attempt.diagnostics.length === 1 ? 1 : 2;
      setStage({ kind: "response", number, index: 0 });
      prevDiagnosticCount.current = attempt.diagnostics.length;
    }
  }, [attempt.diagnostics.length]);
  const intro = mainLines(attempt, answer),
    ending = endingLines(attempt),
    diagnostic =
      stage.kind === "response"
        ? attempt.diagnostics.find(
            (d) => d.questionId === `followup-${stage.number}`,
          )
        : undefined;
  let line: Line;
  switch (stage.kind) {
    case "intro":
      line = intro[stage.index] ??
        intro[0] ?? {
          speaker: "Pip",
          text: "Let’s begin.",
          expression: "listening",
        };
      break;
    case "question":
      line = {
        speaker: "Pip",
        text: lesson.followups[stage.number - 1]?.question ?? "",
        expression: "thinking",
      };
      break;
    case "response":
      line =
        stage.index === 0
          ? {
              speaker: "You",
              text: excerpt(
                reviewedTranscript(
                  diagnosticAnswers.find(
                    (a) => a.id === diagnostic?.answerId,
                  ) ?? answer,
                ),
              ),
              expression: "listening",
            }
          : {
              speaker: "Pip",
              text:
                diagnostic?.assessment.outcome === "correct"
                  ? "Oh! That helps me connect it to the example."
                  : diagnostic?.assessment.outcome === "incorrect"
                    ? "Hmm, I’m still not sure how that works for this example. We can come back to it."
                    : "I couldn’t hear enough to be sure. We can come back to this example.",
              expression:
                diagnostic?.assessment.outcome === "correct"
                  ? "aha"
                  : "puzzled",
            };
      break;
    case "ending":
      line = ending[stage.index] ??
        ending[0] ?? { speaker: "Pip", text: "Thank you.", expression: "aha" };
      break;
    case "done":
      line = {
        speaker: "Pip",
        text: "See you next lesson!",
        expression: "aha",
      };
      break;
  }
  const text = processing || recordBusy ? "•••" : line.text;
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(text.length);
      return;
    }
    setVisible(0);
    const interval = setInterval(
      () => setVisible((value) => Math.min(value + 1, text.length)),
      23,
    );
    return () => clearInterval(interval);
  }, [text]);
  useEffect(() => {
    if (
      muted ||
      recordBusy ||
      processing ||
      visible === 0 ||
      visible >= text.length ||
      visible % 3 !== 0
    )
      return;
    try {
      context.current ??= new AudioContext();
      const oscillator = context.current.createOscillator(),
        gain = context.current.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = line.speaker === "Pip" ? 360 : 250;
      gain.gain.setValueAtTime(0.012, context.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        context.current.currentTime + 0.035,
      );
      oscillator.connect(gain);
      gain.connect(context.current.destination);
      oscillator.start();
      oscillator.stop(context.current.currentTime + 0.04);
    } catch {}
  }, [visible, muted, recordBusy, processing, text.length, line.speaker]);
  useEffect(
    () => () => {
      void context.current?.close();
    },
    [],
  );
  function next() {
    if (processing || recordBusy) return;
    if (visible < text.length) {
      setVisible(text.length);
      return;
    }
    switch (stage.kind) {
      case "intro":
        setStage(
          stage.index === 0
            ? { kind: "intro", index: 1 }
            : { kind: "question", number: 1 },
        );
        break;
      case "ending":
        setStage(
          stage.index === 0 ? { kind: "ending", index: 1 } : { kind: "done" },
        );
        break;
      case "response":
        if (stage.index === 0) setStage({ ...stage, index: 1 });
        break;
      case "question":
      case "done":
        break;
    }
  }
  async function finish(retry: boolean) {
    try {
      setFinishError("");
      await onFinish();
      if (retry) await onRetry();
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : "Could not finish.");
    }
  }
  return (
    <section className="scene-wrap">
      <div className="scene-toolbar">
        <div>
          <span className="status-dot" /> THE LITTLE CLASSROOM{" "}
          <span className="scene-profile">Pip is {attempt.profile}</span>
        </div>
        <button
          className="sound-button"
          aria-pressed={!muted}
          onClick={() => {
            setMuted(!muted);
            void context.current?.resume();
          }}
        >
          {muted ? "♪ Sound off" : "♪ Sound on"}
        </button>
      </div>
      {attempt.sample && (
        <div className="scene-sample">
          SAMPLE WALKTHROUGH ·{" "}
          {answer.provenance === "scripted-sample"
            ? "Prepared student words"
            : "Transcribed student recording"}{" "}
          ·{" "}
          {attempt.mainAssessment?.provider}
        </div>
      )}
      <div
        className={`classroom expression-${line.expression} ${stage.kind === "ending" || stage.kind === "done" ? `ending-room event-${attempt.mainAssessment?.outcome === "pass" ? "pass" : "retry"}-${attempt.endingVariant}` : ""}`}
      >
        <div
          className="room-art"
          style={
            roomArt
              ? undefined
              : {
                  backgroundImage: "url(/art/classroom.svg)",
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                }
          }
          role="img"
          aria-label="A warm pixel art classroom with Pip at a desk and your character at the board"
          dangerouslySetInnerHTML={roomArt ? { __html: roomArt } : undefined}
        />
        <div className="chalk-writing">
          <span>s(t) = t²</span>
          <span>one moment, at t = 3</span>
        </div>
        {(stage.kind === "ending" || stage.kind === "done") && (
          <>
            <div className="ending-spark">
              {attempt.mainAssessment?.outcome === "pass" ? "✦" : "✧"}
            </div>
            {attempt.mainAssessment?.outcome !== "pass" && (
              <div
                className={
                  attempt.endingVariant === 0
                    ? "ending-toy-cart"
                    : "ending-notebook"
                }
                aria-label={
                  attempt.endingVariant === 0
                    ? "Pip brings out a toy cart"
                    : "Pip opens a notebook"
                }
              >
                {attempt.endingVariant === 0 ? "▰" : "▤"}
              </div>
            )}
            {attempt.mainAssessment?.outcome === "pass" &&
              attempt.endingVariant === 1 && (
                <div className="ending-board-note">a moment! ✦</div>
              )}
          </>
        )}
        <div
          className="dialogue-box"
          role="button"
          tabIndex={0}
          onClick={next}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              next();
            }
          }}
          aria-label="Dialogue. Click to reveal, then click to advance."
        >
          <img
            className="portrait"
            src={
              processing || recordBusy || line.speaker === "You"
                ? "/art/student-speaking.svg"
                : `/art/child-${line.expression}.svg`
            }
            alt=""
          />
          <div className="dialogue-content">
            <div className="dialogue-name">
              {processing || recordBusy ? "You" : line.speaker}
            </div>
            <p aria-live="polite">
              {text.slice(0, visible)}
              <span className="typing-cursor">▌</span>
            </p>
            {stage.kind !== "question" &&
              (stage.kind !== "response" || stage.index === 0) &&
              stage.kind !== "done" && (
                <span className="advance-hint">
                  {visible < text.length
                    ? "click to reveal"
                    : "click to continue ▾"}
                </span>
              )}
          </div>
        </div>
      </div>
      {stage.kind === "question" && (
        <div className="scene-answer">
          <div className="section-label">
            {stage.number === 1
              ? "LET’S TRY AN EXAMPLE"
              : "ONE MORE, IF YOU LIKE"}{" "}
            <span>Question {stage.number} of 2</span>
          </div>
          <Recorder
            key={stage.number}
            attempt={attempt}
            kind={stage.number === 1 ? "followup-1" : "followup-2"}
            onSubmit={onSubmit}
            onBusy={busy}
          />
        </div>
      )}
      {stage.kind === "response" && stage.index === 1 && (
        <div className="scene-choices">
          {stage.number === 1 && (
            <button
              className="button"
              onClick={() => setStage({ kind: "question", number: 2 })}
            >
              Try one more example
            </button>
          )}
          <button
            className="button primary"
            onClick={() => setStage({ kind: "ending", index: 0 })}
          >
            See what happens →
          </button>
          <p className="fine-print">
            {attempt.mainAssessment?.outcome === "pass"
              ? "Your explanation earned completion. Practice questions do not change that."
              : "These questions help us see what to explore next."}
          </p>
        </div>
      )}
      {stage.kind === "done" && (
        <div className="scene-choices">
          <div className="ending-status">
            {attempt.mainAssessment?.outcome === "pass"
              ? "✦ Explanation complete"
              : "A little more to explore"}
          </div>
          <button className="button primary" onClick={() => void finish(false)}>
            Finish lesson
          </button>
          <button className="button" onClick={() => void finish(true)}>
            Try explaining again
          </button>
          {finishError && <p className="error">{finishError}</p>}
        </div>
      )}
      {processing && (
        <p className="scene-processing" role="status">
          Pip is thinking<span className="thinking-dots">•••</span>
        </p>
      )}
    </section>
  );
}
