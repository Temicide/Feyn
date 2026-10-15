import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  answerSchema,
  maxAudioBytes,
  reviewedTranscript,
  words,
  type Answer,
  type Attempt,
} from "../shared/contracts.js";
import { api, json } from "./api.js";
import { MicrophoneAccess } from "./microphone.js";

type RecordingState =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "processing" }
  | { kind: "review"; answer: Answer };
export function Recorder({
  attempt,
  kind,
  onSubmit,
  onBusy,
  initialAnswer,
}: {
  attempt: Attempt;
  kind: Answer["kind"];
  onSubmit: (answer: Answer) => Promise<void>;
  onBusy?: (busy: boolean) => void;
  initialAnswer?: Answer | null;
}) {
  const [state, setState] = useState<RecordingState>(
      initialAnswer
        ? { kind: "review", answer: initialAnswer }
        : { kind: "idle" },
    ),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<number | null>(null),
    [replacement, setReplacement] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    microphone = useRef(new MicrophoneAccess<MediaStream>()),
    fileInput = useRef<HTMLInputElement>(null),
    lifetime = useRef(true);
  useEffect(() => {
    lifetime.current = true;
    return () => {
      lifetime.current = false;
      try {
        if (recorder.current && recorder.current.state !== "inactive")
          recorder.current.stop();
      } finally {
        microphone.current.release();
      }
    };
  }, []);
  useEffect(() => {
    onBusy?.(state.kind === "recording" || state.kind === "processing");
  }, [state.kind, onBusy]);
  async function upload(
    blob: Blob,
    provenance: "microphone" | "uploaded-recording",
    name: string,
  ) {
    if (blob.size > maxAudioBytes) {
      setState({ kind: "idle" });
      setError(
        "Recordings are limited to 4 MB. Record a shorter explanation or upload a smaller file.",
      );
      return;
    }
    setState({ kind: "processing" });
    setError("");
    const data = new FormData();
    data.set("audio", blob, name);
    data.set("kind", kind);
    data.set("provenance", provenance);
    try {
      const result = await api(
        `/attempts/${attempt.id}/audio`,
        z.object({ answer: answerSchema, error: z.string().nullable() }),
        { method: "POST", body: data },
      );
      if (lifetime.current) {
        setState({ kind: "review", answer: result.answer });
        setError(result.error ?? "");
      }
    } catch (e) {
      if (lifetime.current) {
        setState({ kind: "idle" });
        setError(e instanceof Error ? e.message : "Could not save recording.");
      }
    }
  }
  async function start() {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Microphone is unavailable here. Open this app on localhost or upload a recording.",
        );
      const media = await microphone.current.acquire(() =>
        navigator.mediaDevices.getUserMedia({ audio: true }),
      );
      if (!media) return;
      if (!lifetime.current) {
        microphone.current.release();
        return;
      }
      const device = new MediaRecorder(media, { audioBitsPerSecond: 32000 });
      recorder.current = device;
      const chunks: BlobPart[] = [];
      device.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      device.onstop = () => {
        microphone.current.release();
        if (lifetime.current)
          void upload(
            new Blob(chunks, { type: device.mimeType }),
            "microphone",
            "explanation.webm",
          );
      };
      device.start();
      setState({ kind: "recording" });
    } catch (e) {
      microphone.current.release();
      if (lifetime.current)
        setError(
          e instanceof Error
            ? e.message
            : "Microphone permission is needed. You can also upload a recording.",
        );
    }
  }
  async function sample() {
    setState({ kind: "processing" });
    setError("");
    try {
      const answer = await api(
        `/attempts/${attempt.id}/sample`,
        answerSchema,
        json("POST", { kind }),
      );
      setState({ kind: "review", answer });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sample failed.");
      setState({ kind: "idle" });
    }
  }
  async function correct(answer: Answer) {
    if (selected === null) return;
    try {
      const updated = await api(
        `/answers/${answer.id}`,
        answerSchema,
        json("PATCH", { index: selected, replacement }),
      );
      setState({ kind: "review", answer: updated });
      setSelected(null);
      setReplacement("");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Correction failed.");
    }
  }
  async function retryTranscription(answer: Answer) {
    setState({ kind: "processing" });
    try {
      const updated = await api(
        `/answers/${answer.id}/transcribe`,
        answerSchema,
        json("POST", {}),
      );
      setState({ kind: "review", answer: updated });
      setError("");
    } catch (e) {
      setState({ kind: "review", answer });
      setError(e instanceof Error ? e.message : "Transcription failed.");
    }
  }
  async function submit(answer: Answer) {
    setError("");
    try {
      await onSubmit(answer);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Assessment failed. Please retry.",
      );
    }
  }
  const left = state.kind === "review" ? 3 - state.answer.corrections.length : 3;
  return (
    <div className={`recorder recorder-${state.kind}`}>
      {state.kind === "idle" && (
        <>
          <div className="record-row">
            <button
              className="record-button"
              onClick={() => void start()}
              aria-label={
                kind === "main" ? "Record explanation" : "Record answer"
              }
            >
              <span className="record-dot" />
            </button>
            <div>
              <p className="record-invitation">
                {kind === "main"
                  ? "Press record and explain it the way you'd tell a friend."
                  : "Take your time. There's no timer."}
              </p>
              <div className="choices choices-inline">
                <button
                  className="choice choice-primary"
                  onClick={() => void start()}
                >
                  {kind === "main" ? "Record explanation" : "Record answer"}
                </button>
                <button
                  className="choice"
                  onClick={() => fileInput.current?.click()}
                >
                  Upload a recording
                </button>
                {attempt.sample && (
                  <button className="choice" onClick={() => void sample()}>
                    Use the prepared sample transcript
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="recorder-note">
            English only. Recordings up to 4 MB. You check the words before
            anything is sent.
          </p>
        </>
      )}
      {state.kind === "recording" && (
        <div className="record-row">
          <button
            className="record-button is-recording"
            onClick={() => recorder.current?.stop()}
            aria-label="Stop recording"
          >
            <span className="record-stop" />
          </button>
          <div>
            <div className="recording-wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <p className="record-invitation" role="status">
              Recording. Press stop when you're done.
            </p>
            <div className="choices choices-inline">
              <button
                className="choice choice-primary"
                onClick={() => recorder.current?.stop()}
              >
                Stop recording
              </button>
            </div>
          </div>
        </div>
      )}
      {state.kind === "processing" && (
        <div className="processing" role="status">
          <span className="thinking-dots">
            <i />
            <i />
            <i />
          </span>
          <p>Turning your voice into words. Your recording is already saved.</p>
        </div>
      )}
      {state.kind === "review" && (
        <div className="transcript-review">
          <div className="review-head">
            <h3>Check your words</h3>
            <div
              className="chalk-count"
              aria-label={`${left} word ${left === 1 ? "fix" : "fixes"} left`}
            >
              {[0, 1, 2].map((i) => (
                <i key={i} className={i < left ? "" : "used"} />
              ))}
              <span>
                {left} {left === 1 ? "fix" : "fixes"} left
              </span>
            </div>
          </div>
          {state.answer.audioId && (
            <audio controls src={`/api/answers/${state.answer.id}/audio`} />
          )}
          {state.answer.provenance === "scripted-sample" && (
            <p className="sample-tag">
              Prepared sample words. No recording or speech recognition.
            </p>
          )}
          {state.answer.originalTranscript ? (
            <>
              <p className="word-transcript">
                {words(reviewedTranscript(state.answer)).map((word, index) => (
                  <button
                    key={index}
                    disabled={state.answer.corrections.length >= 3}
                    className={selected === index ? "selected" : ""}
                    aria-pressed={selected === index}
                    onClick={() => {
                      setSelected(index);
                      setReplacement(word);
                    }}
                  >
                    {word}
                  </button>
                ))}
              </p>
              <p className="recorder-note">
                Click a misheard word to fix it. For a bigger change, record
                again.
              </p>
            </>
          ) : (
            <div className="choices">
              <button
                className="choice"
                onClick={() => void retryTranscription(state.answer)}
              >
                Retry transcription
              </button>
            </div>
          )}
          {selected !== null && (
            <form
              className="word-editor"
              onSubmit={(event) => {
                event.preventDefault();
                void correct(state.answer);
              }}
            >
              <label>
                Replace “{words(reviewedTranscript(state.answer))[selected]}” with
                <input
                  value={replacement}
                  onChange={(event) => setReplacement(event.target.value)}
                  maxLength={80}
                  required
                  autoFocus
                />
              </label>
              <button className="choice choice-primary" type="submit">
                Replace word
              </button>
              <button
                className="choice"
                type="button"
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
            </form>
          )}
          {state.answer.corrections.length > 0 && (
            <ol className="correction-list" aria-label="Your fixes">
              {state.answer.corrections.map((c, index) => (
                <li key={index}>
                  <del>{c.before}</del> <ins>{c.after}</ins>
                </li>
              ))}
            </ol>
          )}
          <div className="choices choices-inline">
            <button
              className="choice choice-primary"
              disabled={!state.answer.originalTranscript}
              onClick={() => void submit(state.answer)}
            >
              {kind === "main" ? "Send to Pip" : "Send answer"}
            </button>
            <button
              className="choice"
              onClick={() => {
                setSelected(null);
                setState({ kind: "idle" });
                setError("");
              }}
            >
              Record again
            </button>
          </div>
        </div>
      )}
      <input
        className="visually-hidden"
        ref={fileInput}
        type="file"
        accept="audio/*,.webm,.wav,.m4a,.mp3"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file, "uploaded-recording", file.name);
          event.target.value = "";
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
