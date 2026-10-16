# Teacher reviews confirm or revoke task completion

ADR 0002 keeps task completion through optional retries, so a weaker later response never takes credit away. It did not cover a teacher overriding the bot assessment that granted the completion in the first place. Until now completion could only be added, so a student whose bot "pass" a teacher corrected to "needs work" still saw Done.

A bot pass still earns task completion at once, and the student's work status reads Waiting for review until a teacher confirms it as Approved. Because the teacher retains final judgment, completion is held only while at least one of the student's own attempts passes once teacher reviews are applied. A correction that leaves no passing attempt removes it and the work reads Not approved. A weaker retry never removes it, as ADR 0002 requires.

Keeping completion permanent was rejected because students would see a finished status on work their teacher had judged incomplete. Withholding completion until a teacher review was rejected because it makes every student wait on the teacher, against the immediate feedback the teaching scene gives; the Waiting for review status tells students the teacher has not confirmed it yet instead.
