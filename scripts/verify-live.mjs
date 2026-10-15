import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const base = process.env.FEYN_API_URL ?? 'http://127.0.0.1:4173';
const root = new URL('../', import.meta.url);
const email = process.env.FEYN_TEACHER_EMAIL ?? 'teacher@example.com';
const signIn = await fetch(`${base}/api/auth/dev?${new URLSearchParams({ email, name: 'Live check' })}`, { redirect: 'manual' });
const cookie = signIn.headers.getSetCookie().find(c => c.startsWith('feyn_session='))?.split(';')[0];
assert.ok(cookie, 'Run the server with DEV_LOGIN=1 and TEACHER_EMAILS starting with FEYN_TEACHER_EMAIL.');
async function request(path, options) {
  const headers = { cookie, origin: base, authorization: `Bearer ${process.env.MCP_TOKEN ?? ''}`, ...options?.headers };
  const response = await fetch(base + path, { ...options, headers, signal: AbortSignal.timeout(120000) });
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
const status = await request('/api/assignments/cart-speed/bootstrap');
assert.equal(status.providers.transcription, true, 'Configure the ElevenLabs server credential first.');
assert.equal(status.providers.assessment, true, 'Configure the actual assessment gateway first.');
const realCompletionBefore = status.completedAt;
const attempt = await request('/api/attempts', post({ assignmentId: 'cart-speed', sample: true, reviewedOpportunity: false }));
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
assert.equal(assessed.mainAssessment.provider, status.providers.assessor);
assert.deepEqual(assessed.mainAssessment.criteria.map(c => c.state), ['demonstrated', 'demonstrated', 'demonstrated']);
const quick = await recording(attempt.id, 'followup-1', 'followup-incorrect.wav');
const diagnostic = await request(`/api/attempts/${attempt.id}/submit`, post({ answerId: quick.answer.id }));
assert.equal(diagnostic.diagnostics[0].assessment.outcome, 'incorrect');
assert.equal(diagnostic.mainAssessment.outcome, 'pass');
await request(`/api/attempts/${attempt.id}/finish`, post({}));
assert.equal((await request('/api/assignments/cart-speed/bootstrap')).completedAt, realCompletionBefore, 'Synthetic verification must not grant real learner completion.');
const evidence = await request('/api/teacher/assignments/cart-speed');
const saved = evidence.answers.find(a => a.id === main.answer.id);
assert.equal(saved.originalTranscript, original);
assert.equal(saved.corrections.length, 1);
const audio = await fetch(`${base}/api/answers/${main.answer.id}/audio`, { headers: { cookie } });
assert.equal(audio.status, 200);
assert.equal(createHash('sha256').update(Buffer.from(await audio.arrayBuffer())).digest('hex'), createHash('sha256').update(main.bytes).digest('hex'));
const tools = await request('/mcp', post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
assert.equal(tools.result.tools.some(t => t.name === 'get_assignment'), true);
const assignment = await request('/mcp', post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_assignment', arguments: { assignmentId: 'cart-speed' } } }));
assert.equal(JSON.parse(assignment.result.content[0].text).id, 'cart-speed');
const result = {
  inputSource: 'Synthetic audio fixtures. These are not real classroom learning results.',
  attemptId: attempt.id,
  transcription: 'Real ElevenLabs Scribe v2',
  main: assessed.mainAssessment,
  diagnostic: diagnostic.diagnostics[0].assessment,
  originalAudioByteMatch: true,
  correctionHistoryPreserved: true,
  realLearnerCompletionUnchanged: true,
  mcpAssignmentRead: true,
  uBotHostConnection: 'Not verified',
};
await mkdir(new URL('.audit/', root), { recursive: true });
await writeFile(new URL('.audit/live-verification.json', root), JSON.stringify(result, null, 2));
process.stdout.write(JSON.stringify({ result: 'PASS', attemptId: attempt.id, main: 'pass', followup: 'incorrect', originalAudioByteMatch: true, mcp: 'assignment read verified' }) + '\n');
