import { useEffect, useState } from "react";
import {
  attemptSchema,
  recapDraftSchema,
  reviewedTranscript,
  teacherViewSchema,
  type Attempt,
  type Criterion,
  type TeacherView,
} from "../shared/contracts.js";
import type { z } from "zod";
import { api, json } from "./api.js";
import { attemptStanding } from "../shared/work-status.js";
import { href } from "./route.js";
import { failure, Loading } from "./ui.js";

const labels = {
  pass: "Meets the main criteria",
  "needs-work": "Main explanation needs work",
  "not-enough-evidence": "Not enough evidence",
};
function reviewQueueTier(attempt: Attempt): number {
  const standing = attemptStanding(attempt);
  if (attempt.sample || standing?.kind !== "waiting") return 2;
  return standing.reason === "requested" ? 0 : 1;
}
const edited = (attempt: Attempt, data: TeacherView) =>
  attempt.rubric.revision < data.assignment.revision;
export function Teacher({
  assignmentId,
  learnerId,
  selectedAttemptId,
  setContext,
}: {
  assignmentId: string;
  learnerId: string;
  selectedAttemptId: string | null;
  setContext: (text: string) => void;
}) {
  const [data, setData] = useState<TeacherView | null>(null),
    [draft, setDraft] = useState<z.infer<typeof recapDraftSchema> | null>(null),
    [drafting, setDrafting] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(selectedAttemptId),
    [tab, setTab] = useState<"evidence" | "recap">("evidence");
  async function refresh() {
    try {
      setData(
        await api(`/teacher/assignments/${assignmentId}`, teacherViewSchema),
      );
      setError("");
    } catch (e) {
      setError(failure(e, "Could not load evidence."));
    }
  }
  useEffect(() => {
    void refresh();
  }, [assignmentId]);
  useEffect(
    () => setContext(data?.course.title ?? ""),
    [data?.course.title, setContext],
  );
  async function draftRecap() {
    setDrafting(true);
    setError("");
    try {
      setDraft(
        await api(
          `/teacher/assignments/${assignmentId}/recap-draft`,
          recapDraftSchema,
          json("POST", {}),
        ),
      );
    } catch (e) {
      setError(failure(e, "U-Bot could not draft the recap."));
    } finally {
      setDrafting(false);
    }
  }
  const attempts =
      data?.attempts.toSorted(
        (a, b) =>
          reviewQueueTier(a) - reviewQueueTier(b) ||
          b.createdAt.localeCompare(a.createdAt),
      ) ?? [],
    active =
      attempts.find((a) => a.id === selected) ??
      attempts.find((a) => a.learnerId === learnerId) ??
      attempts[0];
  const name = (id: string) =>
    data?.learners.find((l) => l.id === id)?.name ?? id;
  if (!data)
    return error ? (
      <div className="teacher-page">
        <a className="link-button back-link" href={href({ kind: "desk" })}>
          Your courses
        </a>
        <p className="error">{error}</p>
      </div>
    ) : (
      <Loading text="Opening the teacher’s desk" />
    );
  return (
    <div className="teacher-page">
      <a
        className="link-button back-link"
        href={href({ kind: "teach-course", courseId: data.course.id })}
      >
        Back to {data.course.title}
      </a>
      <div className="page-heading">
        <div>
          <h1>{data.assignment.title || "Untitled assignment"}</h1>
          <p>
            Listen to each explanation, check Pip’s reading of it against the
            student’s own words, and record your judgment.
          </p>
        </div>
        <a
          className="choice"
          href={href({ kind: "edit", assignmentId: data.assignment.id })}
        >
          {data.assignment.locked ? "View assignment" : "Edit assignment"}
        </a>
      </div>
      <div className="teacher-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "evidence"}
          onClick={() => setTab("evidence")}
        >
          Student evidence
        </button>
        <button
          role="tab"
          aria-selected={tab === "recap"}
          onClick={() => setTab("recap")}
        >
          Class recap
        </button>
        <button className="link-button refresh" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {tab === "recap" && (
        <>
          {data.learners.some((l) => l.sample) && (
            <div className="sample-notice">
              <strong>Some of these records are made up.</strong> Authored
              sample classmates and names ending in “walkthrough” are labeled
              samples. They don’t show that Feyn helps a real class learn.
            </div>
          )}
          {data.recap.length === 0 ? (
            <p className="fine-print">
              This assignment has no concepts yet, so there is nothing to
              recap.
            </p>
          ) : (
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
                      {row.demonstrated.length} of {data.roster.length}{" "}
                      currently demonstrate it
                    </p>
                  </div>
                  <Bucket
                    kind="gap"
                    label="Current gap"
                    ids={row.gaps}
                    name={name}
                    empty="No current gaps"
                  />
                  <Bucket
                    kind="resolved"
                    label="Resolved"
                    ids={row.resolved}
                    name={name}
                    empty="None yet"
                  />
                  <Bucket
                    kind="unassessed"
                    label="Unassessed"
                    ids={row.unassessed}
                    name={name}
                    empty="Everyone assessed"
                  />
                </div>
              ))}
            </div>
          )}
          <p className="fine-print">
            The recap counts the {data.roster.length}{" "}
            {data.roster.length === 1 ? "student" : "students"} currently
            enrolled in this course. Each counts once per concept, using their
            latest usable evidence from a main explanation, an example
            question, or your review. Resolved students also count as
            demonstrating the concept. Sample walkthroughs and students who
            left keep their evidence, but aren’t counted here.
          </p>
          {data.ubot && (
            <section className="support-queue">
              <h2>Plan the recap with U-Bot</h2>
              <p className="fine-print">
                U-Bot receives only the concept counts above. No names,
                transcripts, or recordings leave Feyn.
              </p>
              <button
                className="choice choice-primary"
                disabled={drafting}
                onClick={() => void draftRecap()}
              >
                {drafting ? "U-Bot is drafting" : "Draft recap with U-Bot"}
              </button>
              {draft && (
                <div className="recap-draft">
                  <p style={{ whiteSpace: "pre-wrap" }}>{draft.text}</p>
                  <p className="fine-print">
                    Drafted by {draft.provider} on{" "}
                    {new Date(draft.at).toLocaleString()}
                  </p>
                </div>
              )}
            </section>
          )}
          <section className="support-queue">
            <h2>Individual support</h2>
            <p className="fine-print">
              Automatic help flags aren’t active in this prototype. Repeated
              main explanations or one missed optional question do not establish
              that the same misconception persisted after a fresh application
              question. Use the saved evidence and class recap to decide who
              needs support.
            </p>
          </section>
        </>
      )}
      {tab === "evidence" && (
        <div className="evidence-layout">
          <aside className="attempt-list">
            <h2>
              Turned in <span>{attempts.length}</span>
            </h2>
            {attempts.length === 0 && (
              <p className="fine-print">
                No explanations yet. They’ll appear here as students teach Pip.
              </p>
            )}
            {attempts.map((attempt) => (
              <button
                key={attempt.id}
                className={`attempt-item ${active?.id === attempt.id ? "active" : ""}`}
                onClick={() => setSelected(attempt.id)}
              >
                <span className="avatar" aria-hidden="true">
                  {name(attempt.learnerId).charAt(0).toUpperCase()}
                </span>
                <span className="attempt-name">
                  {name(attempt.learnerId)}{" "}
                  {attempt.sample && (
                    <small className="sample-tag">Sample</small>
                  )}{" "}
                  {edited(attempt, data) && (
                    <small className="sample-tag edited-tag">
                      Edited since
                    </small>
                  )}
                  {reviewQueueTier(attempt) === 0 && (
                    <small className="sample-tag requested-tag">
                      Review requested
                    </small>
                  )}
                </span>
                <span className="attempt-status">
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
              learnerId={learnerId}
              onSaved={refresh}
            />
          )}
        </div>
      )}
      <div className="integration-note">
        <p>
          MCP clients holding the server’s token can read this desk at{" "}
          <code>{location.origin}/mcp</code>. Access is read-only.
        </p>
      </div>
    </div>
  );
}
function Evidence({
  attempt,
  data,
  learnerId,
  onSaved,
}: {
  attempt: Attempt;
  data: TeacherView;
  learnerId: string;
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
    mainResult = attempt.mainAssessment,
    concept = (id: string) =>
      attempt.rubric.concepts.find((item) => item.id === id)?.title ?? id;
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
        {attempt.sample && <p className="sample-tag">Sample evidence</p>}
        <h2>
          {learner?.id === learnerId
            ? "Your explanation"
            : `${learner?.name}’s explanation`}
        </h2>
        <p>
          Recorded {new Date(attempt.createdAt).toLocaleString()}, with Pip
          feeling {attempt.rubric.profile}
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
        {attempt.reviewRequest && (
          <p className="review-request-note">
            <b>Student asked for a check.</b>{" "}
            {attempt.reviewRequest.note || "No note added."}
          </p>
        )}
        {edited(attempt, data) && (
          <span className="sample-tag edited-tag">
            Edited since this attempt. Results use the version the student saw.
          </span>
        )}
      </div>
      {main ? (
        <section className="evidence-section">
          <h3 className="section-title">Original evidence</h3>
          <dl className="provenance">
            <dt>Source</dt>
            <dd>{main.provenance.replaceAll("-", " ")}</dd>
            <dt>Transcription</dt>
            <dd>{main.transcription}</dd>
          </dl>
          {main.audioId ? (
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
                <span>Word {edit.index + 1}</span> <del>{edit.before}</del>{" "}
                <ins>{edit.after}</ins>{" "}
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
          <h3 className="section-title">
            AI interpretation <span>{mainResult.provider}</span>
          </h3>
          <p>{mainResult.summary}</p>
          <p className="fine-print">
            Model {mainResult.model}, {new Date(mainResult.at).toLocaleString()}
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
                    {concept(c.id)}
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
        <h3 className="section-title">
          Example questions <span>Recorded separately from completion</span>
        </h3>
        {attempt.diagnostics.length === 0 ? (
          <p className="fine-print">No submitted follow-up answers.</p>
        ) : (
          attempt.diagnostics.map((d) => {
            const answer = answers.find((a) => a.id === d.answerId);
            return (
              <div className="diagnostic" key={d.answerId}>
                <h3>
                  {
                    attempt.rubric.followups.find((q) => q.id === d.questionId)
                      ?.question
                  }
                </h3>
                <span className={`result-pill ${d.assessment.outcome}`}>
                  {d.assessment.outcome.replaceAll("-", " ")}
                </span>
                {answer?.audioId && (
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
                        <del>{c.before}</del> <ins>{c.after}</ins>{" "}
                        <time>{new Date(c.at).toLocaleTimeString()}</time>
                      </p>
                    ))}
                  </details>
                )}
                <p>{d.assessment.reason}</p>
                {d.assessment.observations.map((c) => (
                  <p key={c.id} className="fine-print">
                    <b>{concept(c.id)}</b>{" "}
                    {c.state.replaceAll("-", " ")}. {c.reason}
                  </p>
                ))}
                <p className="fine-print">
                  {d.assessment.provider}, model {d.assessment.model},{" "}
                  {new Date(d.assessment.at).toLocaleString()}
                </p>
              </div>
            );
          })
        )}
      </section>
      {mainResult && main && (
        <section className="evidence-section review-section">
          <h3 className="section-title">Your judgment</h3>
          <p>You have the final say. Pip’s reading is only a proposal.</p>
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
                {concept(c.id)}
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
              placeholder="Why you accepted or corrected it. This is kept in the review history."
              rows={3}
            />
          </label>
          <button
            className="choice choice-primary"
            disabled={!note.trim() || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving review" : "Save review"}
          </button>
          {error && <p className="error">{error}</p>}
          <p className="fine-print">
            A correction updates the current interpretation, the recap and the
            student's status. Earlier evidence stays in history.
          </p>
        </section>
      )}
      {attempt.reviews.length > 0 && (
        <section className="evidence-section">
          <h3 className="section-title">Review history</h3>
          {attempt.reviews.map((review) => (
            <div className="review-audit" key={review.id}>
              <strong>
                {review.action === "accept" ? "Accepted" : "Corrected"}:{" "}
                {labels[review.outcome].toLowerCase()}
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

function Bucket({
  kind,
  label,
  ids,
  name,
  empty,
}: {
  kind: "gap" | "resolved" | "unassessed";
  label: string;
  ids: string[];
  name: (id: string) => string;
  empty: string;
}) {
  return (
    <div className={`bucket bucket-${kind}`}>
      <span className="bucket-label">{label}</span>
      <b>{ids.length}</b>
      {ids.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul>
          {ids.map((id) => (
            <li key={id}>{name(id)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
