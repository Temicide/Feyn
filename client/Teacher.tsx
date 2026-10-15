import { useEffect, useState } from "react";
import {
  attemptSchema,
  profileSchema,
  reviewedTranscript,
  teacherSchema,
  type Attempt,
  type Criterion,
  type Lesson,
  type Profile,
  type TeacherData,
} from "../shared/contracts.ts";
import { api, json } from "./api.ts";

const labels = {
  pass: "Meets the main criteria",
  "needs-work": "Main explanation needs work",
  "not-enough-evidence": "Not enough evidence",
};
export function Teacher({
  lesson,
  profile,
  onProfile,
  selectedAttemptId,
}: {
  lesson: Lesson;
  profile: Profile;
  selectedAttemptId: string | null;
  onProfile: (profile: Profile) => Promise<void>;
}) {
  const [data, setData] = useState<TeacherData | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(selectedAttemptId),
    [tab, setTab] = useState<"evidence" | "recap">("evidence");
  async function refresh() {
    try {
      setData(await api("/teacher", teacherSchema));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load evidence.");
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const attempts =
      data?.attempts.toSorted((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ) ?? [],
    active =
      attempts.find((a) => a.id === selected) ??
      attempts.find((a) => a.learnerId === "you") ??
      attempts[0];
  const name = (id: string) =>
    data?.learners.find((l) => l.id === id)?.name ?? id;
  return (
    <div className="teacher-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE TEACHER’S DESK</div>
          <h1>
            See the thinking.
            <br />
            <em>Choose what comes next.</em>
          </h1>
          <p>
            Listen to the explanation, follow the evidence, and add your
            judgment.
          </p>
        </div>
        <div className="teacher-profile">
          <label>
            Pip’s personality
            <select
              value={profile}
              onChange={(event) => {
                const next = profileSchema.parse(event.target.value);
                void onProfile(next);
              }}
            >
              <option value="curious">Curious · asks why and how</option>
              <option value="playful">Playful · imagines examples</option>
            </select>
          </label>
          <p className="fine-print">
            Changes the conversation. The criteria stay the same.
          </p>
        </div>
      </div>
      <div className="teacher-tabs">
        <button
          className={tab === "evidence" ? "active" : ""}
          onClick={() => setTab("evidence")}
        >
          Student evidence
        </button>
        <button
          className={tab === "recap" ? "active" : ""}
          onClick={() => setTab("recap")}
        >
          Class recap
        </button>
        <button className="text-button refresh" onClick={() => void refresh()}>
          ↻ Refresh
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!data && <p>Opening the teacher’s desk…</p>}
      {data && tab === "recap" && (
        <>
          <div className="sample-notice">
            <strong>Illustrative class, real evidence kept separate.</strong>{" "}
            Maya, Noah, Eli, and June are authored sample classmates. “You ·
            walkthrough” contains sample attempts. “You” contains this
            browser’s saved work. These records do not demonstrate classroom
            learning benefit.
          </div>
          <div className="recap-table">
            <div className="recap-row recap-header">
              <span>Essential concept</span>
              <span>Current gap</span>
              <span>Resolved</span>
              <span>Unassessed</span>
            </div>
            {data.recap.map((row) => (
              <div className="recap-row" key={row.id}>
                <div>
                  <h3>{row.title}</h3>
                  <p>
                    {row.demonstrated.length} of {data.learners.length}{" "}
                    currently demonstrate it
                  </p>
                </div>
                <div>
                  <b>{row.gaps.length}</b>
                  <p>{row.gaps.map(name).join(", ") || "No current gaps"}</p>
                </div>
                <div>
                  <b>{row.resolved.length}</b>
                  <p>{row.resolved.map(name).join(", ") || "None recorded"}</p>
                </div>
                <div>
                  <b>{row.unassessed.length}</b>
                  <p>
                    {row.unassessed.map(name).join(", ") || "Everyone assessed"}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="fine-print">
            One learner per concept, using the latest usable main, diagnostic,
            or teacher-reviewed evidence. Resolved learners also count as
            demonstrated. Unclear newer evidence does not overwrite usable
            earlier evidence.
          </p>
          <section className="support-queue">
            <div className="section-label">INDIVIDUAL SUPPORT</div>
            <h2>Let the evidence guide your next step.</h2>
            <p className="fine-print">
              Automatic help flags are not active in this prototype. Repeated
              main explanations or one missed optional question do not establish
              that the same misconception persisted after a fresh application
              question. Use the saved evidence and class recap to decide who
              needs support.
            </p>
          </section>
        </>
      )}
      {data && tab === "evidence" && (
        <div className="evidence-layout">
          <aside className="attempt-list">
            <div className="section-label">
              SAVED EXPLANATIONS <span>{attempts.length}</span>
            </div>
            {attempts.length === 0 && <p>No explanations yet.</p>}
            {attempts.map((attempt) => (
              <button
                key={attempt.id}
                className={`attempt-item ${active?.id === attempt.id ? "active" : ""}`}
                onClick={() => setSelected(attempt.id)}
              >
                <span className="attempt-name">
                  {name(attempt.learnerId)}{" "}
                  {attempt.sample && <small>SAMPLE</small>}
                </span>
                <span>
                  {attempt.mainAssessment
                    ? labels[
                        attempt.reviews.at(-1)?.outcome ??
                          attempt.mainAssessment.outcome
                      ]
                    : "Recording in progress"}
                </span>
                <time>
                  {new Date(attempt.createdAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </button>
            ))}
          </aside>
          {active && (
            <Evidence
              key={active.id}
              attempt={active}
              data={data}
              lesson={lesson}
              onSaved={refresh}
            />
          )}
        </div>
      )}
      <div className="integration-note">
        <span className="section-label">CONNECTED TO YOUR LOCAL APP</span>
        <p>
          Read-only MCP tools are available at{" "}
          <code>{location.origin}/mcp</code>. U-Bot is not connected or
          verified by this prototype. No classroom account system is included.
        </p>
      </div>
    </div>
  );
}
function Evidence({
  attempt,
  data,
  lesson,
  onSaved,
}: {
  attempt: Attempt;
  data: TeacherData;
  lesson: Lesson;
  onSaved: () => Promise<void>;
}) {
  const current = attempt.reviews.at(-1),
    [criteria, setCriteria] = useState<Criterion[]>(
      current?.criteria ?? attempt.mainAssessment?.criteria ?? [],
    ),
    [note, setNote] = useState(""),
    [action, setAction] = useState<"accept" | "correct">("accept"),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const learner = data.learners.find((l) => l.id === attempt.learnerId),
    main = data.answers.find((a) => a.id === attempt.mainAnswerId),
    answers = data.answers.filter((a) => a.attemptId === attempt.id),
    mainResult = attempt.mainAssessment;
  async function save() {
    setSaving(true);
    setError("");
    try {
      await api(
        `/attempts/${attempt.id}/review`,
        attemptSchema,
        json("POST", {
          action,
          note,
          criteria:
            action === "accept"
              ? (current?.criteria ?? mainResult?.criteria)
              : criteria,
        }),
      );
      setNote("");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className="evidence-detail">
      <div className="evidence-title">
        <div className="eyebrow">
          {attempt.sample ? "SAMPLE EVIDENCE" : "SAVED STUDENT EVIDENCE"}
        </div>
        <h2>
          {learner?.id === "you"
            ? "Your explanation"
            : `${learner?.name}’s explanation`}
        </h2>
        <p>
          {new Date(attempt.createdAt).toLocaleString()} · Pip was{" "}
          {attempt.profile}
        </p>
        <span
          className={`result-pill ${current?.outcome ?? mainResult?.outcome ?? ""}`}
        >
          {current?.outcome
            ? labels[current.outcome]
            : mainResult
              ? labels[mainResult.outcome]
              : "Not yet assessed"}
        </span>
        {learner?.completedAt && (
          <span className="completion-note">
            ✦ Completion earned{" "}
            {new Date(learner.completedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      {main ? (
        <section className="evidence-section">
          <div className="section-label">THE ORIGINAL EVIDENCE</div>
          <p className="provenance">
            {main.provenance} · {main.transcription}
          </p>
          {main.audioPath ? (
            <audio controls src={`/api/answers/${main.id}/audio`} />
          ) : (
            <p className="fine-print">
              This prepared sample has no attached original recording.
            </p>
          )}
          <h3>Submitted transcript</h3>
          <blockquote>{reviewedTranscript(main)}</blockquote>
          <details>
            <summary>
              Original transcript and word corrections (
              {main.corrections.length})
            </summary>
            <p>{main.originalTranscript}</p>
            {main.corrections.map((edit, index) => (
              <div className="correction-line" key={index}>
                {index + 1}. Word {edit.index + 1} · <del>{edit.before}</del> →{" "}
                <strong>{edit.after}</strong>{" "}
                <time>{new Date(edit.at).toLocaleTimeString()}</time>
              </div>
            ))}
            {main.corrections.length === 0 && <p>No words changed.</p>}
          </details>
        </section>
      ) : (
        <p className="sample-notice">
          Authored sample classmate assessment. No real learner recording
          exists.
        </p>
      )}
      {mainResult && (
        <section className="evidence-section">
          <div className="section-label">
            AI INTERPRETATION <span>{mainResult.provider}</span>
          </div>
          <p>{mainResult.summary}</p>
          <p className="fine-print">
            {mainResult.model} · {new Date(mainResult.at).toLocaleString()}
          </p>
          <div className="criterion-list">
            {mainResult.criteria.map((c) => (
              <div className={`criterion criterion-${c.state}`} key={c.id}>
                <span className="criterion-icon">
                  {c.state === "demonstrated"
                    ? "✓"
                    : c.state === "not-assessable"
                      ? "?"
                      : "○"}
                </span>
                <div>
                  <h3>
                    {lesson.concepts.find((item) => item.id === c.id)?.title}
                    <span>{c.state.replaceAll("-", " ")}</span>
                  </h3>
                  {c.quote && <blockquote>“{c.quote}”</blockquote>}
                  <p>{c.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="evidence-section">
        <div className="section-label">
          APPLICATION QUESTIONS <span>Separate diagnostic evidence</span>
        </div>
        {attempt.diagnostics.length === 0 ? (
          <p className="fine-print">No submitted follow-up answers.</p>
        ) : (
          attempt.diagnostics.map((d) => {
            const answer = answers.find((a) => a.id === d.answerId);
            return (
              <div className="diagnostic" key={d.answerId}>
                <h3>
                  {
                    lesson.followups.find((q) => q.id === d.questionId)
                      ?.question
                  }
                </h3>
                <span className={`result-pill ${d.assessment.outcome}`}>
                  {d.assessment.outcome.replaceAll("-", " ")}
                </span>
                {answer?.audioPath && (
                  <audio controls src={`/api/answers/${answer.id}/audio`} />
                )}
                <blockquote>
                  {answer ? reviewedTranscript(answer) : "No answer evidence."}
                </blockquote>
                {answer && (
                  <details>
                    <summary>
                      Original transcript and {answer.corrections.length}{" "}
                      corrections
                    </summary>
                    <p>{answer.originalTranscript}</p>
                    {answer.corrections.map((c, index) => (
                      <p key={index}>
                        {c.before} → {c.after} ·{" "}
                        {new Date(c.at).toLocaleTimeString()}
                      </p>
                    ))}
                  </details>
                )}
                <p>{d.assessment.reason}</p>
                {d.assessment.observations.map((c) => (
                  <p key={c.id} className="fine-print">
                    {lesson.concepts.find((item) => item.id === c.id)?.title} ·{" "}
                    {c.state} · {c.reason}
                  </p>
                ))}
                <p className="fine-print">
                  {d.assessment.provider} · {d.assessment.model} ·{" "}
                  {new Date(d.assessment.at).toLocaleString()}
                </p>
              </div>
            );
          })
        )}
      </section>
      {mainResult && main && (
        <section className="evidence-section review-section">
          <div className="section-label">YOUR JUDGMENT</div>
          <h2>The teacher has the final say.</h2>
          <div className="review-radios">
            <label>
              <input
                type="radio"
                checked={action === "accept"}
                onChange={() => setAction("accept")}
              />{" "}
              Accept interpretation
            </label>
            <label>
              <input
                type="radio"
                checked={action === "correct"}
                onChange={() => setAction("correct")}
              />{" "}
              Correct interpretation
            </label>
          </div>
          {action === "correct" &&
            criteria.map((c, index) => (
              <label className="review-criterion" key={c.id}>
                {lesson.concepts.find((item) => item.id === c.id)?.title}
                <select
                  value={c.state}
                  onChange={(event) => {
                    const state = criteria[index];
                    if (!state) return;
                    const updated = criteria.map((item, i) =>
                      i === index
                        ? { ...item, state: stateSchema(event.target.value) }
                        : item,
                    );
                    setCriteria(updated);
                  }}
                >
                  <option value="demonstrated">Demonstrated</option>
                  <option value="missing">Missing</option>
                  <option value="contradicted">Contradicted</option>
                  <option value="not-assessable">Not assessable</option>
                </select>
              </label>
            ))}
          <label className="review-note">
            Review note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Explain your judgment for the evidence history."
              rows={3}
            />
          </label>
          <button
            className="button primary"
            disabled={!note.trim() || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving review…" : "Save teacher review"}
          </button>
          {error && <p className="error">{error}</p>}
          <p className="fine-print">
            A correction updates the current interpretation and recap. Earlier
            evidence and any earned completion remain in history.
          </p>
        </section>
      )}
      {attempt.reviews.length > 0 && (
        <section className="evidence-section">
          <div className="section-label">TEACHER REVIEW HISTORY</div>
          {attempt.reviews.map((review) => (
            <div className="review-audit" key={review.id}>
              <strong>
                {review.action === "accept" ? "Accepted" : "Corrected"} ·{" "}
                {labels[review.outcome]}
              </strong>
              <p>{review.note}</p>
              <time>{new Date(review.at).toLocaleString()}</time>
            </div>
          ))}
        </section>
      )}
    </article>
  );
}
function stateSchema(value: string): Criterion["state"] {
  switch (value) {
    case "demonstrated":
    case "missing":
    case "contradicted":
    case "not-assessable":
      return value;
    default:
      throw new Error("Unknown criterion state.");
  }
}
