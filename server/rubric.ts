import {
  rubricSchema,
  type Assignment,
  type AssignmentInput,
  type Rubric,
} from "../shared/contracts.js";

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "concept";
}

export function conceptsFromInput(
  concepts: AssignmentInput["concepts"],
): Assignment["concepts"] {
  const seen = new Map<string, number>();
  return concepts.map((concept) => {
    const base = slugify(concept.title),
      count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return {
      id: count === 1 ? base : `${base}-${count}`,
      title: concept.title,
      description: concept.description,
    };
  });
}

export function applyInput(
  base: Assignment,
  input: AssignmentInput,
): Assignment {
  const concepts = conceptsFromInput(input.concepts);
  return {
    ...base,
    title: input.title,
    question: input.question,
    reference: input.reference,
    profile: input.profile,
    dueDate: input.dueDate,
    concepts,
    followups: input.followups.map((q, index) => ({
      id: index === 0 ? "followup-1" : "followup-2",
      question: q.question,
      expected: q.expected,
      conceptIds: [...new Set(q.concepts)].map((i) => {
        const concept = concepts[i];
        if (!concept)
          throw new Error("A follow-up points at a concept that does not exist.");
        return concept.id;
      }),
    })),
  };
}

export function rubricOf(assignment: Assignment): Rubric {
  return rubricSchema.parse({
    title: assignment.title,
    question: assignment.question,
    reference: assignment.reference,
    profile: assignment.profile,
    concepts: assignment.concepts,
    followups: assignment.followups,
    revision: assignment.revision,
  });
}
