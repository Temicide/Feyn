import { useEffect, useState } from "react";
import { z } from "zod";
import {
  assignmentSchema,
  rubricDraftSchema,
  teacherViewSchema,
  type Assignment,
  type AssignmentInput,
  type Profile,
  type RubricDraft,
} from "../shared/contracts.js";
import { api, json } from "./api.js";
import { go, href } from "./route.js";
import { ErrorBanner, failure, Loading } from "./ui.js";

const maxConcepts = 5,
  maxFollowups = 2;
const ubotDraftSchema = rubricDraftSchema.extend({
  provider: z.string(),
  at: z.string(),
});

type Action = "save" | "post" | "unlock" | "draft";
type ConceptField = { key: string; title: string; description: string };
type FollowupField = {
  key: string;
  question: string;
  expected: string;
  conceptKeys: string[];
};
type Form = {
  title: string;
  question: string;
  reference: string;
  profile: Profile;
  dueDate: string;
  concepts: ConceptField[];
  followups: FollowupField[];
};

const newKey = () => crypto.randomUUID();
const emptyConcept = (): ConceptField => ({
  key: newKey(),
  title: "",
  description: "",
});
const emptyFollowup = (): FollowupField => ({
  key: newKey(),
  question: "",
  expected: "",
  conceptKeys: [],
});

function formOf(assignment: Assignment): Form {
  const concepts = assignment.concepts.map((c) => ({
    key: newKey(),
    title: c.title,
    description: c.description,
  }));
  const keyOf = new Map(assignment.concepts.map((c, i) => [c.id, concepts[i]!.key]));
  const followups = assignment.followups.map((q) => ({
    key: newKey(),
    question: q.question,
    expected: q.expected,
    conceptKeys: q.conceptIds.flatMap((id) => keyOf.get(id) ?? []),
  }));
  return {
    title: assignment.title,
    question: assignment.question,
    reference: assignment.reference,
    profile: assignment.profile,
    dueDate: assignment.dueDate ?? "",
    concepts: concepts.length > 0 ? concepts : [emptyConcept()],
    followups: followups.length > 0 ? followups : [emptyFollowup()],
  };
}

function inputOf(form: Form): AssignmentInput {
  const index = new Map(form.concepts.map((c, i) => [c.key, i]));
  return {
    title: form.title,
    question: form.question,
    reference: form.reference,
    profile: form.profile,
    dueDate: form.dueDate || null,
    concepts: form.concepts.map(({ title, description }) => ({
      title,
      description,
    })),
    followups: form.followups.map((q) => ({
      question: q.question,
      expected: q.expected,
      concepts: q.conceptKeys.flatMap((key) => index.get(key) ?? []),
    })),
  };
}

function withDraft(form: Form, draft: RubricDraft): Form {
  const concepts = [...form.concepts],
    placed = new Map<number, string>(),
    taken = new Set<string>();
  draft.concepts.forEach((drafted, i) => {
    const slot = concepts.findIndex(
      (c) => !c.title.trim() && !c.description.trim() && !taken.has(c.key),
    );
    if (slot >= 0) {
      const key = concepts[slot]!.key;
      concepts[slot] = { key, ...drafted };
      placed.set(i, key);
      taken.add(key);
    } else if (concepts.length < maxConcepts) {
      const added = { ...emptyConcept(), ...drafted };
      concepts.push(added);
      placed.set(i, added.key);
      taken.add(added.key);
    }
  });
  const followups = [...form.followups],
    filled = new Set<string>();
  for (const drafted of draft.followups) {
    const fill = {
      question: drafted.question,
      expected: drafted.expected,
      conceptKeys: drafted.concepts.flatMap((i) => placed.get(i) ?? []),
    };
    const slot = followups.findIndex(
      (q) => !q.question.trim() && !q.expected.trim() && !filled.has(q.key),
    );
    if (slot >= 0) {
      const current = followups[slot]!;
      followups[slot] = {
        ...current,
        ...fill,
        conceptKeys:
          current.conceptKeys.length > 0 ? current.conceptKeys : fill.conceptKeys,
      };
      filled.add(current.key);
    } else if (followups.length < maxFollowups) {
      const added = { ...emptyFollowup(), ...fill };
      followups.push(added);
      filled.add(added.key);
    }
  }
  return { ...form, concepts, followups };
}

