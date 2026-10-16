# Project glossary

Terms for the education proof and the previous crypto monitoring concept.

## Education

**Course**:
A teacher-run group of enrolled students and the assignments set for them. A second section of the same subject is a separate course.
_Avoid_: Class, section, subject template

**Teacher**:
An account whose email is on the database's teacher list. A teacher can create courses and add other teachers, and reads evidence only from courses they teach.
_Avoid_: Admin

**Join code**:
A short code that a course's teacher creates and shares. A student who enters it is enrolled in that course.

**Enrollment**:
A student's membership in a course. It controls which assignments the student sees and which class recaps they count toward. A student can leave a course and its teacher can remove them; either ends the enrollment without deleting the student's learning history, and rejoining with a current join code restores it.

**Assignment**:
A teaching task posted to one course: a question, a reference answer, one to five essential concepts, and one or two follow-up questions. Each concept and follow-up is stored as data rather than code.

**Assignment draft**:
An unposted assignment that a teacher is editing. U-Bot can propose its concepts and follow-ups from the teacher's question and reference answer; the teacher edits and posts it. Students never see a draft.
_Avoid_: Generated assignment

**Assignment lock**:
The state in which a posted assignment cannot be edited. An assignment locks when its first student submission arrives. Its teacher can unlock it to edit, and saving the edit locks it again.

**Rubric copy**:
The copy of an assignment's question, concepts and follow-ups that an explanation attempt keeps from the moment it starts. Results and reviews are always read against this copy.
_Avoid_: Assignment version

**Explanation attempt**:
A student's initial explanation of a study topic and their responses to follow-up questions in the same teaching scene.

**Teaching scene**:
A conversation in which a student teaches a novice character and responds to one or two follow-up questions.

**Novice character**:
The simulated learner who responds to the student's explanation during a teaching scene.
_Avoid_: Human teacher, assessor

**Child profile**:
A personality for how the novice character speaks and behaves, chosen by the teacher for each assignment and kept in each attempt's rubric copy. It does not change the assignment's assessment criteria.

**Student avatar**:
The character that represents the real student as the explainer in a teaching scene.

**Ending event**:
A short scene that follows the teaching exchange. The assessment selects the appropriate outcome type, while chance can vary its dialogue and actions within that type.

**Follow-up response**:
A student's spoken answer to a diagnostic question within the current teaching scene. Its correctness is recorded separately from the main explanation's completion result.

**Main explanation**:
The student's initial teaching of the assigned topic, assessed against the assignment's explanation criteria.

**Task completion**:
The status awarded when the main explanation meets its criteria and preserved during optional retries. Incorrect follow-ups and weaker retry responses remain visible to the teacher without independently blocking or removing this status. It is held while any of the student's own attempts passes once teacher reviews are applied, so a teacher review can remove it.

**Turned in**:
What happens to a student's work when a main explanation is submitted and assessed, whatever the outcome. Finishing the follow-up questions is not required.
_Avoid_: Finished, submitted scene

**Work status**:
What a student sees about one assignment: Assigned (nothing turned in, not yet past due), Missing (nothing turned in after the due date has ended in the student's own timezone), Waiting for review, Approved, or Not approved. The student's best current attempt sets it, ranking Approved above Waiting for review above Not approved. Approved and Not approved say whether the bot assessment or a teacher decided. Work first turned in after its due date also reads "Done late". A teacher review changes it as soon as it is saved. Sample walkthroughs never change it. Students see whether work is approved or not, never per-concept results or a score.
_Avoid_: Grade, score

**Waiting for review**:
The work status when the bot assessment passed the main explanation, or the student sent a review request, and no teacher has reviewed it yet. A bot pass already earns task completion; a teacher review confirms it as Approved or overturns it.

**Not approved**:
The work status when the main explanation did not pass, either by the bot assessment or by a teacher review. It invites another try and is not a support flag.
_Avoid_: Failed, rejected

**Review request**:
A student's request that a teacher review an explanation attempt the bot assessment did not pass, because the student believes the explanation was correct and clear for the novice character. A student can send one, with an optional short note, on the attempt that currently sets their work status, and not after a teacher has reviewed that attempt.
_Avoid_: Appeal, complaint

**Bot assessment**:
The bot's proposed interpretation of an explanation attempt, supported by the student's words and follow-up responses. The human teacher can accept or correct it and retains final judgment.

**Teacher review**:
A human teacher's inspection of an explanation attempt and its bot assessment to decide whether the interpretation is justified.

**Support flag**:
A teacher-only indication that a student may currently need help, distinct from a record of a past misunderstanding. The student is not shown the flag or an attempt-limit warning.
_Avoid_: Failure verdict, cheating verdict

**Learning history**:
The record of a student's explanation attempts and assessments, including earlier gaps and later evidence of understanding.

**Class recap**:
A short teacher-led explanation before the next lesson that addresses concepts several students still find difficult. Each assignment has its own recap over its own concepts and the students enrolled in its course; concepts from different assignments are never merged.
_Avoid_: List of failed students

## Crypto monitoring

**Monitoring assistant**:
An assistant that tracks selected crypto holdings or a watchlist and explains relevant events.
_Avoid_: Portfolio manager, autonomous trader

**Holding**:
A quantity of a particular crypto asset owned by a person.

**Portfolio**:
The collection of a person's holdings.

**Watchlist**:
A selection of tokens a person wants to follow, whether or not they own them.

**Token unlock**:
The release of tokens from vesting restrictions according to a schedule. An unlock does not establish whether recipients sell their tokens or whether the price changes.

**Monitoring alert**:
A notification that an event meets a person's selected monitoring conditions.

**Portfolio briefing**:
A summary of events relevant to a person's holdings, with explanations and supporting sources.
