import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('Agent Hub hides its credentials and verdict renders the actual completed runtime record', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'court-document-test-')); const previousWindow = globalThis.window;
  try {
    await build({ stdin: { contents: "import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; export { React, renderToStaticMarkup }; export * from './src/components/AgentHubModal.tsx'; export * from './src/components/VerdictModal.tsx'; export * from './src/utils/courtRuntime.ts'; export * from './src/data/presetCases.ts';", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'esm', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, outfile: join(dir, 'document.mjs'), logLevel: 'silent', plugins: [{ name: 'static-dialog-boundary', setup(build) { build.onResolve({ filter: /^\.\/Modal$/ }, () => ({ path: 'test-dialog', namespace: 'test-dialog' })); build.onLoad({ filter: /.*/, namespace: 'test-dialog' }, () => ({ contents: "export function Modal({isOpen,children}) {return isOpen ? children : null}", loader: 'jsx' })); } }] });
    const { React, renderToStaticMarkup, AgentHubModal, VerdictModal, createCourtSession, advanceCourtSession, castJuryVote, PRESET_CASES } = await import(pathToFileURL(join(dir, 'document.mjs')));
    let session = createCourtSession(PRESET_CASES[0]);
    const noop = () => {};
    const hub = renderToStaticMarkup(React.createElement(AgentHubModal, { isOpen: true, onClose: noop, session, connection: { baseUrl: 'http://localhost:3000/api/court', sessionId: 'session-private', token: 'NEVER-RENDER-THIS-SECRET' }, onConnect: noop, onDisconnect: noop }));
    assert.ok(!hub.includes('NEVER-RENDER-THIS-SECRET'));
    assert.ok(!hub.includes('session-private'));
    while (session.status === 'active') session = await advanceCourtSession(session);
    session = castJuryVote(session, 'defendant'); session = await advanceCourtSession(session);
    session.ruling.result = '本轮实时裁决专属结果'; session.ruling.reasons = ['本轮公开理由完整保留'];
    session.caseData.plaintiffVerdict.result = '不应显示旧预制原告结局'; session.caseData.defendantVerdict.result = '不应显示旧预制被告结局';
    globalThis.window = { location: { href: 'https://court.example/current' } };
    const verdict = renderToStaticMarkup(React.createElement(VerdictModal, { isOpen: true, onClose: noop, session, onStartAppeal: noop, onPlayAgain: noop }));
    assert.ok(verdict.includes('本轮实时裁决专属结果')); assert.ok(verdict.includes('本轮公开理由完整保留'));
    // Old preset endings may exist inside the encoded archive, never as document content.
    assert.ok(!verdict.includes('不应显示旧预制原告结局')); assert.ok(!verdict.includes('不应显示旧预制被告结局'));
    assert.ok(verdict.includes('#court=v1.'));
  } finally { globalThis.window = previousWindow; await rm(dir, { recursive: true, force: true }); }
});