export function AssignmentForm({
  assignmentId,
  setContext,
}: {
  assignmentId: string;
  setContext: (text: string) => void;
}) {
  const [loaded, setLoaded] = useState<{
      assignment: Assignment;
      course: { id: string; title: string };
      ubot: boolean;
    } | null>(null),
    [form, setForm] = useState<Form | null>(null),
    [error, setError] = useState(""),
    [errorFrom, setErrorFrom] = useState<Action | "load">("load"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState<Action | null>(null),
    [drafted, setDrafted] = useState(false);
  useEffect(() => {
    api(`/teacher/assignments/${assignmentId}`, teacherViewSchema).then(
      (view) => {
        setLoaded(view);
        setForm(formOf(view.assignment));
      },
      (e) => setError(failure(e, "Could not open the assignment.")),
    );
  }, [assignmentId]);
  useEffect(
    () => setContext(loaded?.course.title ?? ""),
    [loaded?.course.title, setContext],
  );
  if (!loaded || !form)
    return error ? (
      <div className="teacher-page">
        <a className="link-button back-link" href={href({ kind: "desk" })}>
          Your courses
        </a>
        <p className="error">{error}</p>
      </div>
    ) : (
      <Loading text="Opening the assignment" />
    );
  const { assignment, course } = loaded,
    locked = assignment.state === "posted" && assignment.locked,
    posted = assignment.state === "posted";
  const update = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setNote("");
    setError("");
  };
  const setConcept = (key: string, patch: Partial<ConceptField>) =>
    update({
      concepts: form.concepts.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    });
  const setFollowup = (key: string, patch: Partial<FollowupField>) =>
    update({
      followups: form.followups.map((q) =>
        q.key === key ? { ...q, ...patch } : q,
      ),
    });
  const save = async (): Promise<Assignment> => {
    const saved = await api(
      `/teacher/assignments/${assignmentId}`,
      assignmentSchema,
      json("PUT", inputOf(form)),
    );
    setLoaded({ ...loaded, assignment: saved });
    return saved;
  };
  async function run(kind: Action, task: () => Promise<void>) {
    setBusy(kind);
    setErrorFrom(kind);
    setError("");
    setNote("");
    try {
      await task();
    } catch (e) {
      setError(failure(e, "Something went wrong. Your changes are still here."));
    } finally {
      setBusy(null);
    }
  }
  const saveOnly = () =>
    run("save", async () => {
      const saved = await save();
      setNote(
        saved.locked
          ? "Saved and locked again. Students who already started keep the version they saw."
          : posted
            ? "Saved. Students see the new version."
            : "Draft saved. Students can't see it until you post it.",
      );
    });
  const saveAndPost = () =>
    run("post", async () => {
      await save();
      await api(
        `/teacher/assignments/${assignmentId}/post`,
        assignmentSchema,
        json("POST", {}),
      );
      go({ kind: "teach-course", courseId: course.id });
    });
  const unlock = () =>
    run("unlock", async () => {
      const unlocked = await api(
        `/teacher/assignments/${assignmentId}/unlock`,
        assignmentSchema,
        json("POST", {}),
      );
      setLoaded({ ...loaded, assignment: unlocked });
    });
  const draftWithUbot = () =>
    run("draft", async () => {
      const draft = await api(
        `/teacher/assignments/${assignmentId}/draft`,
        ubotDraftSchema,
        json("POST", { question: form.question, reference: form.reference }),
      );
      setForm(withDraft(form, draft));
      setDrafted(true);
    });
  const canDraft = Boolean(form.question.trim() && form.reference.trim());
  return (
    <div className="teacher-page assignment-form">
      <a
        className="link-button back-link"
        href={href({ kind: "teach-course", courseId: course.id })}
      >
        Back to {course.title}
      </a>
      <div className="page-heading">
        <div>
          <h1>
            {assignment.title
              ? assignment.title
              : posted
                ? "Edit assignment"
                : "New assignment"}
          </h1>
          <p>
            {posted
              ? "Posted to your students."
              : "A draft. Students can't see it until you post it."}
          </p>
        </div>
      </div>
      {locked && (
        <div className="sample-notice locked-notice">
          <p>
            <strong>Students have started this assignment.</strong> It's locked
            so their results stay tied to the version they saw. Unlock it to
            edit. Saving locks it again.
          </p>
          <button
            className="choice choice-primary"
            disabled={busy !== null}
            onClick={() => void unlock()}
          >
            {busy === "unlock" ? "Unlocking" : "Unlock to edit"}
          </button>
        </div>
      )}
      {(errorFrom === "load" || errorFrom === "unlock") && (
        <ErrorBanner error={error} onDismiss={() => setError("")} />
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void (posted ? saveOnly() : saveAndPost());
        }}
      >
        <fieldset className="form-stack" disabled={locked || busy !== null}>
          <section className="card form-section">
            <h2>The question</h2>
            <label className="field">
              Title
              <input
                value={form.title}
                maxLength={120}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="What speed means at one moment"
              />
            </label>
            <label className="field">
              Question for students
              <textarea
                rows={3}
                value={form.question}
                maxLength={2000}
                onChange={(event) => update({ question: event.target.value })}
                placeholder="What students explain to Pip, in your own words."
              />
            </label>
            <label className="field">
              Reference answer
              <textarea
                rows={5}
                value={form.reference}
                maxLength={4000}
                onChange={(event) => update({ reference: event.target.value })}
                placeholder="A strong explanation. Pip's assessor compares against it, and the sample walkthrough uses it."
              />
            </label>
            <div className="field-row">
              <label className="field">
                Pip's personality
                <select
                  value={form.profile}
                  onChange={(event) =>
                    update({
                      profile: event.target.value === "playful" ? "playful" : "curious",
                    })
                  }
                >
                  <option value="curious">Curious, asks why and how</option>
                  <option value="playful">Playful, imagines examples</option>
                </select>
                <span className="fine-print">
                  Changes how Pip talks, not what counts as understanding.
                </span>
              </label>
              <label className="field">
                Due date (optional)
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => update({ dueDate: event.target.value })}
                />
              </label>
            </div>
          </section>
          {loaded.ubot && !locked && (
            <section className="card form-section ubot-box">
              <div>
                <h2>Draft with U-Bot</h2>
                <p className="fine-print">
                  U-Bot reads your question and reference answer and suggests
                  concepts and follow-ups. It only fills empty fields.
                </p>
              </div>
              <button
                type="button"
                className="choice"
                disabled={!canDraft || busy !== null}
                onClick={() => void draftWithUbot()}
              >
                {busy === "draft" ? "U-Bot is drafting" : "Draft with U-Bot"}
              </button>
              {!canDraft && (
                <p className="fine-print">
                  Write the question and reference answer first.
                </p>
              )}
              {errorFrom === "draft" && error && (
                <p className="error" role="alert">
                  {error} Nothing in the form was changed.
                </p>
              )}
            </section>
          )}
          {drafted && (
            <p className="ubot-label" role="status">
              Drafted by U-Bot — review before posting
            </p>
          )}
          <section className="card form-section">
            <div className="form-section-head">
              <h2>Essential concepts</h2>
              <span className="fine-print">
                {form.concepts.length} of {maxConcepts}
              </span>
            </div>
            <p className="fine-print">
              What a good explanation has to get across. Pip's assessor checks
              each one.
            </p>
            {form.concepts.map((concept, i) => (
              <div className="repeat-item" key={concept.key}>
                <div className="repeat-head">
                  <h3>Concept {i + 1}</h3>
                  {form.concepts.length > 1 && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        update({
                          concepts: form.concepts.filter(
                            (c) => c.key !== concept.key,
                          ),
                          followups: form.followups.map((q) => ({
                            ...q,
                            conceptKeys: q.conceptKeys.filter(
                              (k) => k !== concept.key,
                            ),
                          })),
                        })
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
                <label className="field">
                  Title
                  <input
                    value={concept.title}
                    maxLength={120}
                    onChange={(event) =>
                      setConcept(concept.key, { title: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  What it means
                  <textarea
                    rows={2}
                    value={concept.description}
                    maxLength={600}
                    onChange={(event) =>
                      setConcept(concept.key, {
                        description: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            ))}
            {form.concepts.length < maxConcepts && (
              <button
                type="button"
                className="choice"
                onClick={() =>
                  update({ concepts: [...form.concepts, emptyConcept()] })
                }
              >
                Add concept
              </button>
            )}
          </section>
          <section className="card form-section">
            <div className="form-section-head">
              <h2>Follow-up questions</h2>
              <span className="fine-print">
                {form.followups.length} of {maxFollowups}
              </span>
            </div>
            <p className="fine-print">
              Pip asks these after the explanation. They're saved separately
              and never change completion.
            </p>
            {form.followups.map((followup, i) => (
              <div className="repeat-item" key={followup.key}>
                <div className="repeat-head">
                  <h3>Follow-up {i + 1}</h3>
                  {i > 0 && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        update({
                          followups: form.followups.filter(
                            (q) => q.key !== followup.key,
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
                <label className="field">
                  Question Pip asks
                  <textarea
                    rows={2}
                    value={followup.question}
                    maxLength={1000}
                    onChange={(event) =>
                      setFollowup(followup.key, {
                        question: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  Expected answer
                  <textarea
                    rows={2}
                    value={followup.expected}
                    maxLength={1000}
                    onChange={(event) =>
                      setFollowup(followup.key, {
                        expected: event.target.value,
                      })
                    }
                  />
                </label>
                <fieldset className="concept-checks">
                  <legend>Concepts it checks</legend>
                  {form.concepts.map((concept, j) => (
                    <label className="check" key={concept.key}>
                      <input
                        type="checkbox"
                        checked={followup.conceptKeys.includes(concept.key)}
                        onChange={(event) =>
                          setFollowup(followup.key, {
                            conceptKeys: event.target.checked
                              ? [...followup.conceptKeys, concept.key]
                              : followup.conceptKeys.filter(
                                  (k) => k !== concept.key,
                                ),
                          })
                        }
                      />
                      {concept.title.trim() || `Concept ${j + 1}`}
                    </label>
                  ))}
                </fieldset>
              </div>
            ))}
            {form.followups.length < maxFollowups && (
              <button
                type="button"
                className="choice"
                onClick={() =>
                  update({ followups: [...form.followups, emptyFollowup()] })
                }
              >
                Add a second follow-up
              </button>
            )}
          </section>
        </fieldset>
        {!locked && (
          <div className="form-actions">
            {(errorFrom === "save" || errorFrom === "post") && error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {note && (
              <p className="fine-print" role="status">
                {note}
              </p>
            )}
            <div className="choices">
              {posted ? (
                <button className="choice choice-primary" disabled={busy !== null}>
                  {busy === "save" ? "Saving" : "Save changes"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="choice"
                    disabled={busy !== null}
                    onClick={() => void saveOnly()}
                  >
                    {busy === "save" ? "Saving" : "Save draft"}
                  </button>
                  <button
                    className="choice choice-primary"
                    disabled={busy !== null}
                  >
                    {busy === "post" ? "Posting" : "Post"}
                  </button>
                </>
              )}
              <a
                className="link-button"
                href={href({ kind: "teach-course", courseId: course.id })}
              >
                Cancel
              </a>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
