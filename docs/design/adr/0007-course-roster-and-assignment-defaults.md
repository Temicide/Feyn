# Course roster and assignment defaults

These defaults complete the course model for the hackathon build.

A teacher sees their course's enrolled students and join code. They can issue a new join code, which disables the old one, and remove a student. A student can also leave a course themselves. Leaving and removal end the enrollment without deleting attempts: the student's learning history stays visible to the teacher, but they no longer count toward the course's class recaps. Rejoining with a current join code restores the enrollment and its history.

An assignment can carry an optional due date. It is shown to students but neither blocks nor penalises late work, because Feyn deliberately avoids penalties (ADR 0001, ADR 0002).

An assignment has one to five essential concepts, and U-Bot is asked to draft three. U-Bot also drafts two follow-up questions; the first is required for students and the second optional, and the teacher can delete the second.

The MCP endpoint stays. Its tools take a course ID and a `list_courses` tool is added. The bearer token still reads every course, so it must be guarded like an administrator credential.
