# Teaching scene architecture

## Usage

The student records an English explanation, reviews its words, and submits. The server preserves the original evidence, assesses the main explanation, and returns scene material. The classroom asks one or two follow-ups. The teacher reviews the same saved evidence and current concept summary.

## Shape

Use React and TypeScript with Vite for the browser and a small TypeScript Node server. The server owns durable evidence and policy. Use Node 26 SQLite for records and stable files for audio under ignored data/. The browser owns microphone lifetime, dialogue playback, and presentation only.

One canonical assignment contains the question, reference, essential concept IDs, and follow-up definitions. Main and diagnostic assessments use separate types and write paths. Derive completion from an earned grant and never revoke it during optional retries. Derive current concept status independently from the latest usable evidence and teacher review. Unknown or failed providers never become a conceptual-failure assessment.

Keep modules shallow in number and deep in capability. shared/contracts.ts owns validated domain/request schemas. server/lesson.ts owns assignment knowledge. server/attempts.ts owns durable records, transcript correction policy, completion, teacher revisions, and class projections. server/providers.ts owns remote protocols and external response parsing. server/main.ts owns HTTP and MCP transport. client modules render views and handle audio; they cannot import server code.

Corrections are ordered operations over stable word positions. Each accepted replacement consumes one of three operations, including another replacement at the same position. Preserve the original transcript/audio and every before/after correction. Derive the reviewed transcript. Never permit whole-paragraph insertion via the correction route.

Require every main criterion exactly once in provider results. Evidence quotes must actually occur in the submitted transcript. Compute the accepted main result from criterion states rather than trusting an unconstrained pass flag. Do not let a diagnostic route update the main result. Keep ambiguous transcript evidence distinct from clear mistakes.

Bind asynchronous work to answer/attempt identity so late results cannot attach to a replacement recording. Keep SQLite persistence behind the attempts module. Avoid a generic repository, plugin registry, or event bus.

## Synthesis decision

The two independent candidates compared browser-owned IndexedDB sessions and server-owned durable attempts. The parent and independent judge chose server ownership because teacher inspection and original recordings are core deliverables. From the browser candidate, retain separate main/diagnostic types and the ordered correction-operation log. Detailed candidates and judgment remain in the ignored local .audit/design/ directory. The public agreed design is in docs/design/.

## Provider status

A real request to the configured loopback Anthropic-compatible endpoint returned HTTP 200 and READY. Name that provider Local AI gateway and retain its model identity in evidence. This is not a completed U-Bot connection. ElevenLabs Scribe v2 transcription has been verified with synthetic audio. Credentials remain in ignored server configuration. The U-Bot host connection has not been verified. Provider errors remain operational errors rather than conceptual failures.

Expose a standards-based MCP endpoint over the same application owner if feasible. A server endpoint is not evidence of a connected U-Bot host. Keep the local prototype bound to loopback. No external deployment in this task.

## Verification

Check policy with rerunnable behavior tests. Check real structured assessment separately from sample scene playback. Drive the actual browser workflow and inspect the classroom on desktop and narrow viewports. Check persisted audio, original/edited transcripts, teacher revisions, separate follow-ups, and completion after reload. A labeled sample transcript can exercise live assessment but cannot prove ElevenLabs transcription.
