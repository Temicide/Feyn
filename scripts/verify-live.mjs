import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const base = process.env.FEYN_API_URL ?? 'http://127.0.0.1:4173';
const root = new URL('../', import.meta.url);
async function request(path, options) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(120000) });
  const data = await response.json();
  assert.equal(response.ok, true, `${path}: ${data.error ?? response.status}`);
  return data;
}
function post(body) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
async function recording(attemptId, kind, name) {
  const bytes = await readFile(new URL(`public/sample-audio/${name}`, root));
  const form = new FormData();
  form.set('audio', new File([bytes], name, { type: 'audio/wav' }));
  form.set('kind', kind);
  form.set('provenance', 'uploaded-recording');
  const result = await request(`/api/attempts/${attemptId}/audio`, { method: 'POST', body: form });
  assert.equal(result.error, null, result.error ?? 'transcription failed');
  return { answer: result.answer, bytes };
}
const status = await request('/api/bootstrap');
assert.equal(status.providers.transcription, true, 'Configure the ElevenLabs server credential first.');
assert.equal(status.providers.assessment, true, 'Configure the actual assessment gateway first.');
const realCompletionBefore = status.learner.completedAt;
const attempt = await request('/api/attempts', post({ profile: 'curious', sample: true, reviewedOpportunity: false }));
const main = await recording(attempt.id, 'main', 'main.wav');
assert.match(main.answer.originalTranscript, /instantaneous speed is six meters per second/i);
const original = main.answer.originalTranscript;
const tokens = original.match(/\S+/g) ?? [];
const index = tokens.length - 1;
const before = tokens[index];
assert.equal(typeof before, 'string');
const replacement = before.endsWith('.') ? before.slice(0, -1) : `${before}.`;
const corrected = await request(`/api/answers/${main.answer.id}`, {
  ...post({ index, replacement }), method: 'PATCH'
});
assert.equal(corrected.originalTranscript, original);
assert.equal(corrected.corrections.length, 1);
assert.equal(corrected.corrections[0].before, before);
assert.equal(corrected.corrections[0].after, replacement);
const assessed = await request(`/api/attempts/${attempt.id}/submit`, post({ answerId: main.answer.id }));
assert.equal(assessed.mainAssessment.outcome, 'pass');
assert.equal(assessed.mainAssessment.provider, 'Local AI gateway');
assert.deepEqual(assessed.mainAssessment.criteria.map(c => c.state), ['demonstrated', 'demonstrated', 'demonstrated']);
const earned = (await request('/api/teacher')).learners.find(learner => learner.id === attempt.learnerId)?.completedAt;
assert.equal(typeof earned, 'string');
const quick = await recording(attempt.id, 'followup-1', 'followup-incorrect.wav');
const diagnostic = await request(`/api/attempts/${attempt.id}/submit`, post({ answerId: quick.answer.id }));
assert.equal(diagnostic.diagnostics[0].assessment.outcome, 'incorrect');
assert.equal(diagnostic.mainAssessment.outcome, 'pass');
await request(`/api/attempts/${attempt.id}/finish`, post({}));
assert.equal((await request('/api/teacher')).learners.find(learner => learner.id === attempt.learnerId)?.completedAt, earned);
assert.equal((await request('/api/bootstrap')).learner.completedAt, realCompletionBefore, 'Synthetic verification must not grant real learner completion.');
const evidence = await request('/api/teacher');
const saved = evidence.answers.find(a => a.id === main.answer.id);
assert.equal(saved.originalTranscript, original);
assert.equal(saved.corrections.length, 1);
const audio = await fetch(`${base}/api/answers/${main.answer.id}/audio`);
assert.equal(audio.status, 200);
assert.equal(createHash('sha256').update(Buffer.from(await audio.arrayBuffer())).digest('hex'), createHash('sha256').update(main.bytes).digest('hex'));
const tools = await request('/mcp', post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
assert.equal(tools.result.tools.some(t => t.name === 'get_assignment'), true);
const assignment = await request('/mcp', post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_assignment', arguments: {} } }));
assert.equal(JSON.parse(assignment.result.content[0].text).id, 'cart-speed');
const result = {
  inputSource: 'Synthetic audio fixtures. These are not real classroom learning results.',
  attemptId: attempt.id,
  transcription: 'Real ElevenLabs Scribe v2',
  main: assessed.mainAssessment,
  diagnostic: diagnostic.diagnostics[0].assessment,
  completionPreserved: true,
  originalAudioByteMatch: true,
  correctionHistoryPreserved: true,
  realLearnerCompletionUnchanged: true,
  mcpAssignmentRead: true,
  uBotHostConnection: 'Not verified',
};
await mkdir(new URL('.audit/', root), { recursive: true });
await writeFile(new URL('.audit/live-verification.json', root), JSON.stringify(result, null, 2));
process.stdout.write(JSON.stringify({ result: 'PASS', attemptId: attempt.id, main: 'pass', followup: 'incorrect', completionPreserved: true, originalAudioByteMatch: true, mcp: 'assignment read verified' }) + '\n');
