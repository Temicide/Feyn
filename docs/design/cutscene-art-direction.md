# Cutscene art direction

Cutscene design agreed on 15 October 2026. This document specifies the presentation of [the learning prototype](teaching-scene.md). See [the implementation status](../IMPLEMENTATION-STATUS.md) for the implemented scope and remaining work.

## References

Three classroom screenshots from an existing game set the visual direction. They guide composition, warmth, portraits, and dialogue treatment. They are not part of this repository, which ships original artwork in `public/art/` instead.

The references show a pixel-art classroom with a green board, warm wood floor, desks, and small characters. The dialogue screenshots place the room above a large black dialogue box with a white border. A monochrome speaker portrait sits beside large white text. Black space surrounds the room.

The references establish the desired visual direction. Static screenshots do not establish animation timing or sound behavior. The subsequent interview settled the avatar scope, configurable child personality, excerpt presentation, and dialogue controls below.

The product uses an original classroom and original characters, consistent with the previously agreed pixel-art direction.

## Agreed presentation

The proof uses one fixed student avatar standing near the board as the explainer. One main child is the speaking partner. Any other classmates remain background characters. Student avatar customization belongs to a later development phase.

The human teacher selects one of two child profiles per assignment in the proof. Curious asks direct why and how questions. Playful tests the explanation through imaginative examples. A custom written personality description belongs to a later phase.

Child profiles control manner and expression. The assignment reference and criteria control assessment. A profile must not change which required concepts count as demonstrated. A harder assignment requires different criteria rather than a more impatient child.

The student avatar's dialogue uses short verbatim excerpts relevant to the exchange. The complete transcript remains available separately, and assessment uses the complete explanation. Excerpts must not rewrite the student's words.

Dialogue uses a typewriter effect. The first click reveals the complete text in the current box, and the next click advances. A question pauses advancement and presents a record-answer control. The classroom, portrait, and dialogue box remain visible during recording. There is no response timer.

Soft character blips accompany text as it appears. Revealing a complete line stops its blips. A clear mute control is available, and scene sounds pause while recording. Full spoken character dialogue belongs to a later phase.

The child has listening, thinking, puzzled, and aha portraits, with small gestures such as turning toward the board or nodding. The student avatar has speaking and waiting poses. The user accepted this expression set.

After the initial submission, a separate loading screen says "Preparing scenarios" before the classroom scene begins. This replaces the proposed transition that would have shown the child thinking inside the classroom during initial preparation.

Within the scene, an explicit button starts recording a spoken follow-up response. The student stops recording, reviews the transcript, and can replace up to three individual words per recorded answer or re-record before sending. Larger changes require re-recording. Preserve the original audio, original transcript, and before-and-after correction log. Three is an agreed prototype limit, not a validated cheating threshold.

Show animated dots in the student's black dialogue box as a thinking or mumbling moment while transcription or the child response is processing. Do not generate a substantive thought and put it into the student's mouth. Once transcription is ready, the reviewed ElevenLabs transcript supplies the student's dialogue and is used in the conversation with the child. The dots are presentation, not assessment evidence.

Assessment of the current main explanation determines which ending type fits the exchange, while randomness selects an event within that type. A wrong follow-up does not by itself select an unsuccessful task ending. Randomness must not award or withhold demonstrated understanding. Previously earned completion persists during optional retries, even if a later attempt needs more work.

## Agreed ending events and controls

Start with two variants for an accepted explanation: the child explains the idea back, a bell rings, and classmates leave; or the child excitedly applies the idea on the board. These events must not falsely claim the student answered every follow-up correctly.

Start with two variants for an explanation that still needs work: the child fetches a toy car for a future attempt; or the child opens a notebook at the confusing point. Neither requires a third follow-up response in the same scene.

After an ending event, show Finish and Try explaining again. Finish saves the attempt and returns to the assignment. Award task completion when the main explanation meets its criteria. If completion was already earned, preserve it during an optional retry even when the new answer is weaker. Try explaining again starts a new attempt while preserving earlier attempts.

Follow-up retries are optional. To retry, the student returns to the lesson and explains the topic again. A wrong follow-up remains recorded if the student does not retry; non-retry alone is not a penalty or a support-flag trigger.

## Mixed results and optional practice

When the main explanation meets its criteria but a follow-up is wrong, play a completion event with dialogue that acknowledges both results. Example: "Your explanation helped! I'm still puzzled by that last example. Maybe we can try it again sometime."

Keep the teacher's main explanation result, per-question diagnostic results, and task completion distinct. A later weaker response updates diagnostic evidence without automatically removing completion earned earlier. Preserve all attempts. This keeps voluntary practice from risking previously earned credit.

## Agreed transcript controls

Allow single-word replacement with up to three corrections per recorded answer. Do not allow paragraph replacement or insertion. Larger changes require re-recording. Keep the correction log visible to the teacher alongside the original recording and transcript.

These controls limit rewriting after dictation. They do not establish that a student did not read an externally written script. Changed numbers or negations can either fix transcription or change reasoning; an edit alone is not a cheating verdict. The assessment remains grounded in the recorded explanation and follow-up responses.
