import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
const dir = await mkdtemp(join(tmpdir(), 'court-sharing-'));
after(() => rm(dir, { recursive: true, force: true }));
await build({ stdin: { contents: "export * from './src/utils/caseShare.ts'; export * from './src/utils/multiplayer.ts'; export * from './src/utils/courtRuntime.ts'; export * from './src/data/presetCases.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'modules.mjs'), logLevel: 'silent' });
const { createCaseShareUrl, readCaseShareUrl, sanitizeCourtSession, MultiplayerService, createCourtSession, advanceCourtSession, castJuryVote, createAppealSession, PRESET_CASES } = await import(pathToFileURL(join(dir, 'modules.mjs')));
const fresh = () => createCourtSession(PRESET_CASES[0]);

test('full UTF-8 case snapshot round trips history, ruling and appeal, excluding secrets', async () => {
  let session = fresh();
  while (session.status === 'active') session = await advanceCourtSession(session);
  session = castJuryVote(session, 'plaintiff'); session = await advanceCourtSession(session);
  assert.equal(session.status, 'completed');
  const appeal = createAppealSession(session, '新聊天记录证明事前曾协商', 'defendant');
  const poisoned = { ...appeal, apiKey: 'TOP-SECRET', connection: { token: 'HIDDEN' }, caseData: { ...appeal.caseData, apiKey: 'NESTED-KEY' } };
  const url = createCaseShareUrl(poisoned, 'https://court.example/subdir/?room=123456');
  const restored = readCaseShareUrl(url);
  assert.deepEqual(restored, appeal);
  const decoded = JSON.stringify(restored); assert.ok(!decoded.includes('TOP-SECRET')); assert.ok(!decoded.includes('NESTED-KEY'));
  assert.equal(new URL(url).pathname, '/subdir/'); assert.equal(new URL(url).searchParams.has('room'), false);
  assert.deepEqual(readCaseShareUrl(createCaseShareUrl(session, 'https://court.example')), session);
});
test('malformed versions, oversized snapshots and unknown roles are rejected', () => {
  assert.equal(readCaseShareUrl('https://court.example/#other'), null);
  assert.throws(() => readCaseShareUrl('https://court.example/#court=v2.abc'));
  assert.throws(() => readCaseShareUrl('https://court.example/#court=v1.%%%'));
  assert.throws(() => createCaseShareUrl({ ...fresh(), caseData: { ...fresh().caseData, summary: 'x'.repeat(40_001) } }, 'https://court.example'));
  assert.throws(() => sanitizeCourtSession({ ...fresh(), pendingTurns: [{ role: 'lawyer', phase: 'opening', interventionIds: [] }] }));
});
class Connection extends EventEmitter { constructor(id) { super(); this.peer = id; this.open = true; this.sent = []; this.closed = false; } send(data) { this.sent.push(structuredClone(data)); } close() { this.closed = true; this.emit('close'); } }
class MockPeer extends EventEmitter { constructor(id) { super(); this.id = id; this.destroyed = false; this.outgoing = null; } connect(id) { this.outgoing = new Connection(id); return this.outgoing; } destroy() { this.destroyed = true; } }
const voteFrame = (roomId, id, winner = 'plaintiff') => ({ version: 1, roomId, id, type: 'CAST_VOTE', payload: { winner }, senderRole: 'judge', senderPeerId: 'forged', timestamp: Date.now() });
test('host readiness differs from guest connection; each peer gets one authoritative vote in the voting window', () => {
  let peer; const service = new MultiplayerService(id => peer = new MockPeer(id)); const received = []; const unsubscribe = service.subscribe(msg => { if (msg.type === 'CAST_VOTE') received.push(msg); });
  try {
    service.init('123456', true); peer.emit('open'); assert.equal(service.getState().status, 'ready');
    const a = new Connection('guest-a'), b = new Connection('guest-b'); peer.emit('connection', a); a.emit('open'); peer.emit('connection', b); b.emit('open');
    assert.equal(service.getState().peers.length, 2); assert.equal(service.getState().status, 'connected');
    let session = fresh(); service.send('SYNC_SESSION', session);
    const vote = (...args) => { const message = voteFrame(...args); message.payload = { ...message.payload, round: 0, sessionId: session.id }; return message; };
    a.emit('data', vote('123456', 'early')); assert.equal(received.length, 0);
    session = { ...session, pendingTurns: [], status: 'awaiting-ruling' }; service.send('SYNC_SESSION', session);
    a.emit('data', vote('123456', 'one')); a.emit('data', vote('123456', 'one')); a.emit('data', vote('123456', 'two', 'defendant'));
    b.emit('data', vote('wrong-room', 'three')); b.emit('data', { ...vote('123456', 'three'), version: 2 }); b.emit('data', vote('123456', 'four', 'defendant'));
    assert.equal(received.length, 2); assert.equal(received[0].senderPeerId, 'guest-a'); assert.equal(received[0].senderRole, 'jury'); assert.equal(service.getVotes().length, 2);
    assert.ok(a.sent.some(msg => msg.type === 'SYNC_SESSION'));
    service.send('SYNC_SESSION', { ...session, juryVote: 'plaintiff', status: 'active' });
    const c = new Connection('guest-c'); peer.emit('connection', c); c.emit('open'); c.emit('data', vote('123456', 'late')); assert.equal(received.length, 2);
    session = { ...session, id: 'appeal-new-id' }; service.send('SYNC_SESSION', session); a.emit('data', vote('123456', 'appeal')); assert.equal(received.length, 3);
    a.close(); assert.equal(service.getState().peers.length, 2);
    service.disconnect(); assert.equal(peer.destroyed, true); assert.equal(b.closed, true); assert.equal(c.closed, true); assert.equal(service.getState().status, 'disconnected');
  } finally { unsubscribe(); service.disconnect(); }
});
test('guest cannot publish sessions; malformed room codes create no peer', () => {
  let peer; const service = new MultiplayerService(id => peer = new MockPeer(id));
  try {
    service.init('abcdef', false); assert.equal(peer, undefined); assert.equal(service.getState().status, 'error');
    service.init('123456', false); peer.emit('open'); const conn = peer.outgoing; conn.emit('open'); assert.equal(service.getState().status, 'connecting');
    conn.emit('data', { version: 1, type: 'WELCOME', roomId: '123456', role: 'jury', peers: [] }); assert.equal(service.getState().status, 'connected');
    assert.equal(service.send('SYNC_SESSION', fresh()), false); assert.equal(service.send('CAST_VOTE', { winner: 'plaintiff' }), false);
    const session = { ...fresh(), status: 'awaiting-ruling', pendingTurns: [] };
    conn.emit('data', { version: 1, type: 'SYNC_SESSION', roomId: '123456', id: 'snapshot', payload: session, senderRole: 'host', timestamp: Date.now() });
    assert.equal(service.send('CAST_VOTE', { winner: 'plaintiff' }), true);
    assert.equal(service.send('CAST_VOTE', { winner: 'bad' }), false);
    conn.close(); assert.equal(service.getState().status, 'disconnected');
  } finally { service.disconnect(); }
});

test('tied voting can restart; stale ballots cannot enter the new round and new guests receive anonymous current counts', () => {
  let hostPeer, guestPeer;
  const host = new MultiplayerService(id => hostPeer = new MockPeer(id));
  const guest = new MultiplayerService(id => guestPeer = new MockPeer(id));
  const hostEvents = [], guestEvents = [];
  const unsubscribeHost = host.subscribe(msg => hostEvents.push(msg));
  const unsubscribeGuest = guest.subscribe(msg => guestEvents.push(msg));
  try {
    host.init('123456', true); hostPeer.emit('open'); guest.init('123456', false); guestPeer.emit('open');
    const hostSide = new Connection('guest-one'), guestSide = guestPeer.outgoing;
    hostPeer.emit('connection', hostSide); hostSide.emit('open'); guestSide.emit('open');
    const session = { ...fresh(), status: 'awaiting-ruling', pendingTurns: [] };
    host.send('SYNC_SESSION', session);
    for (const message of hostSide.sent) guestSide.emit('data', message);
    assert.equal(guest.restartVote(), false);
    guest.send('CAST_VOTE', { winner: 'plaintiff' });
    const roundZero = guestSide.sent.at(-1); assert.equal(roundZero.payload.round, 0); assert.equal(roundZero.payload.sessionId, session.id);
    hostSide.emit('data', roundZero); hostSide.emit('data', { ...roundZero, id: 'duplicate-same-round' });
    assert.deepEqual(host.getVoteState(), { round: 0, votes: [{ peerId: 'guest-one', winner: 'plaintiff' }], counts: { plaintiff: 1, defendant: 0 } });
    assert.equal(hostEvents.filter(msg => msg.type === 'CAST_VOTE').length, 1);
    assert.equal(host.restartVote(), true); assert.equal(host.getVoteState().round, 1); assert.equal(host.getVotes().length, 0);
    const resetMessage = hostSide.sent.at(-1); assert.equal(resetMessage.type, 'VOTE_STATE'); assert.deepEqual(resetMessage.payload.counts, { plaintiff: 0, defendant: 0 });
    assert.equal(JSON.stringify(resetMessage.payload).includes('guest-one'), false);
    guestSide.emit('data', resetMessage); assert.equal(guest.getVoteState().round, 1);
    assert.ok(guestEvents.some(msg => msg.type === 'VOTE_STATE' && msg.payload.round === 1));
    hostSide.emit('data', { ...roundZero, id: 'delayed-old-round' }); assert.equal(host.getVotes().length, 0);
    guest.send('CAST_VOTE', { winner: 'defendant' }); const roundOne = guestSide.sent.at(-1); assert.equal(roundOne.payload.round, 1);
    hostSide.emit('data', roundOne); hostSide.emit('data', { ...roundOne, id: 'same-round-new-message' }); assert.deepEqual(host.getVoteState().counts, { plaintiff: 0, defendant: 1 });
    assert.equal(host.getVotes().length, 1);
    const late = new Connection('late-guest'); hostPeer.emit('connection', late); late.emit('open');
    assert.equal(late.sent.at(-1).type, 'VOTE_STATE'); assert.equal(late.sent.at(-1).payload.round, 1); assert.equal(late.sent.at(-1).payload.votedCount, 1);
    assert.ok(late.sent.findIndex(msg => msg.type === 'WELCOME') < late.sent.findIndex(msg => msg.type === 'SYNC_SESSION'));
    host.send('SYNC_SESSION', { ...session, juryVote: 'defendant', status: 'active' }); assert.equal(host.restartVote(), false);
    host.send('SYNC_SESSION', { ...session, id: 'fresh-session' }); assert.deepEqual(host.getVoteState(), { round: 0, votes: [], counts: { plaintiff: 0, defendant: 0 } });
    hostSide.emit('data', { ...roundZero, id: 'old-session-same-round' }); assert.equal(host.getVotes().length, 0);
  } finally { unsubscribeHost(); unsubscribeGuest(); host.disconnect(); guest.disconnect(); assert.equal(hostPeer.destroyed, true); assert.equal(guestPeer.destroyed, true); }
});
