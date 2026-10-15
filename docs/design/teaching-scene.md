# Teaching scene design

Prototype scope agreed, 15 October 2026. The user accepted the interaction, support policy, class recap rules, and demo sequence. No implementation has begun in this interview.

Product pitch: Students learn by teaching an AI child. Teachers discover what to explain next.

The proof uses English for the interface, spoken explanations, transcripts, and child dialogue.

Detailed cutscene design is agreed. See [the visual references and presentation specification](cutscene-art-direction.md). Main-explanation completion and diagnostic follow-up results are separate.

## Agreed interaction

The first learner is the user, an undergraduate. The initial proof covers an explanation attempt, bot assessment, and teacher view.

1. The student presses a large circular button to record an explanation.
2. The student stops recording, can correct up to three individual transcript words per recorded answer, and submits the explanation. Larger changes require re-recording. The original recording, original transcript, and correction log are preserved for teacher inspection. These restrictions do not establish whether the student used outside assistance.
3. After processing, a game scene presents the explanation through a student-as-teacher character's dialogue.
4. A novice character responds to the explanation. The scene uses original pixel art and dialogue boxes inspired by the user's Undertale reference. A correct explanation receives an application question. An incomplete explanation receives a response tied to its particular gap. The novice must not attribute invented mistakes to the student.
5. The novice asks one or two follow-up questions. The student records responses within the same scene and explanation attempt. The scene waits without a countdown while the student thinks and records.
6. During the attempt, the novice gives limited prompts rather than a worked answer. Student-facing feedback stays in the child's role-play voice. The child identifies its specific confusion without supplying the answer. After the follow-ups, a successful scene ends with the child applying what was explained. An unresolved scene ends with an encouraging invitation to retry. A short recap stays in the child's voice.
7. The bot proposes an assessment with the student's exact words and follow-up responses. The human teacher can accept or correct that interpretation and retains final judgment.

The teacher's support flag is not shown to the student. The student does not see an attempt countdown or a warning about a fixed number of allowed attempts. Learning history and current need for help are separate. The user accepted the support policy below.

The first implementation milestone is the successful end-to-end flow. The user explicitly deferred testing mistaken explanations and unclear recordings until later. These cases are planned checks, not completed validation.

## Completion and follow-up evidence

Assess the main explanation and each follow-up response separately. The task can complete when the main explanation meets its criteria, even if one or both follow-up responses are wrong. A main explanation that still needs work does not satisfy the completion requirement.

Assessment is grounded in what the teacher asked. The AI receives the assignment question, reference explanation, and essential concepts. The agreed pass rule requires every essential concept to be demonstrated without a major conceptual error, while accepting equivalent wording and examples. Unclear transcription returns not enough evidence rather than a conceptual failure. See [the agreed assessment prompt](explanation-assessment-prompt.md), which still requires live validation.

Show the teacher the main explanation result and each follow-up's question, response, and correctness. Do not turn an accepted explanation into a claim that every application of the concept has been mastered. Human teacher review remains authoritative.

The student may return to the lesson, explain again, and retry follow-up work. Preserve the earlier result in history and record the new result separately. Choosing not to retry a wrong follow-up is not itself a penalty, a reason to revoke completion, or a support-flag trigger.

An optional retry preserves already-earned task completion even if the newer main explanation or a follow-up is weaker. Show the latest diagnostic evidence to the teacher alongside the completed status. For an accepted explanation with a missed follow-up, use a completion ending whose child dialogue acknowledges that the question remains unresolved.

## Initial math assignment

The user accepted this prepared assignment for the initial proof and plans to replace the topic later.

Prompt: A cart's distance from its start is s(t) = t² meters, where t is time in seconds. Explain to a novice what its speed at exactly three seconds means and how to find it.

Reference: Average speed over an interval is change in distance divided by elapsed time. Instantaneous speed is the limit of that average as the interval shrinks. Here v(t) = 2t meters per second, so v(3) = 6 meters per second.

First follow-up: The cart travels seven meters between three and four seconds. Does that mean its speed at exactly three seconds is seven meters per second? Explain.

Expected reasoning: Seven meters per second is the average over that whole second. Speed changes during the interval. Speed at exactly three seconds is six meters per second.

Optional second follow-up: What is the speed at five seconds, and why does it differ from the speed at three seconds?

Expected reasoning: Ten meters per second. The rate of change of t² is 2t, so speed increases with time in this example.

Main explanation criteria: Distinguishes distance from speed, distinguishes average from instantaneous speed, and explains what six meters per second means at three seconds. Merely reciting a formula does not establish these concepts.

Diagnostic follow-ups separately record reasoning about the seven-meter interval and the changed five-second example. These results remain visible to the teacher without independently blocking main-task completion.

## Agreed delivery sequence

1. Complete the successful live single-learner flow: record speech, transcribe it, review word corrections, submit, play the teaching scene, answer one or two follow-ups, and show the real attempt and assessment in the teacher view.
2. Add the class recap view using clearly labeled sample classmates alongside the live learner. Demonstrate current gaps, resolved gaps, and missing assessments as separate categories.
3. Later, test mistaken explanations and unclear recordings, ask a real teacher to review the evidence, and check an independent student response to a fresh problem. These checks remain unperformed.

Reproduce the user's reported U-Bot connection and complete the ElevenLabs speech-to-text integration as part of the first milestone. Accounts, classroom enrollment, and an assignment editor are deferred.

## Agreed support policy

The user accepted this policy and added a whole-class recap as a teacher action.

A first observed gap enters learning history and leads to a chance to review material and try again. It does not by itself create an intervention request.

A fresh check uses a different application question. If the same specific gap persists after that opportunity to review, and the evidence shows no meaningful progress on that gap, create a teacher-only support flag. Attempt count alone is insufficient. An unclear recording or ambiguous assessment does not establish a conceptual gap.

Under the newer completion rule, an incorrect optional follow-up is separately recorded. Choosing not to retry that question does not itself trigger this policy. Persistent, evidenced difficulty can still inform teacher review; a missed question alone is not proof that the main explanation failed.

Recompute current support status when a new assessment completes and when the teacher opens the support view. New evidence that resolves the flagged gap removes it from the active help queue, while preserving its history. Completing or submitting work alone does not establish resolution. The teacher retains final assessment authority.

The teacher sees the latest assessment time, the specific unresolved concept, and evidence from the relevant attempts. Missing or old evidence is identified as such. The system cannot know that a student learned offline without a new check or human review.

## Class recap

The user wants the teacher to recap concepts that several students still misunderstand before starting the next lesson. The teacher can address a shared gap without singling out individual students. Individual support remains available for persistent difficulty.

Agreed presentation: summarize each concept using each learner's latest usable evidence, counting a learner once per concept. Preserve earlier difficulty in history, remove resolved gaps from current counts, and show missing evidence separately. A class recap can be useful for shared current gaps even when the stricter individual-support trigger has not been met.

The first milestone remains the live successful single-learner pipeline. The user accepted a later demo addition using clearly labeled sample classmates to illustrate the aggregate view. Sample records must not be presented as real classroom results or proof of learning benefit.

## Integration evidence

The user reports previously testing a server connection to U-Bot through MCP successfully. This is user-reported evidence. The current project still needs to reproduce that connection with a real request and returned result. No completed integration test exists in this prototype yet.
