import { useCallback, useEffect, useRef, useState } from "react";
import {
  reviewedTranscript,
  type Answer,
  type Attempt,
} from "../shared/contracts.js";
import { Recorder } from "./Recorder.js";
import {
  useSound,
  useTypewriter,
  voiceFor,
  type Expression,
  type Speaker,
} from "./voice.js";

type Line = { speaker: Speaker; text: string; expression: Expression };
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
  const gap = result?.criteria.find((c) => c.state !== "demonstrated"),
    gapTitle = attempt.rubric.concepts.find((c) => c.id === gap?.id)?.title;
  return [
    { speaker: "You", text: excerptText, expression: "listening" },
    {
      speaker: "Pip",
      text:
        result?.outcome === "pass"
          ? attempt.rubric.profile === "playful"
            ? "Ooh, I think I can picture it now! Let me try a tricky example."
            : "I think I follow your explanation. Can I check it with a different example?"
          : result?.outcome === "not-enough-evidence"
            ? "I couldn't quite catch enough of that. Can we try a little example together?"
            : gapTitle
              ? `I'm still wondering about this part: ${gapTitle}. Can we look at an example?`
              : "I'm still wondering about part of it. Can we look at an example?",
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
          ? "Your explanation helped! I'm still puzzled by that last example. Maybe we can try it again sometime."
          : "Your explanation helped me see how it all fits together!",
        expression: "aha",
      },
      {
        speaker: "Pip",
        text:
          attempt.endingVariant === 0
            ? "There's the bell! I'm taking this idea with me. Thanks for teaching me."
            : "I'm going to write what you taught me on the board, so I don't forget it!",
        expression: "aha",
      },
    ];
  return [
    {
      speaker: "Pip",
      text:
        attempt.endingVariant === 0
          ? "I found something to play with while I think. I'd like to understand that confusing part a little better."
          : "I'm opening my notebook at the part I'm still wondering about. We can take another look together.",
      expression: "puzzled",
    },
    {
      speaker: "Pip",
      text: "Thanks for thinking it through with me. When you're ready, try teaching it again in your own words.",
      expression: "listening",
    },
  ];
}
export function Scene({
  attempt,
  answer,
  diagnosticAnswers,
  onSubmit,
  onFinish,
  onRetry,
  processing,
}: {
  attempt: Attempt;
  answer: Answer;
  diagnosticAnswers: Answer[];
  onSubmit: (answer: Answer) => Promise<void>;
  onFinish: () => Promise<void>;
  onRetry: () => Promise<void>;
  processing: boolean;
}) {
  const [roomArt, setRoomArt] = useState<string | null>(null);
  const [stage, setStage] = useState<SceneStage>({ kind: "intro", index: 0 }),
    [sound, setSound] = useSound(),
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
  const prevDiagnosticCount = useRef(attempt.diagnostics.length);
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
          text: "Let's begin.",
          expression: "listening",
        };
      break;
    case "question":
      line = {
        speaker: "Pip",
        text: attempt.rubric.followups[stage.number - 1]?.question ?? "",
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
                    ? "Hmm, I'm still not sure how that works for this example. We can come back to it."
                    : "I couldn't hear enough to be sure. We can come back to this example.",
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
  const { shown, skip } = useTypewriter(
    text,
    voiceFor(line.speaker, line.expression, attempt.rubric.profile),
  );
  const portraitBase =
    processing || recordBusy || line.speaker === "You"
      ? "student-speaking"
      : `child-${line.expression}`;
  const talking =
    !processing && !recordBusy && shown > 0 && shown < text.length;
  const portraitSrc = talking
    ? `/art/${portraitBase}-talk${[0, 1, 2, 1][Math.floor(shown / 4) % 4]}.png`
    : `/art/${portraitBase}.png`;
  function next() {
    if (processing || recordBusy) return;
    if (shown < text.length) {
      skip();
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
        <p>
          Pip is feeling <b>{attempt.rubric.profile}</b> today
        </p>
        <button
          className="sound-button"
          aria-pressed={sound}
          onClick={() => setSound(!sound)}
        >
          {sound ? "Sound on" : "Sound off"}
        </button>
      </div>
      {attempt.sample && (
        <ul className="scene-sample" aria-label="Sample walkthrough">
          <li className="sample-tag">Sample walkthrough</li>
          <li>
            {answer.provenance === "scripted-sample"
              ? "Prepared student words"
              : "Transcribed student recording"}
          </li>
          {attempt.mainAssessment && (
            <li>Assessed by {attempt.mainAssessment.provider}</li>
          )}
        </ul>
      )}
      <div className="game-screen">
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
            <span>{attempt.rubric.title}</span>
            {attempt.rubric.concepts[0] && (
              <span>{attempt.rubric.concepts[0].title}</span>
            )}
          </div>
          {(stage.kind === "ending" || stage.kind === "done") && (
            <>
              <PixelSpark className="ending-spark" />
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
                  {attempt.endingVariant === 0 ? (
                    <PixelCart />
                  ) : (
                    <PixelNotebook />
                  )}
                </div>
              )}
              {attempt.mainAssessment?.outcome === "pass" &&
                attempt.endingVariant === 1 && (
                  <div className="ending-board-note">got it!</div>
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
              className="dialogue-portrait"
              src={portraitSrc}
              alt=""
            />
            <div className="dialogue-body">
              <p className="dialogue-name">
                {processing || recordBusy ? "You" : line.speaker}
              </p>
              <p
                className={`dialogue-line ${text === "•••" ? "is-thinking" : ""}`}
                aria-live="polite"
              >
                {text === "•••" ? (
                  <span className="thinking-dots">
                    <i />
                    <i />
                    <i />
                    <span className="visually-hidden">Thinking</span>
                  </span>
                ) : (
                  text.slice(0, shown)
                )}
              </p>
              {stage.kind !== "question" &&
                (stage.kind !== "response" || stage.index === 0) &&
                stage.kind !== "done" && (
                  <span className="advance-hint" aria-hidden="true">
                    {shown < text.length ? "Show all" : "Next"}
                  </span>
                )}
            </div>
          </div>
        </div>
        {stage.kind === "question" && (
          <div className="scene-answer">
            <p className="dialogue-name">
              {stage.number === 1
                ? "Your answer to Pip"
                : "One more, if you like"}
              <span>
                Question {stage.number} of {attempt.rubric.followups.length}
              </span>
            </p>
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
            {stage.number === 1 && attempt.rubric.followups.length > 1 && (
              <button
                className="choice"
                onClick={() => setStage({ kind: "question", number: 2 })}
              >
                Try one more example
              </button>
            )}
            <button
              className="choice choice-primary"
              onClick={() => setStage({ kind: "ending", index: 0 })}
            >
              See what Pip does
            </button>
            <p className="choices-note">
              {attempt.mainAssessment?.outcome === "pass"
                ? "Your explanation earned completion. Practice questions do not change that."
                : "These questions help us see what to explore next."}
            </p>
          </div>
        )}
        {stage.kind === "done" && (
          <div className="scene-choices">
            <p className="ending-status">
              {attempt.mainAssessment?.outcome === "pass"
                ? "Explanation complete"
                : "A little more to explore"}
            </p>
            <button
              className="choice choice-primary"
              onClick={() => void finish(false)}
            >
              Finish
            </button>
            <button className="choice" onClick={() => void finish(true)}>
              Try explaining again
            </button>
            {finishError && <p className="error">{finishError}</p>}
          </div>
        )}
      </div>
      {processing && (
        <p className="visually-hidden" role="status">
          Pip is thinking
        </p>
      )}
    </section>
  );
}

function pixels(rows: string[], colors: Record<string, string>) {
  return rows.flatMap((row, y) =>
    [...row].flatMap((cell, x) =>
      colors[cell]
        ? [
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="1"
              height="1"
              fill={colors[cell]}
            />,
          ]
        : [],
    ),
  );
}
export function PixelSpark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {pixels(
        [
          "...o...",
          "...y...",
          "..yyy..",
          "oyyWyyo",
          "..yyy..",
          "...y...",
          "...o...",
        ],
        { o: "#ae784d", y: "#f5df9b", W: "#ffffff" },
      )}
    </svg>
  );
}
function PixelCart() {
  return (
    <svg viewBox="0 0 16 11" shapeRendering="crispEdges" aria-hidden="true">
      {pixels(
        [
          "..kkkkkkkkkk....",
          ".kttttttttttk...",
          ".ktTTTTTTTTtk...",
          "kttttttttttttk..",
          "kttttttttttttkkk",
          "kkkkkkkkkkkkkk.k",
          "..kkk.....kkk...",
          ".kwwwk...kwwwk..",
          ".kwkwk...kwkwk..",
          ".kwwwk...kwwwk..",
          "..kkk.....kkk...",
        ],
        { k: "#3b302f", t: "#438e94", T: "#7fc0c4", w: "#e7edc8" },
      )}
    </svg>
  );
}
function PixelNotebook() {
  return (
    <svg viewBox="0 0 15 12" shapeRendering="crispEdges" aria-hidden="true">
      {pixels(
        [
          "kkkkkkk.kkkkkkk",
          "kpppppkkkpppppk",
          "kplllpkrkplllpk",
          "kpppppkrkpppppk",
          "kplllpkrkpllppk",
          "kpppppkrkpppppk",
          "kpllppkrkplllpk",
          "kpppppkrkpppppk",
          "kplllpkrkppqppk",
          "kpppppkrkpppppk",
          "kkkkkkkrkkkkkkk",
          ".......k.......",
        ],
        {
          k: "#3b302f",
          p: "#e7edc8",
          l: "#8ba99a",
          r: "#d7a343",
          q: "#d86a7c",
        },
      )}
    </svg>
  );
}
