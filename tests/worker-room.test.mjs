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
    const storage = {
      map,
      get: key => Promise.resolve(map.get(key)),
      put: (key, value) => { map.set(key, structuredClone(value)); return Promise.resolve(); },
      delete: key => { map.delete(key); return Promise.resolve(); },
      deleteAll: () => { map.clear(); alarm = null; return Promise.resolve(); },
      transaction: callback => callback(storage),
      getAlarm: () => Promise.resolve(alarm),
      setAlarm: value => { alarm = value; return Promise.resolve(); },
      deleteAlarm: () => { alarm = null; return Promise.resolve(); },
    };
    return storage;
  };
  const makeD1 = () => {
    const writes = [];
    const statement = (sql) => ({ bind: (...bindings) => ({ run: () => { writes.push({ sql, bindings }); return Promise.resolve({}); } }), run: () => { writes.push({ sql, bindings: [] }); return Promise.resolve({}); } });
    return { writes, prepare: statement, batch: items => Promise.all(items.map(item => item.run())) };
  };
  const makeRoom = (bindings = {}) => {
    const env = { DB: makeD1(), ...bindings };
    const storage = makeStorage();
    return { room: new CourtRoom({ storage }, env), env, storage };
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
  const sit = async (room, id, visitorId) => ok(await call(room, `${id}/jury-seat`, { method: 'POST', body: { visitorId } }));

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

  test('configured management host gates the page, isolates its API and uses its own origin', async () => {
    const env = {
      COURT_ADMIN_HOST: 'admin.court.test',
      COURT_PUBLIC_BASE_URL: 'https://court.test',
      COURT_ACCESS_TEAM: 'court',
      COURT_ACCESS_AUD: 'audience',
      COURT_ADMIN_DEV_TOKEN: 'local-test-token',
      ASSETS: { fetch: () => new Response('admin shell') },
    };
    const fetchOn = (host, path, init) => worker.fetch(new Request(`https://${host}${path}`, init), env);
    const entry = await fetchOn('admin.court.test', '/');
    assert.equal(entry.headers.get('location'), 'https://admin.court.test/admin');
    const oldEntry = await fetchOn('court.test', '/admin');
    assert.equal(oldEntry.headers.get('location'), 'https://admin.court.test/admin');
    assert.equal((await fetchOn('court.test', '/api/admin/overview')).status, 404);
    assert.equal((await fetchOn('admin.court.test', '/api/games')).status, 404);
    assert.equal((await fetchOn('admin.court.test', '/admin')).status, 401);
    const page = await fetchOn('admin.court.test', '/admin', { headers: { 'x-court-admin-token': 'local-test-token' } });
    assert.equal(await page.text(), 'admin shell');
    assert.equal(page.headers.get('cache-control'), 'private, no-store');
    const write = origin => ({ method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
    assert.equal((await fetchOn('admin.court.test', '/api/admin/games/a/resync', write('https://court.test'))).status, 403);
    assert.equal((await fetchOn('admin.court.test', '/api/admin/games/a/resync', write('https://admin.court.test'))).status, 401);
  });

  test('practice game: claim, ten rounds, asynchronous jury vote triggers a practice verdict', async () => {
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
    assert.equal(state.game.status, 'waiting-jurors');
    assert.equal(state.canSubmit, false);
    assert.equal(state.game.session.turns.length, 0);
    const visitorA = createHash('sha256').update('visitor-a').digest('hex');
    await sit(room, '/room123456', visitorA);
    state = await ok(await call(room, '/room123456/seat', { headers: bearer }));
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
    assert.deepEqual(sealed.verdict, {flow: 'post-jury', prepared: false});
    assert.equal(sealed.session.ruling, undefined);

    // The practice judge produces round 11 once a human casts the deciding ballot.
    const visitorB = createHash('sha256').update('visitor-b').digest('hex');
    await fails(await call(room, '/room123456/jury-seat', { method: 'POST', body: { visitorId: visitorB } }), 'JURY_SEATING_CLOSED');
    await fails(await call(room, '/room123456/votes', { method: 'POST', body: { visitorId: visitorB, winner: 'plaintiff', clientActionId: 'vote-b' } }), 'JURY_SEAT_REQUIRED');
    await fails(await call(room, '/room123456/reactions', { method: 'POST', body: { visitorId: visitorA, kind: 'message', text: '好', clientActionId: 'sealed-reaction' } }), 'REACTION_CLOSED');
    const voted = await ok(await call(room, '/room123456/votes', { method: 'POST', body: { visitorId: visitorA, winner: 'plaintiff', clientActionId: 'vote-a' } }));
    assert.equal(voted.status, 'completed');
    assert.equal(voted.session.ruling.winner, 'plaintiff');
    await fails(await call(room, '/room123456/votes', { method: 'POST', body: { visitorId: visitorA, winner: 'defendant', clientActionId: 'vote-a2' } }), 'ALREADY_VOTED');
    await fails(await call(room, '/room123456/votes', { method: 'POST', body: { visitorId: visitorB, winner: 'plaintiff', clientActionId: 'vote-b' } }), 'VOTE_CLOSED');

    // Lobby projection reached D1 with a card, not the full session.
    assert.ok(env.DB.writes.some(write => write.sql.includes('INSERT INTO games')));
    const cardWrite = env.DB.writes.filter(write => write.sql.includes('INSERT INTO games')).at(-1);
    const card = JSON.parse(cardWrite.bindings[8]);
    assert.equal(card.id, 'room123456');
    assert.equal(card.turnCount, 11, 'ten debate rounds plus the published verdict turn');
    assert.ok(!JSON.stringify(card).includes('"turns"'), 'card projection must not carry turn text');
  });

  test('Worker jury membership and live reactions share a visitor identity and update public events independently of agent turns', async () => {
    const { room, env, storage } = makeRoom({ COURT_VISITOR_SECRET: 'test-visitor-secret' });
    let currentRoom = room;
    let now = 100_000;
    room.now = () => now;
    env.COURT_ROOM = { idFromName: id => id, get: () => ({ fetch: (url, init) => currentRoom.fetch(new Request(url, init)) }) };
    const id = '/roomjurors';
    const origin = 'https://court.test';
    const browser = (path, init) => worker.fetch(new Request(origin + path, init), env);
    const requestVisitor = async () => {
      const credentials = await browser('/api/visitor');
      const cookie = credentials.headers.get('set-cookie').split(';')[0];
      return { cookie, 'x-court-csrf': (await ok(credentials)).csrfToken };
    };
    const post = (endpoint, headers, body) => browser(`/api/games${id}/${endpoint}`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    const created = await ok(await call(room, '/create', { method: 'POST', body: { input: { caseData: PRESET_CASES[0], role: 'plaintiff' }, gameId: id.slice(1) } }));
    const joined = await ok(await call(room, `${id}/ticket/${ticketSecret(created.invitation.ticket)}/claim`, { method: 'POST', body: { agentName: '原告', clientActionId: 'join' } }));
    const bearer = { authorization: 'Bearer ' + joined.seatToken };
    const [visitor, other] = [await requestVisitor(), await requestVisitor()];
    const membership = async (headers = {}) => ok(await browser(`/api/games${id}/jury-seat`, { headers }));
    assert.deepEqual(await membership(), { seated: false });
    assert.deepEqual(await membership(visitor), { seated: false });
    const prop = { kind: 'prop', prop: 'tomato', clientActionId: 'throw' };
    await fails(await post('reactions', visitor, prop), 'JURY_SEAT_REQUIRED');
    await fails(await post('jury-seat', {}, {}), 'CSRF');
    await fails(await post('jury-seat', { ...visitor, origin: 'https://elsewhere.test' }, {}), 'ORIGIN');
    await fails(await post('jury-seat', { ...visitor, ...bearer }, {}), 'ROLE_SCOPE');
    const first = await ok(await post('jury-seat', visitor, { visitorId: 'spoofed-identity' }));
    assert.equal(first.status, 'running');
    assert.equal(first.session.turns.length, 1);
    assert.deepEqual(first.audience, { seated: 1, required: 1, reactions: [] });
    assert.equal((await ok(await post('jury-seat', visitor, {}))).revision, first.revision);
    assert.deepEqual(await membership(visitor), { seated: true });
    assert.deepEqual(await membership(other), { seated: false });
    const agent = await ok(await call(room, `${id}/seat`, { headers: bearer }));
    assert.equal(agent.canSubmit, true);
    const polling = call(room, `${id}/seat/wait?after=${agent.expectedRevision}&timeout=2`, { headers: bearer });
    let agentWoke = false;
    void polling.then(() => { agentWoke = true; });
    const abort = new AbortController();
    const events = await browser(`/api/games${id}/events?after=${first.revision}`, { signal: abort.signal });
    const reader = events.body.getReader();
    try {
      const thrown = await ok(await post('reactions', visitor, { ...prop, target: 'defendant' }));
      assert.deepEqual(thrown.audience.reactions, [{ id: thrown.revision, kind: 'prop', prop: 'tomato', target: 'judge' }]);
      const frame = new TextDecoder().decode((await reader.read()).value);
      const synced = JSON.parse(frame.split('\n').find(line => line.startsWith('data: ')).slice(6));
      assert.equal(synced.revision, thrown.revision);
      assert.deepEqual(synced.audience, thrown.audience);
      assert.equal(agentWoke, false);
      assert.equal((await ok(await call(room, `${id}/seat`, { headers: bearer }))).expectedRevision, agent.expectedRevision);
      assert.equal((await ok(await post('reactions', visitor, prop))).revision, thrown.revision);
      await fails(await post('reactions', visitor, { ...prop, prop: 'egg' }), 'ACTION_CONFLICT');
      await fails(await post('reactions', visitor, { ...prop, clientActionId: 'too-soon' }), 'REACTION_RATE_LIMIT');
      await fails(await post('reactions', visitor, { ...prop, prop: 'gavel' }), 'INVALID_REACTION');
      await fails(await post('reactions', visitor, { kind: 'message', text: '🤍'.repeat(61), clientActionId: 'too-long' }), 'INVALID_REACTION');
      assert.equal((await ok(await post('jury-seat', other, {}))).audience.seated, 2);
      assert.equal(agentWoke, false);
    } finally {
      abort.abort();
      await reader.cancel();
    }
    const opening = { turnId: agent.turnId, revision: agent.expectedRevision, clientActionId: 'opening' };
    await fails(await call(room, `${id}/seat/turns`, { method: 'POST', headers: bearer, body: {
      ...opening, payload: turn('🧑'.repeat(181)),
    } }), 'TURN_TOO_LONG');
    const mcp = await ok(await browser('/mcp', {
      method: 'POST',
      headers: { ...bearer, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
        name: 'court_speak', arguments: { ...opening, ...turn('🧑'.repeat(180), { shout: 'ORDER' }) },
      } }),
    }));
    assert.equal(mcp.result.isError, false);
    const spoken = mcp.result.structuredContent;
    assert.equal((await ok(await polling)).expectedRevision, spoken.expectedRevision);
    assert.equal(spoken.game.session.turns[1].text, '🧑'.repeat(180));
    assert.equal(spoken.game.session.turns[1].shout, 'ORDER');
    const message = { kind: 'message', text: '🤍'.repeat(60), clientActionId: 'cheer' };
    assert.equal((await ok(await post('reactions', other, message))).audience.reactions.at(-1).text, message.text);
    now += 1200;
    const next = await ok(await post('reactions', visitor, { ...prop, clientActionId: 'throw-again' }));
    assert.equal(next.audience.reactions.at(-1).target, spoken.game.session.turns.at(-1).speaker);
    for (let i = 0; i < 20; i++) {
      now += 1200;
      await ok(await post('reactions', visitor, { ...prop, clientActionId: `throw-${i}` }));
    }
    currentRoom = new CourtRoom({ storage }, env);
    currentRoom.now = () => now;
    assert.deepEqual(await membership(visitor), { seated: true });
    const recovered = await ok(await browser(`/api/games${id}`));
    const reactions = recovered.audience.reactions;
    assert.equal(reactions.length, 20);
    assert.ok(reactions.every((event, i) => i === 0 || event.id > reactions[i - 1].id));
    assert.equal((await ok(await post('reactions', other, message))).revision, recovered.revision);
    await fails(await post('reactions', visitor, { ...prop, clientActionId: 'retry-after-eviction' }), 'REACTION_RATE_LIMIT');
  });

  const sealPractice = async (room, id) => {
    const created = await ok(await call(room, '/create', { method: 'POST', body: { input: { caseData: PRESET_CASES[0], role: 'plaintiff' }, gameId: id.slice(1) } }));
    const joined = await ok(await call(room, `${id}/ticket/${ticketSecret(created.invitation.ticket)}/claim`, { method: 'POST', body: { agentName: '原告', clientActionId: 'join' } }));
    await sit(room, id, 'juror');
    const bearer = { authorization: 'Bearer ' + joined.seatToken };
    for (let index = 0; index < 3; index++) {
      const state = await ok(await call(room, `${id}/seat`, { headers: bearer }));
      assert.equal(state.canSubmit, true);
      await ok(await call(room, `${id}/seat/turns`, { method: 'POST', headers: bearer, body: { turnId: state.turnId, revision: state.expectedRevision, clientActionId: 'pt-' + index, payload: turn(`原告第${index + 1}次发言。`) } }));
    }
    return ok(await call(room, id));
  };

  test('jury deadline alarm settles an unvoted case as unresolved', async () => {
    const { room } = makeRoom();
    const id = '/room999999';
    const sealed = await sealPractice(room, id);
    assert.equal(sealed.status, 'waiting-jury');
    assert.equal(sealed.session.turns.length, 10);
    // Nobody votes; the alarm fires after the 24h deadline and the case becomes unresolved.
    const now = Date.now();
    room.now = () => now + 25 * 60 * 60 * 1000;
    await room.alarm();
    const unresolved = await ok(await call(room, '/room999999'));
    assert.equal(unresolved.status, 'unresolved');
  });

  test('a previously sealed room still publishes its stored matching conditional verdict after eviction', async () => {
    const { room, env, storage } = makeRoom();
    const id = '/legacyroom';
    const sealed = await sealPractice(room, id);
    const stored = storage.map.get('game');
    delete stored.postJury;
    delete stored.jurors;
    delete stored.actionRevision;
    stored.seats.judge = { role: 'judge', source: 'external', status: 'claimed', agentName: '旧房间法官' };
    const verdict = winner => {
      const evidenceIds = sealed.session.evidences.map(item => item.id);
      return turn(`旧案的私存判词-${winner}`, { speaker: 'judge', evidenceIds, ruling: { winner, result: '依票决裁定。', penalty: [], quote: '本庭遵从陪审意见。', reasons: ['根据原有的案卷。'], evidenceIds, consideredInterventionIds: [] } });
    };
    stored.prepared = { plaintiff: verdict('plaintiff'), defendant: verdict('defendant'), source: 'external', preparedAt: stored.updatedAt };
    const restored = new CourtRoom({ storage }, env);
    const waiting = await ok(await call(restored, id));
    assert.equal(waiting.verdict.flow, undefined);
    assert.equal(waiting.verdict.prepared, true);
    assert.ok(!JSON.stringify(waiting).includes('旧案的私存判词'));
    const published = await ok(await call(restored, `${id}/votes`, { method: 'POST', body: { visitorId: 'legacy-visitor', clientActionId: 'legacy-ballot', winner: 'defendant' } }));
    assert.equal(published.status, 'completed');
    assert.equal(published.session.turns.at(-1).text, '旧案的私存判词-defendant');
    assert.ok(!JSON.stringify(published).includes('旧案的私存判词-plaintiff'));
  });

  test('unopened Worker rooms use a stable built-in judge and invalidate legacy judge invitations', async () => {
    const { room, env, storage } = makeRoom({ OPENROUTER_API_KEY: 'test-key' });
    const id = '/oldemptycourt';
    const create = role => call(room, '/create', { method: 'POST', body: { input: { caseData: PRESET_CASES[0], role, mode: 'multiplayer' }, gameId: id.slice(1) } });
    await fails(await create('judge'), 'SEAT_UNAVAILABLE');
    assert.equal(storage.map.has('game'), false);
    await ok(await create('plaintiff'));
    const old = storage.map.get('game');
    const judgeToken = id.slice(1) + '.legacy-seat';
    const ticket = id.slice(1) + '.legacy-invite';
    old.seats.judge = { role: 'judge', source: 'external', status: 'reserved', ticket, tokenHash: sha256(judgeToken) };
    const restored = new CourtRoom({ storage }, env);
    const [first, second] = await Promise.all([call(restored, id).then(ok), call(restored, id).then(ok)]);
    assert.deepEqual(first.seats.judge, second.seats.judge);
    assert.equal(first.seats.judge.source, 'builtin');
    assert.match(first.session.caseData.agents.judge.id, /^cast:(everyday|city|night|gavel|chill):judge$/);
    assert.equal(storage.map.get('game').seats.judge.ticket, undefined);
    await fails(await call(restored, id + '/invite', { method: 'POST', body: { role: 'judge' } }), 'SEAT_UNAVAILABLE');
    await fails(await call(restored, id + '/ticket/legacy-invite/claim', { method: 'POST', body: { agentName: '外部法官', clientActionId: 'old-claim' } }), 'NOT_FOUND');
    await fails(await call(restored, id + '/seat', { headers: { authorization: 'Bearer ' + judgeToken } }), 'AUTH');
    const restarted = await ok(await call(new CourtRoom({ storage }, env), id));
    assert.equal(restarted.session.caseData.agents.judge.id, first.session.caseData.agents.judge.id);
  });

  test('built-in judge waits for both external parties and writes round 11 after the actual tally', async t => {
    const { room, env, storage } = makeRoom({ OPENROUTER_API_KEY: 'test-key' });
    const id = '/builtinroom';
    let now = 100_000;
    room.now = () => now;
    const path = `${id}/seat/turns`;
    const input = { caseData: PRESET_CASES[0], role: 'plaintiff', mode: 'multiplayer' };
    const caps = await ok(await worker.fetch(new Request('https://court/api/capabilities'), env));
    assert.deepEqual(caps, { builtinJudge: true });
    assert.deepEqual(await ok(await worker.fetch(new Request('https://court/api/capabilities'), {})), { builtinJudge: false });
    const unavailable = makeRoom().room;
    await fails(await call(unavailable, '/create', { method: 'POST', body: { input, gameId: id.slice(1) } }), 'BUILTIN_JUDGE_UNAVAILABLE');
    const created = await ok(await call(room, '/create', { method: 'POST', body: { input, gameId: id.slice(1) } }));
    const judge = created.game.session.caseData.agents.judge;
    assert.match(judge.id, /^cast:(everyday|city|night|gavel|chill):judge$/);
    assert.deepEqual(created.game.seats.judge, { role: 'judge', source: 'builtin', status: 'builtin', agentName: judge.name });
    await fails(await call(room, `${id}/invite`, { method: 'POST', body: { role: 'judge' } }), 'SEAT_UNAVAILABLE');
    const defendant = await ok(await call(room, `${id}/invite`, { method: 'POST', body: { role: 'defendant' } }));
    const headers = {};
    for (const invite of [created.invitation, defendant]) {
      const joined = await ok(await call(room, `${id}/ticket/${ticketSecret(invite.ticket)}/claim`, { method: 'POST', body: { agentName: invite.role, clientActionId: 'join-' + invite.role } }));
      headers[invite.role] = { authorization: 'Bearer ' + joined.seatToken };
      if (invite.role === 'plaintiff') assert.equal(await storage.getAlarm(), null);
    }
    assert.equal((await ok(await call(room, id))).status, 'waiting-jurors');
    assert.equal(await storage.getAlarm(), null);
    for (let i = 0; i < 3; i++) {
      const game = await sit(room, id, `visitor-${i}`);
      assert.equal(game.status, i < 2 ? 'waiting-jurors' : 'running');
      assert.equal(await storage.getAlarm(), i < 2 ? null : now);
    }
    assert.equal(await storage.getAlarm(), now);
    const requests = [];
    const routing = [];
    let failedVerdict = false;
    const log = t.mock.method(console, 'error', () => {});
    const model = t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.match(String(url), /^https:\/\/openrouter\.ai\/api\/v1\/chat\/completions$/);
      const request = JSON.parse(options.body);
      assert.ok(request.models.every(model => model.endsWith(':free')));
      assert.deepEqual(request.provider.max_price, { prompt: 0, completion: 0, request: 0 });
      routing.push(request.models);
      const facts = JSON.parse(request.messages.find(message => message.role === 'user').content);
      requests.push(facts);
      const evidenceIds = facts.evidence.map(item => item.id);
      const payload = turn('本轮公开法官台词。', { speaker: 'judge', evidenceIds });
      if (facts.currentPhase === 'verdict') {
        const { outcome, plaintiffVotes, defendantVotes } = facts.jury;
        payload.text = `陪审团以 ${plaintiffVotes} 比 ${defendantVotes} 作出裁决。`;
        payload.ruling = { winner: failedVerdict ? outcome : 'plaintiff', result: payload.text, penalty: [], quote: '案情已查明。', reasons: ['公开案卷的证物支持以上裁决。'], evidenceIds, consideredInterventionIds: [] };
        failedVerdict = true;
      }
      return Response.json({ model: request.models[0], usage: { cost: 0 }, choices: [{ message: { content: JSON.stringify(payload) } }] });
    });
    for (let i = 0; i < 10; i++) {
      const game = await ok(await call(room, id));
      assert.equal(game.status, 'running');
      if (game.currentRole === 'judge') await room.alarm();
      else await ok(await call(room, path, { method: 'POST', headers: headers[game.currentRole], body: { turnId: game.currentTurnId, revision: game.revision, clientActionId: game.currentTurnId, payload: turn('外部当事人的案卷陈述。') } }));
    }
    const sealed = await ok(await call(room, id));
    assert.equal(sealed.status, 'waiting-jury');
    assert.equal(sealed.session.turns.length, 10);
    assert.equal(requests.length, 4);
    assert.ok(requests.every(facts => !facts.jury));
    assert.equal(await storage.getAlarm(), sealed.jury.deadlineAt);
    await room.alarm();
    assert.equal(requests.length, 4);
    for (const [i, winner] of ['defendant', 'plaintiff', 'defendant'].entries()) {
      await ok(await call(room, `${id}/votes`, { method: 'POST', body: { visitorId: `visitor-${i}`, clientActionId: `ballot-${i}`, winner } }));
    }
    const ready = await ok(await call(room, id));
    assert.equal(ready.status, 'waiting-verdict');
    assert.equal(ready.session.ruling, undefined);
    assert.equal(ready.currentTurnId, `${ready.session.id}-turn-11`);
    assert.equal(await storage.getAlarm(), now);
    await room.alarm();
    assert.equal(log.mock.callCount(), 1);
    assert.equal((await ok(await call(room, id))).revision, ready.revision);
    await room.alarm();
    assert.equal(model.mock.callCount(), 5);
    now = await storage.getAlarm();
    const restored = new CourtRoom({ storage }, env);
    restored.now = () => now;
    await restored.alarm();
    assert.notEqual(routing.at(-2)[0], routing.at(-1)[0], 'rejected verdict is retried with a different first model');
    assert.deepEqual([requests.at(-1).jury.plaintiffVotes, requests.at(-1).jury.defendantVotes], [1, 2]);
    const completed = await ok(await call(restored, id));
    assert.equal(completed.status, 'completed');
    assert.equal(completed.session.turns.at(-1).id, ready.currentTurnId);
    assert.equal(completed.session.ruling.winner, 'defendant');
    assert.equal(completed.verdict.source, 'builtin');
    assert.equal(await storage.getAlarm(), null);
    assert.equal(model.mock.callCount(), 6);
  });

  const partyCase = (options = {}) => ({
    caseData: PRESET_CASES[0], role: 'plaintiff',
    party: { visibility: 'public', plaintiff: 'builtin', defendant: 'builtin', demand: '把最后一块还给我。', ...options },
  });

  function mockPartyModel(t, rejectFirstSeal = false) {
    const requests = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.match(String(url), /^https:\/\/openrouter\.ai\/api\/v1\/chat\/completions$/);
      const request = JSON.parse(options.body);
      assert.ok(request.models.every(model => model.endsWith(':free')));
      assert.deepEqual(request.provider.max_price, { prompt: 0, completion: 0, request: 0 });
      const facts = JSON.parse(request.messages.find(message => message.role === 'user').content);
      requests.push(facts);
      assert.equal(facts.juryVote, null);
      const evidenceIds = facts.evidence.map(item => item.id);
      const speech = { text: `第 ${facts.transcript.length + 1} 轮公开台词。`, emotion: 'normal' };
      const branch = (side, invalid = false) => ({
        text: `${side}专用第十一轮。`, reason: invalid ? '' : '这一句说到了点上。',
        lastLine: `${side}说完了。`, evidenceId: evidenceIds[0],
      });
      const payload = facts.currentPhase === 'deliberation' ? {
        seal: speech.text, plaintiff: branch('原告'), defendant: branch('被告', rejectFirstSeal),
      } : speech;
      if (facts.currentPhase === 'deliberation') rejectFirstSeal = false;
      return Response.json({ model: request.models[0], usage: { cost: 0 }, choices: [{ message: { content: JSON.stringify(payload) } }] });
    });
    return requests;
  }

  test('invite-only solo seals both branches atomically and publishes only the chosen branch', async t => {
    const { room, env, storage } = makeRoom({ OPENROUTER_API_KEY: 'test-key', COURT_VISITOR_SECRET: 'test-visitor-secret' });
    env.COURT_ROOM = { idFromName: id => id, get: () => ({ fetch: (url, init) => room.fetch(new Request(url, init)) }) };
    const origin = 'https://court.test';
    const browser = (path, init) => worker.fetch(new Request(origin + path, init), env);
    const visitor = async () => {
      const response = await browser('/api/visitor');
      return { cookie: response.headers.get('set-cookie').split(';')[0], 'x-court-csrf': (await ok(response)).csrfToken };
    };
    const host = await visitor();
    const spectator = await visitor();
    const post = (path, body, headers) => browser(path, {
      method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    const input = { ...partyCase({ visibility: 'invite', defense: '我把盘子洗了。' }), clientActionId: 'party-private' };
    await fails(await post('/api/games', input, {}), 'CSRF');
    const creations = await Promise.all([post('/api/games', input, host), post('/api/games', input, host)]);
    const [created, replay] = await Promise.all(creations.map(ok));
    assert.equal(created.game.id, replay.game.id);
    assert.equal(created.roomKey, replay.roomKey);
    assert.equal(created.ownerToken, replay.ownerToken);
    assert.equal(created.invitation, undefined);
    assert.equal(created.defenseInvitation, undefined);
    assert.equal(storage.map.get('create').result.roomKey, undefined);
    assert.deepEqual(created.game.audience, { seated: 1, required: 1, reactions: [] });
    assert.match(created.game.session.caseData.agents.judge.id, /^cast:(everyday|city|night|gavel|chill):judge$/);
    await fails(await post('/api/games', input, spectator), 'ACTION_CONFLICT');
    const id = `/api/games/${created.game.id}`;
    const access = { 'x-court-room-key': created.roomKey };
    for (const suffix of ['', '/jury-seat', '/events', '/wait?timeout=0']) await fails(await browser(id + suffix), 'NOT_FOUND');
    await fails(await browser(id, { headers: { 'x-court-room-key': '0'.repeat(64) } }), 'NOT_FOUND');
    await fails(await post(id + '/jury-seat', {}, spectator), 'NOT_FOUND');
    await fails(await post(id + '/jury-seat', {}, { ...spectator, ...access }), 'JURY_SEAT_REQUIRED');
    const ballot = { winner: 'plaintiff', clientActionId: 'solo-vote' };
    await fails(await post(id + '/votes', ballot, { ...host, ...access }), 'VOTE_CLOSED');

    const abort = new AbortController();
    const stream = await browser(id + '/events?key=' + created.roomKey, { signal: abort.signal });
    assert.equal(stream.status, 200);
    const reader = stream.body.getReader();
    try { assert.match(new TextDecoder().decode((await reader.read()).value), /event: game/); }
    finally { abort.abort(); await reader.cancel(); }

    const log = t.mock.method(console, 'error', () => {});
    const requests = mockPartyModel(t, true);
    for (let i = 0; i < 10; i++) await room.alarm();
    const snapshot = () => browser(id, { headers: access }).then(ok);
    const failedSeal = await snapshot();
    assert.equal(log.mock.callCount(), 1);
    assert.equal(failedSeal.session.turns.length, 9);
    assert.equal(failedSeal.verdict.prepared, false);
    await fails(await post(id + '/votes', ballot, { ...host, ...access }), 'VOTE_CLOSED');
    const retryAt = await storage.getAlarm();
    room.now = () => retryAt;
    await room.alarm();
    const sealed = await snapshot();
    assert.equal(sealed.status, 'waiting-jury');
    assert.equal(sealed.session.turns.length, 10);
    assert.equal(sealed.verdict.prepared, true);
    assert.doesNotMatch(JSON.stringify(sealed), /原告专用第十一轮|被告专用第十一轮/);
    assert.deepEqual(requests.map(facts => facts.position), requests.map(facts =>
      facts.currentSpeaker === 'plaintiff' ? input.party.demand : facts.currentSpeaker === 'defendant' ? input.party.defense : undefined));
    await fails(await post(id + '/votes', ballot, host), 'NOT_FOUND');
    await fails(await post(id + '/votes', ballot, { ...spectator, ...access }), 'JURY_SEAT_REQUIRED');
    const completed = await ok(await post(id + '/votes', ballot, { ...host, ...access }));
    assert.equal(completed.session.turns.length, 11);
    assert.equal(completed.session.ruling.winner, 'plaintiff');
    assert.match(completed.session.turns.at(-1).text, /原告 1 票，被告 0 票。原告胜。原告专用第十一轮/);
    assert.doesNotMatch(JSON.stringify(completed), /被告专用第十一轮|本庭支持被告/);
    assert.deepEqual(await ok(await browser(id + '/jury-seat', { headers: { ...host, ...access } })), { seated: true, participant: true, vote: 'plaintiff' });
    assert.equal(await storage.getAlarm(), null);
    await room.alarm();
    assert.equal(requests.length, 11, 'ten rounds and one seal retry, with no model request after voting');
    assert.ok(!env.DB.writes.some(write => write.sql.includes('INSERT INTO games')), 'private room never projects to D1');
  });

  test('duo takes one friend reply and counts two simultaneous ballots into a reloadable draw', async t => {
    const { room, env, storage } = makeRoom({ OPENROUTER_API_KEY: 'test-key' });
    const id = '/partyduoroom';
    const created = await ok(await call(room, '/create', { method: 'POST', body: { gameId: id.slice(1), visitorId: 'host', input: partyCase({ defendant: 'friend' }) } }));
    assert.equal(created.game.status, 'waiting-jurors');
    assert.equal(await storage.getAlarm(), null);
    const ticket = created.defenseInvitation.ticket;
    const respond = (visitorId, stance) => call(room, id + '/respond', { method: 'POST', body: { visitorId, ticket, stance } });
    await fails(await respond('host', '原告也想坐答辩席。'), 'FRIEND_REQUIRED');
    const candidates = ['friend-one', 'friend-two'];
    const replies = await Promise.all(candidates.map(visitorId => respond(visitorId, `我是${visitorId}。`)));
    const accepted = replies.findIndex(reply => reply.ok);
    assert.notEqual(accepted, -1);
    await fails(replies[1 - accepted], 'DEFENSE_SEAT_TAKEN');
    const response = await ok(replies[accepted]);
    const friend = candidates[accepted];
    assert.equal(response.status, 'running');
    assert.equal(response.audience.seated, 2);
    assert.equal(response.seats.defendant.source, 'builtin');
    const requests = mockPartyModel(t);
    for (let i = 0; i < 10; i++) await room.alarm();
    assert.deepEqual(requests.filter(facts => facts.currentSpeaker === 'defendant').map(facts => facts.position), Array(3).fill(`我是${friend}。`));
    const vote = (visitorId, winner) => call(room, id + '/votes', { method: 'POST', body: { visitorId, winner, clientActionId: 'duo-' + visitorId } });
    await fails(await vote('spectator', 'plaintiff'), 'JURY_SEAT_REQUIRED');
    const ballots = await Promise.all([vote('host', 'plaintiff'), vote(friend, 'defendant')]);
    await Promise.all(ballots.map(ok));
    const completed = await ok(await call(new CourtRoom({ storage }, env), id));
    assert.equal(completed.status, 'completed');
    assert.equal(completed.jury.outcome, 'draw');
    assert.equal(completed.session.ruling.winner, 'draw');
    assert.equal(completed.session.turns.length, 11);
    assert.match(completed.session.turns.at(-1).text, /原告 1 票，被告 1 票/);
    assert.equal(completed.session.turns.at(-1).speakerName, created.game.seats.judge.agentName);
    assert.doesNotMatch(JSON.stringify(completed), /原告专用第十一轮|被告专用第十一轮/);
    assert.equal(requests.length, 10);
    const card = JSON.parse(env.DB.writes.filter(write => write.sql.includes('INSERT INTO games')).at(-1).bindings[8]);
    assert.equal(card.ruling.winner, 'draw');
  });

  test('public spectators opt into jury without filling the defendant seat and can decide the vote', async t => {
    const { room, storage } = makeRoom({ OPENROUTER_API_KEY: 'test-key' });
    const id = '/publicjury';
    const created = await ok(await call(room, '/create', { method: 'POST', body: { gameId: id.slice(1), visitorId: 'host', input: partyCase({ defendant: 'friend' }) } }));
    const membership = async visitorId => ok(await call(room, id + '/jury-seat', { headers: { 'x-court-visitor-id': visitorId } }));
    const post = (route, body) => call(room, id + route, { method: 'POST', body });
    const reading = await ok(await call(room, id));
    assert.equal(reading.audience.canJoin, true);
    assert.deepEqual(await membership('viewer'), { seated: false });
    const seated = await sit(room, id, 'friend');
    assert.equal(seated.status, 'waiting-jurors');
    assert.equal(await storage.getAlarm(), null);
    assert.equal(seated.audience.seated, 1);
    assert.equal(seated.audience.publicJurors, 1);
    assert.equal((await sit(room, id, 'friend')).revision, seated.revision);
    assert.deepEqual(await membership('friend'), { seated: true });
    const answered = await ok(await post('/respond', { visitorId: 'friend', ticket: created.defenseInvitation.ticket, stance: '盘子已经洗了。' }));
    assert.equal(answered.audience.seated, 2);
    assert.equal(answered.audience.publicJurors, 0);
    assert.deepEqual(await membership('friend'), { seated: true, participant: true });
    const requests = mockPartyModel(t);
    for (let i = 0; i < 10; i++) await room.alarm();
    const juror = await sit(room, id, 'juror');
    assert.equal(juror.status, 'waiting-jury');
    assert.equal(juror.jury.minimumVotes, 3);
    const vote = (visitorId, winner) => post('/votes', { visitorId, winner, clientActionId: 'vote-' + visitorId });
    await fails(await vote('viewer', 'plaintiff'), 'JURY_SEAT_REQUIRED');
    await ok(await vote('host', 'plaintiff'));
    assert.equal((await ok(await vote('friend', 'defendant'))).status, 'waiting-jury');
    const completed = await ok(await vote('juror', 'defendant'));
    assert.equal(completed.session.ruling.winner, 'defendant');
    assert.equal(completed.audience.canJoin, false);
    assert.match(completed.session.turns.at(-1).text, /原告 1 票，被告 2 票。被告胜/);
    assert.equal(requests.length, 10);
    await fails(await post('/jury-seat', { visitorId: 'viewer' }), 'JURY_SEATING_CLOSED');
  });

  test('public voting closes at its deadline with the ballots already cast', async t => {
    const { room } = makeRoom({ OPENROUTER_API_KEY: 'test-key' });
    const id = '/publicdeadline';
    await ok(await call(room, '/create', { method: 'POST', body: { gameId: id.slice(1), visitorId: 'host', input: partyCase() } }));
    await sit(room, id, 'juror');
    mockPartyModel(t);
    for (let i = 0; i < 10; i++) await room.alarm();
    const waiting = await ok(await call(room, id + '/votes', { method: 'POST', body: { visitorId: 'juror', winner: 'plaintiff', clientActionId: 'deadline-vote' } }));
    assert.equal(waiting.status, 'waiting-jury');
    room.now = () => waiting.jury.deadlineAt;
    await room.alarm();
    const finished = await ok(await call(room, id));
    assert.equal(finished.status, 'completed');
    assert.equal(finished.session.ruling.winner, 'plaintiff');
    assert.equal(finished.jury.total, 1);
  });

  test('duo activates the friend Agent ticket only after the browser accepts the invite', async () => {
    const { room, storage } = makeRoom({ OPENROUTER_API_KEY: 'test-key' });
    const id = '/partyagentroom';
    const input = partyCase({ visibility: 'invite', defendant: 'friend', plaintiff: 'external' });
    const created = await ok(await call(room, '/create', { method: 'POST', body: { input, gameId: id.slice(1), visitorId: 'host' } }));
    const ticket = created.defenseInvitation.ticket;
    const agentPath = invite => `${id}/ticket/${ticketSecret(invite.ticket)}`;
    const claim = invite => call(room, agentPath(invite) + '/claim', { method: 'POST', body: { agentName: invite.role, clientActionId: 'join-' + invite.role } });
    await fails(await claim(created.defenseInvitation), 'NOT_FOUND');
    const context = await ok(await call(room, agentPath(created.invitation) + '/context'));
    assert.equal(context.position, input.party.demand);
    const plaintiff = await ok(await claim(created.invitation));
    assert.equal(plaintiff.state.position, input.party.demand);
    assert.equal(await storage.getAlarm(), null);
    const reserved = await ok(await call(room, id + '/respond', {
      method: 'POST', headers: { 'x-court-room-key': created.roomKey }, body: { visitorId: 'friend', ticket, useAgent: true },
    }));
    assert.equal(reserved.status, 'waiting-agents');
    assert.equal(reserved.audience.seated, 2);
    assert.equal(reserved.seats.defendant.status, 'reserved');
    assert.equal(await storage.getAlarm(), null);
    const defendant = await ok(await claim(created.defenseInvitation));
    assert.equal(defendant.state.position, undefined);
    assert.equal(defendant.state.game.status, 'running');
    assert.equal(defendant.state.game.currentRole, 'judge');
    assert.ok(await storage.getAlarm());
  });

  test('seat tokens cannot impersonate other roles or games', async () => {
    const { room } = makeRoom();
    const created = await ok(await call(room, '/create', { method: 'POST', body: { input: { caseData: PRESET_CASES[0], role: 'plaintiff', mode: 'practice', clientActionId: 'create-3' }, gameId: 'room777777' } }));
    const joined = await ok(await call(room, `/room777777/ticket/${ticketSecret(created.invitation.ticket)}/claim`, { method: 'POST', body: { agentName: 'A', clientActionId: 'j' } }));
    await sit(room, '/room777777', 'juror');
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
    const { room, env } = makeRoom({ OPENROUTER_API_KEY: 'test-key' });
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
