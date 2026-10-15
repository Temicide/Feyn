# Keep the teacher list in the database and scope teacher access to their courses

Feyn is moving from one built-in lesson to many courses. Each course has one teacher, and students enroll with a join code. The teacher list moves from the `TEACHER_EMAILS` environment variable to a `teachers` collection. On startup, the server copies `TEACHER_EMAILS` into that collection, adding only missing emails, so existing deployments keep a first teacher. After that, any teacher can add another teacher's email from the teacher's desk. The role is checked against the collection on every request instead of being fixed when the session starts.

A teacher reads attempts, recordings and recaps only from courses they teach. Previously any teacher read all evidence, which across many courses would expose students' recordings to unrelated teachers. Letting every teacher see every course would have been simpler, but students' recordings are the most sensitive records Feyn stores.

Only teachers can create courses. This keeps course creation out of reach of arbitrary Google accounts, for example during a public demo. A student account belongs to a course only through enrollment.
