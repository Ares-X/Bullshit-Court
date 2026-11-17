import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/agentInvite.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { buildAgentInvite, getAgentRolePath, AGENT_GUIDE_PATH } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('invitation carries exactly the issued entry URL without protocol or case data', () => {
  const url = 'https://court.example/join/one-use-ticket';
  const invite = buildAgentInvite(url);
  assert.equal(invite.match(/https?:\/\/\S+/g)?.length, 1);
  assert.ok(invite.endsWith(url));
  assert.ok(invite.length < 120);
  for (const secret of ['caseJSON', 'seatToken', 'court_speak', '/Users/', 'expectedRevision']) assert.ok(!invite.includes(secret));
});

test('only issued HTTP entry links are accepted', () => {
  for (const invalid of ['javascript:alert(1)', 'https://court.example/agents/guide.md', 'https://user:secret@court.example/join/t', 'https://court.example/join/t?seatToken=secret', 'https://court.example/join/t#secret']) {
    assert.throws(() => buildAgentInvite(invalid));
  }
  assert.ok(buildAgentInvite('http://localhost:5173/join/dev-ticket').includes('/join/dev-ticket'));
});

test('each fixed role rule and the shared guide are served files', async () => {
  assert.equal(AGENT_GUIDE_PATH, '/agents/guide.md');
  for (const role of ['judge', 'plaintiff', 'defendant']) {
    const path = getAgentRolePath(role);
    assert.equal(path, `/agents/roles/${role}.md`);
    assert.ok((await readFile(new URL(`../public${path}`, import.meta.url), 'utf8')).length > 100);
  }
});
