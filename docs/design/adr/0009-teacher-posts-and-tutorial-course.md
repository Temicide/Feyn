# Teacher posts and a Let's Get Started course

A teacher can post announcements to a course's stream alongside assignments. A post holds text, up to four pictures, or both. Students in the course see posts newest first, above the course's assignments. The teacher can delete a post, which hides it and its pictures but keeps the record.

Uploaded pictures are stored like recordings, in a separate `image` file bucket, and are served only to the course's teacher and its enrolled students. Each picture is limited to 1 MB so that a full post stays under Vercel's 4.5 MB request limit. The browser scales larger photos down before uploading. SVG is refused because it can carry script.

Every new account is enrolled once in a seeded course, "Let's Get Started", which walks through the site in six posts and ends with a short practice assignment. It is seeded once per database, like the demo course, and taught by the first email in `TEACHER_EMAILS`, so the site owner can add posts to it. Enrollment happens when an account signs in for the first time. Leaving the course is final unless the student rejoins with the fixed code `HELLO1`, and existing accounts are not enrolled automatically.

ADR 0006 rejected seeding further subjects. This course is not a subject: it teaches the website, and the user asked for it.

The tutorial posts use the bundled Pip art rather than screenshots, so the pictures do not go stale when the interface changes. A post picture is therefore either an upload or a bundled path under `/art/`.
