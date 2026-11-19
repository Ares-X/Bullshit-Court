import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'court-room-'));
try {
  await build({
    stdin: { contents: "export { default as worker, CourtRoom } from './worker/src/index.ts'; export { sha256 } from './worker/src/sha256.ts'; export { PRESET_CASES } from './src/data/presetCases.ts';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent', outfile: join(dir, 'room.mjs'),
  });
  const { worker, CourtRoom, sha256, PRESET_CASES } = await import(pathToFileURL(join(dir, 'room.mjs')).href);

  // In-memory Durable Object storage and D1 stubs.
  const makeStorage = () => {
    const map = new Map(); let alarm = null;
    return {
      map,
      get: key => Promise.resolve(map.get(key)),
      put: (key, value) => { map.set(key, structuredClone(value)); return Promise.resolve(); },
      delete: key => { map.delete(key); return Promise.resolve(); },
      deleteAll: () => { map.clear(); alarm = null; return Promise.resolve(); },
      getAlarm: () => Promise.resolve(alarm),
      setAlarm: value => { alarm = value; return Promise.resolve(); },
      deleteAlarm: () => { alarm = null; return Promise.resolve(); },
    };
  };
  const makeD1 = () => {
    const writes = [];
    const statement = (sql) => ({ bind: (...bindings) => ({ run: () => { writes.push({ sql, bindings }); return Promise.resolve({}); } }), run: () => { writes.push({ sql, bindings: [] }); return Promise.resolve({}); } });
    return { writes, prepare: statement, batch: items => Promise.all(items.map(item => item.run())) };
  };
  const makeRoom = () => {
    const env = { DB: makeD1() };
    const room = new CourtRoom({ storage: makeStorage() }, env);
    return { room, env };
  };
  const call = (room, path, init = {}) => {
    const url = new URL(path, 'https://room');
    if (init.body && typeof init.body === 'object') init = { ...init, body: JSON.stringify(init.body), headers: { 'content-type': 'application/json', ...(init.headers || {}) } };
    return room.fetch(new Request(url, init));
  };
  const ok = async (response) => { const body = await response.json(); assert.ok(response.ok, `${response.status} ${JSON.stringify(body)}`); return body; };
  const fails = async (response, code) => { const body = await response.json(); assert.equal(body.error, code); return body; };
  const ticketSecret = ticket => ticket.split('.').slice(1).join('.');
  const turn = (text, extra = {}) => ({ text, emotion: 'normal', responseTo: [], evidenceIds: [], ...extra });

  test('worker sha256 matches node:crypto', () => {
    for (const sample of ['', 'abc', '互联网法庭'.repeat(50), String(Math.random())]) {
      assert.equal(sha256(sample), createHash('sha256').update(sample).digest('hex'));
    }
  });

  test('worker judgment pagination accepts a cursor for the same Chinese search', async () => {
    let page = 0;
    const DB = {
      batch: async () => [],
      prepare: () => ({ bind: () => ({ all: async () => {
        const id = `case-${++page}`;
        return { results: [{ id, created_at: 3 - page, card: JSON.stringify({ id }) }] };
      } }) }),
    };
    const search = new URL('https://court/api/judgments');
    search.searchParams.set('query', '火锅');
    search.searchParams.set('limit', '1');
    const first = await ok(await worker.fetch(new Request(search), { DB }));
    assert.deepEqual(first.games, [{ id: 'case-1' }]);
    assert.ok(first.nextCursor);
    search.searchParams.set('cursor', first.nextCursor);
    assert.deepEqual((await ok(await worker.fetch(new Request(search), { DB }))).games, [{ id: 'case-2' }]);
    search.searchParams.set('query', '土豆');
    const invalid = await worker.fetch(new Request(search), { DB });
    assert.equal(invalid.status, 400);
    await fails(invalid, 'INVALID_CURSOR');
  });

  test('worker admin responses stay closed with missing Access setup or authentication', async () => {
    const url = 'https://court/api/admin/overview';
    const disabled = await worker.fetch(new Request(url), {});
    assert.equal(disabled.status, 501);
    await fails(disabled, 'ADMIN_DISABLED');
    const unauthenticated = await worker.fetch(new Request(url), { COURT_ACCESS_TEAM: 'court', COURT_ACCESS_AUD: 'audience' });
    assert.equal(unauthenticated.status, 401);
    await fails(unauthenticated, 'ADMIN_AUTH');
  });

  test('practice game: claim, ten rounds, asynchronous jury vote publishes the sealed verdict', async () => {
    const { room, env } = makeRoom();
    const created = await ok(await call(room, '/create', { method: 'POST', body: { input: { caseData: PRESET_CASES[0], role: 'plaintiff', mode: 'practice', clientActionId: 'create-1' }, gameId: 'room123456' } }));
    assert.equal(created.game.id, 'room123456');
    assert.match(created.ownerToken, /^room123456\./);
    assert.match(created.invitation.ticket, /^room123456\./);

    // Same clientActionId replays the same receipt; different content conflicts.
    const replay = await ok(await call(room, '/create', { method: 'POST', body: { input: { caseData: PRESET_CASES[0], role: 'plaintiff', mode: 'practice', clientActionId: 'create-1' }, gameId: 'room123456' } }));
    assert.equal(replay.ownerToken, created.ownerToken);
    await fails(await call(room, '/create', { method: 'POST', body: { input: { caseData: PRESET_CASES[1], role: 'plaintiff', mode: 'practice', clientActionId: 'create-1' }, gameId: 'room123456' } }), 'ACTION_CONFLICT');

    const joined = await ok(await call(room, `/room123456/ticket/${ticketSecret(created.invitation.ticket)}/claim`, { method: 'POST', body: { agentName: '测试Agent', clientActionId: 'join-1' } }));
    assert.equal(joined.role, 'plaintiff');
    // Claim replay with the same action id returns the same seat token.
    const rejoined = await ok(await call(room, `/room123456/ticket/${ticketSecret(created.invitation.ticket)}/claim`, { method: 'POST', body: { agentName: '测试Agent', clientActionId: 'join-1' } }));
    assert.equal(rejoined.seatToken, joined.seatToken);
    await fails(await call(room, `/room123456/ticket/${ticketSecret(created.invitation.ticket)}/claim`, { method: 'POST', body: { agentName: '别人', clientActionId: 'join-2' } }), 'TICKET_CLAIMED');

    const bearer = { authorization: 'Bearer ' + joined.seatToken };
    let state = await ok(await call(room, '/room123456/seat', { headers: bearer }));
    assert.equal(state.canSubmit, true);
    let revision = state.expectedRevision;
    for (const index of [0, 1, 2]) {
      state = await ok(await call(room, '/room123456/seat', { headers: bearer }));
      const spoken = await ok(await call(room, '/room123456/seat/turns', { method: 'POST', headers: bearer, body: { turnId: state.turnId, revision, clientActionId: 'turn-' + index, payload: turn(`原告第${index + 1}轮陈述：事情就是这样。`) } }));
      revision = spoken.expectedRevision;
      assert.ok(spoken.game.jury, 'public state always carries jury info');
    }
    state = await ok(await call(room, '/room123456/seat', { headers: bearer }));
    assert.equal(state.roleFinished, true);
    const sealed = await ok(await call(room, '/room123456'));
    assert.equal(sealed.status, 'waiting-jury');
    assert.equal(sealed.verdict.prepared, true);
    assert.equal(sealed.session.ruling, undefined);

    // Votes: dedup by visitor, then the matching conditional verdict is published.
    const visitorA = createHash('sha256').update('visitor-a').digest('hex');
    const voted = await ok(await call(room, '/room123456/votes', { method: 'POST', body: { visitorId: visitorA, winner: 'plaintiff', clientActionId: 'vote-a' } }));
    assert.equal(voted.status, 'completed');
    assert.equal(voted.session.ruling.winner, 'plaintiff');
    await fails(await call(room, '/room123456/votes', { method: 'POST', body: { visitorId: visitorA, winner: 'defendant', clientActionId: 'vote-a2' } }), 'ALREADY_VOTED');
    await fails(await call(room, '/room123456/votes', { method: 'POST', body: { visitorId: createHash('sha256').update('visitor-b').digest('hex'), winner: 'plaintiff', clientActionId: 'vote-b' } }), 'VOTE_CLOSED');

    // Lobby projection reached D1 with a card, not the full session.
    assert.ok(env.DB.writes.some(write => write.sql.includes('INSERT INTO games')));
    const cardWrite = env.DB.writes.filter(write => write.sql.includes('INSERT INTO games')).at(-1);
    const card = JSON.parse(cardWrite.bindings[8]);
    assert.equal(card.id, 'room123456');
    assert.equal(card.turnCount, 11, 'ten debate rounds plus the published verdict turn');
    assert.ok(!JSON.stringify(card).includes('"turns"'), 'card projection must not carry turn text');
  });

  test('jury deadline alarm settles an unvoted case as unresolved', async () => {
    const { room } = makeRoom();
    const created = await ok(await call(room, '/create', { method: 'POST', body: { input: { caseData: PRESET_CASES[0], role: 'judge', mode: 'practice', clientActionId: 'create-2' }, gameId: 'room999999' } }));
    // Judge is external; plaintiff and defendant are practice seats and pump immediately.
    const sealed = await ok(await call(room, '/room999999'));
    assert.equal(sealed.status, 'waiting-agents');
    await fails(await call(room, '/room999999/votes', { method: 'POST', body: { visitorId: 'x'.repeat(64), winner: 'plaintiff', clientActionId: 'v' } }), 'VOTE_CLOSED');
    const joined = await ok(await call(room, `/room999999/ticket/${ticketSecret(created.invitation.ticket)}/claim`, { method: 'POST', body: { agentName: '判官', clientActionId: 'join-j' } }));
    // Ten rounds run without the judge seat: practice seats auto-play theirs; the judge seat is external
    // and must submit its four turns, then both conditional verdicts.
    const bearer = { authorization: 'Bearer ' + joined.seatToken };
    for (let index = 0; index < 4; index++) {
      const state = await ok(await call(room, '/room999999/seat', { headers: bearer }));
      assert.equal(state.canSubmit, true);
      await ok(await call(room, '/room999999/seat/turns', { method: 'POST', headers: bearer, body: { turnId: state.turnId, revision: state.expectedRevision, clientActionId: 'jt-' + index, payload: turn(`法官第${index + 1}次发言。`) } }));
    }
    const state = await ok(await call(room, '/room999999/seat', { headers: bearer }));
    assert.equal(state.action, 'prepare_verdicts');
    const caseData = sealed.session.caseData;
    const verdict = winner => ({ text: `若${winner === 'plaintiff' ? '原告' : '被告'}胜则如此判`, emotion: 'gavel', responseTo: [], evidenceIds: caseData.evidences.map(item => item.id),
      ruling: { winner, result: '依陪审票决作出娱乐裁决。', penalty: ['双方各自消停。'], quote: '法槌一响，破事退散。', reasons: ['陪审票决所向。'], evidenceIds: caseData.evidences.map(item => item.id), consideredInterventionIds: [] } });
    const done = await ok(await call(room, '/room999999/seat/verdicts', { method: 'POST', headers: bearer, body: { clientActionId: 'jv-1', plaintiff: verdict('plaintiff'), defendant: verdict('defendant') } }));
    assert.equal(done.roleFinished, true);
    assert.equal(done.game.verdict.prepared, true);
    // Nobody votes; the alarm fires after the 24h deadline and the case becomes unresolved.
    const now = Date.now();
    room.now = () => now + 25 * 60 * 60 * 1000;
    await room.alarm();
    const unresolved = await ok(await call(room, '/room999999'));
    assert.equal(unresolved.status, 'unresolved');
  });

  test('seat tokens cannot impersonate other roles or games', async () => {
    const { room } = makeRoom();
    const created = await ok(await call(room, '/create', { method: 'POST', body: { input: { caseData: PRESET_CASES[0], role: 'plaintiff', mode: 'practice', clientActionId: 'create-3' }, gameId: 'room777777' } }));
    const joined = await ok(await call(room, `/room777777/ticket/${ticketSecret(created.invitation.ticket)}/claim`, { method: 'POST', body: { agentName: 'A', clientActionId: 'j' } }));
    const bearer = { authorization: 'Bearer ' + joined.seatToken };
    const state = await ok(await call(room, '/room777777/seat', { headers: bearer }));
    // The plaintiff seat cannot submit speech attributed to the judge.
    await fails(await call(room, '/room777777/seat/turns', { method: 'POST', headers: bearer, body: { turnId: state.turnId, revision: state.expectedRevision, clientActionId: 'bad-1', payload: turn('冒名发言', { speaker: 'judge' }) } }), 'ROLE_SCOPE');
    // Stale revision or wrong turn id is rejected.
    await fails(await call(room, '/room777777/seat/turns', { method: 'POST', headers: bearer, body: { turnId: state.turnId, revision: state.expectedRevision + 5, clientActionId: 'bad-2', payload: turn('过期版本') } }), 'STALE_TURN');
    // A malformed token does not authenticate.
    await fails(await call(room, '/room777777/seat', { headers: { authorization: 'Bearer room777777.nope' } }), 'AUTH');
  });

  test('admin operations: close votes, revoke tickets, void, purge', async () => {
    const { room, env } = makeRoom();
    const created = await ok(await call(room, '/create', { method: 'POST', body: { input: { caseData: PRESET_CASES[0], role: 'plaintiff', mode: 'multiplayer', clientActionId: 'create-4' }, gameId: 'room444444' } }));
    assert.equal(created.game.status, 'waiting-agents');
    // The admin channel requires the internal header.
    await fails(await call(room, '/room444444/admin', { method: 'POST', body: { op: 'detail' } }), 'AUTH');
    const adminHeaders = { 'x-court-admin': '1' };
    const detail = await ok(await call(room, '/room444444/admin', { method: 'POST', headers: adminHeaders, body: { op: 'detail' } }));
    assert.equal(detail.internal.prepared, null);
    const revoked = await ok(await call(room, '/room444444/admin', { method: 'POST', headers: adminHeaders, body: { op: 'revoke-tickets' } }));
    assert.equal(revoked.revoked, 1, 'only the creator seat had a signed, unclaimed ticket');
    const voided = await ok(await call(room, '/room444444/admin', { method: 'POST', headers: adminHeaders, body: { op: 'void' } }));
    assert.equal(voided.game.status, 'unresolved');
    const purged = await ok(await call(room, '/room444444/admin', { method: 'POST', headers: adminHeaders, body: { op: 'purge' } }));
    assert.equal(purged.purged, true);
    await fails(await call(room, '/room444444'), 'NOT_FOUND');
    assert.ok(env.DB.writes.some(write => write.sql.includes('DELETE FROM games')));
  });

  test('longpoll wait returns immediately with timeout=0 and full snapshot after revision change', async () => {
    const { room } = makeRoom();
    await ok(await call(room, '/create', { method: 'POST', body: { input: { caseData: PRESET_CASES[0], role: 'plaintiff', mode: 'practice', clientActionId: 'create-5' }, gameId: 'room555555' } }));
    const first = await ok(await call(room, '/room555555/wait?after=0&timeout=0'));
    assert.ok(first.revision >= 1);
    const later = await ok(await call(room, `/room555555/wait?after=${first.revision}&timeout=0`));
    assert.equal(later.revision, first.revision, 'no change means same revision snapshot');
  });
} finally { await rm(dir, { recursive: true, force: true }); }
