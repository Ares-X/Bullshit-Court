import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, request } from 'node:http';

const scratch = await mkdtemp(join(tmpdir(),'court-service-tests-'));
let api;
try {
  const outfile = join(scratch,'service.mjs');
  await build({stdin:{contents:"export * from './server/courtService'; export * from './server/courtHttp'; export { rehearsalTurn, castJuryVote, advanceCourtSession } from './src/utils/courtRuntime'; export {PRESET_CASES} from './src/data/presetCases';",resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent'});
  api = await import(pathToFileURL(outfile).href);
} finally { await rm(scratch,{recursive:true,force:true}); }
const {CourtService,createCourtHttpHandler,rehearsalTurn,castJuryVote,advanceCourtSession,PRESET_CASES} = api;
const roles = ['judge','plaintiff','defendant'];
const create = (service,role='plaintiff',mode='practice',extras={}) => service.create({caseData:PRESET_CASES[0],role,mode,...extras});
let action = 0;
const actionId = () => `unique-action-${++action}`;
function claim(service,invitation) { return service.join({ticket:invitation.ticket,agentName:`外部${invitation.role}`,clientActionId:actionId()}); }
function playTurn(service,seatToken) {
  const state = service.state(seatToken); assert.equal(state.action,'submit_turn');
  const payload = rehearsalTurn(state.game.session,state.game.session.pendingTurns[0]);
  const input = {turnId:state.turnId,revision:state.expectedRevision,clientActionId:actionId(),payload};
  return {input,state:service.speak(seatToken,input)};
}
function finishPractice(service,seatToken) { let safety=0; while(service.state(seatToken).action === 'submit_turn') { playTurn(service,seatToken); assert.ok(++safety<10); } }
function prepare(service,seatToken) {
  const state = service.state(seatToken); assert.equal(state.action,'prepare_verdicts');
  const make = winner => rehearsalTurn(castJuryVote(state.game.session,winner),{role:'judge',phase:'verdict',interventionIds:[]});
  const input={clientActionId:actionId(),plaintiff:make('plaintiff'),defendant:make('defendant')};
  return {input,state:service.prepareVerdicts(seatToken,input)};
}
function browserVote(service,id,winner,visitor=service.visitor()) { return service.vote(id,{...visitor,winner,clientActionId:actionId()}); }
function multiplayer(service) {
  const created=create(service,'judge','multiplayer');
  const tokens = {judge:claim(service,created.invitation).seatToken};
  for (const r of ['plaintiff','defendant']) tokens[r]=claim(service,service.invite(created.game.id,{role:r})).seatToken;
  while(service.get(created.game.id).currentRole) playTurn(service,tokens[service.get(created.game.id).currentRole]);
  return {...created,tokens};
}

test('practice waits for the claimed external seat; server drives bots without a host page',async()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});
  try {
    const c=create(s); assert.equal(c.game.status,'waiting-agents'); assert.equal(c.game.session.turns.length,0);
    assert.equal(s.list().length,0,'private-by-link practice does not enter recruitment lobby');
    const joined=claim(s,c.invitation); assert.equal(joined.state.game.session.turns.length,1);
    await assert.rejects(()=>advanceCourtSession(joined.state.game.session),/外部 Agent/);
    finishPractice(s,joined.seatToken); const state=s.state(joined.seatToken);
    assert.equal(state.roleFinished,true); assert.equal(state.game.session.turns.length,10);
    assert.equal(state.game.status,'waiting-jury'); assert.equal(state.game.verdict.prepared,true);
    assert.equal(state.game.session.juryVote,undefined); assert.equal(state.game.session.ruling,undefined);
    assert.equal(state.game.seats.judge.source,'practice'); assert.equal(state.game.seats.plaintiff.source,'external');
    const voted=browserVote(s,c.game.id,'defendant'); assert.equal(voted.status,'completed'); assert.equal(voted.session.ruling.winner,'defendant');
    assert.equal(voted.verdict.source,'practice'); assert.ok(voted.verdict.publishedAt);
  } finally {s.close();}
});

test('turn IDs, revisions, idempotence and token-derived role prevent stale or forged turns',()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});
  try {
    const c=create(s); const j=claim(s,c.invitation); const state=s.state(j.seatToken);
    const base={turnId:state.turnId,revision:state.expectedRevision,clientActionId:actionId(),payload:{text:'我在这里！',emotion:'angry',responseTo:[],evidenceIds:[]}};
    assert.throws(()=>s.speak(j.seatToken,{...base,payload:{...base.payload,speaker:'judge'}}),e=>e.code==='ROLE_SCOPE');
    assert.throws(()=>s.speak(j.seatToken,{...base,revision:0}),e=>e.code==='STALE_TURN');
    const first=s.speak(j.seatToken,base); assert.equal(first.game.session.turns[1].speaker,'plaintiff'); assert.equal(first.game.session.turns[1].emotion,'angry');
    const again=s.speak(j.seatToken,base); assert.equal(again.game.revision,first.game.revision); assert.equal(again.game.session.turns.length,first.game.session.turns.length);
    assert.ok(again.receipts.some(r=>r.clientActionId===base.clientActionId));
    assert.throws(()=>s.speak(j.seatToken,{...base,payload:{...base.payload,text:'偷偷换词'}}),e=>e.code==='ACTION_CONFLICT');
    assert.throws(()=>s.speak(j.seatToken,{...base,clientActionId:actionId()}),e=>e.code==='STALE_TURN');
    assert.throws(()=>s.state('not-a-token'),e=>e.status===401);
  } finally {s.close();}
});

test('claim and create are idempotent, with conflicts rejected and no public credential leak',()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});
  try {
    const createId=actionId(); const c=create(s,'plaintiff','practice',{clientActionId:createId});
    assert.equal(create(s,'plaintiff','practice',{clientActionId:createId}).game.id,c.game.id);
    assert.throws(()=>create(s,'judge','practice',{clientActionId:createId}),e=>e.code==='ACTION_CONFLICT');
    const input={ticket:c.invitation.ticket,agentName:'有名字',clientActionId:actionId()}; const joined=s.join(input);
    assert.equal(s.join(input).seatToken,joined.seatToken);
    assert.throws(()=>s.join({...input,clientActionId:actionId()}),e=>e.code==='TICKET_CLAIMED');
    const pub=JSON.stringify(s.get(c.game.id)); assert.ok(!pub.includes(joined.seatToken)); assert.ok(!pub.includes(c.ownerToken)); assert.ok(!pub.includes(c.invitation.ticket));
    const inspect=JSON.stringify(s.inspectInvitation(c.invitation.ticket)); assert.ok(!inspect.includes(joined.seatToken));
  } finally {s.close();}
});

test('multiplayer has exactly three external seats and each participant can finish asynchronously',()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});
  try {
    const c=multiplayer(s); assert.equal(s.list().length,1);
    for(const r of roles) assert.equal(s.get(c.game.id).seats[r].source,'external');
    assert.equal(s.state(c.tokens.plaintiff).roleFinished,true); assert.equal(s.state(c.tokens.defendant).roleFinished,true);
    assert.throws(()=>s.prepareVerdicts(c.tokens.plaintiff,{clientActionId:actionId(),plaintiff:{},defendant:{}}),e=>e.code==='ROLE_SCOPE');
    const p=prepare(s,c.tokens.judge); assert.equal(p.state.roleFinished,true); assert.equal(p.state.game.status,'waiting-jury');
    assert.equal(p.state.game.session.ruling,undefined);
    const publicJson=JSON.stringify(s.get(c.game.id)); assert.ok(!publicJson.includes('reasons')); assert.ok(!publicJson.includes('prepared.payload'));
    assert.equal(s.prepareVerdicts(c.tokens.judge,p.input).game.revision,p.state.game.revision);
    browserVote(s,c.game.id,'plaintiff'); browserVote(s,c.game.id,'defendant'); assert.equal(s.get(c.game.id).status,'waiting-jury');
    const result=browserVote(s,c.game.id,'plaintiff'); assert.equal(result.status,'completed'); assert.equal(result.session.ruling.winner,'plaintiff'); assert.equal(result.verdict.source,'external');
  } finally {s.close();}
});

test('conditions are validated on both jury forks; insufficient or tied jury expires unresolved',()=>{
  let now=10_000; const s=new CourtService({storePath:':memory:',now:()=>now,autoTick:false});
  try {
    const c=multiplayer(s); const state=s.state(c.tokens.judge);
    const good=rehearsalTurn(castJuryVote(state.game.session,'plaintiff'),{role:'judge',phase:'verdict',interventionIds:[]});
    assert.throws(()=>s.prepareVerdicts(c.tokens.judge,{clientActionId:actionId(),plaintiff:good,defendant:good}),/支持方/);
    assert.equal(s.get(c.game.id).verdict.prepared,false);
    prepare(s,c.tokens.judge); browserVote(s,c.game.id,'plaintiff'); browserVote(s,c.game.id,'defendant');
    now += 24*60*60*1000+1; s.tick(); const game=s.get(c.game.id);
    assert.equal(game.status,'unresolved'); assert.equal(game.jury.outcome,'unresolved'); assert.equal(game.session.ruling,undefined); assert.equal(game.session.juryVote,undefined);
    assert.throws(()=>browserVote(s,c.game.id,'plaintiff'),e=>e.code==='VOTE_CLOSED');
  } finally{s.close();}
});

test('visitor deduplication, CSRF, and jury state do not accept seat credentials',()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});
  try {
    const c=multiplayer(s); prepare(s,c.tokens.judge); const visitor=s.visitor(); const id=actionId();
    const input={...visitor,winner:'plaintiff',clientActionId:id}; const first=s.vote(c.game.id,input); assert.equal(s.vote(c.game.id,input).revision,first.revision);
    assert.throws(()=>s.vote(c.game.id,{...input,clientActionId:actionId()}),e=>e.code==='ALREADY_VOTED');
    assert.throws(()=>s.vote(c.game.id,{...input,visitorToken:c.tokens.judge}),e=>e.code==='CSRF');
    assert.throws(()=>s.vote(c.game.id,{...input,csrfToken:'bad'}),e=>e.code==='CSRF');
  } finally{s.close();}
});

test('SQLite restart preserves seats, pending turns, dedup receipts and delayed verdicts',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'court-sqlite-')); const path=join(dir,'court.sqlite'); let s;
  try {
    s=new CourtService({storePath:path,autoTick:false}); const c=create(s,'judge'); const joined=claim(s,c.invitation); const played=playTurn(s,joined.seatToken);
    s.close(); s=new CourtService({storePath:path,autoTick:false});
    assert.equal(s.state(joined.seatToken).game.revision,played.state.game.revision); assert.equal(s.speak(joined.seatToken,played.input).game.revision,played.state.game.revision);
    finishPractice(s,joined.seatToken); prepare(s,joined.seatToken); const visitor=s.visitor(); s.close(); s=new CourtService({storePath:path,autoTick:false});
    const final=browserVote(s,c.game.id,'plaintiff',visitor); assert.equal(final.status,'completed'); assert.equal(final.session.ruling.winner,'plaintiff');
    assert.equal((await stat(path)).mode & 0o777,0o600);
  } finally{s?.close();await rm(dir,{recursive:true,force:true});}
});

test('bounded longpoll wakes on committed changes and close releases pending waiters',async()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});
  try {
    const c=create(s); const j=claim(s,c.invitation); const state=s.state(j.seatToken); const pending=s.wait(j.seatToken,{afterRevision:state.expectedRevision,timeoutMs:1000});
    playTurn(s,j.seatToken); assert.ok((await pending).expectedRevision>state.expectedRevision);
    const revision=s.state(j.seatToken).expectedRevision; const closed=s.wait(j.seatToken,{afterRevision:revision,timeoutMs:20000});
    s.close(); await assert.rejects(closed,e=>e.code==='CLOSED');
  } finally{s.close();}
});

test('HTTP serves nonconsuming invite guides, enforces game scope and browser-only vote boundary',async()=>{
  const service=new CourtService({storePath:':memory:',autoTick:false}); const handler=createCourtHttpHandler({service});
  const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const origin=`http://127.0.0.1:${server.address().port}`;
  const post=(path,value,headers={})=>fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(value)});
  try {
    const c=create(service); const landing=await fetch(origin+c.invitation.path); assert.equal(landing.status,200); assert.match(await landing.text(),/agents\/guide.md/); assert.equal(service.inspectInvitation(c.invitation.ticket).claimed,false);
    const joined=claim(service,c.invitation); const another=create(service);
    assert.equal((await fetch(`${origin}/api/games/${another.game.id}/agent`,{headers:{authorization:`Bearer ${joined.seatToken}`}})).status,403);
    assert.equal((await post('/api/games',{}, {origin:'https://evil.test'})).status,403);
    assert.equal(await new Promise((resolve,reject)=>{const req=request(origin+'/api/games',{headers:{host:'attacker.test'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();}),403);
    finishPractice(service,joined.seatToken);
    const visit=await fetch(origin+'/api/visitor'); const csrf=(await visit.json()).csrfToken; const cookie=visit.headers.get('set-cookie').split(';')[0];
    assert.equal((await post(`/api/games/${c.game.id}/votes`,{winner:'plaintiff',clientActionId:actionId()},{cookie,'x-court-csrf':csrf})).status,403,'vote requires Origin');
    assert.equal((await post(`/api/games/${c.game.id}/votes`,{winner:'plaintiff',clientActionId:actionId()},{origin,cookie,'x-court-csrf':csrf,authorization:`Bearer ${joined.seatToken}`})).status,403,'agent bearer cannot vote');
    const result=await post(`/api/games/${c.game.id}/votes`,{winner:'plaintiff',clientActionId:actionId()},{origin,cookie,'x-court-csrf':csrf}); assert.equal(result.status,200); assert.equal((await result.json()).status,'completed');
  } finally {service.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));handler.close();}
});


test('one SQLite file has one session owner; a failed second owner releases its connection',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'court-owner-')); const path=join(dir,'court.sqlite'); let first,third;
  try {
    first=new CourtService({storePath:path,autoTick:false}); const c=create(first);
    assert.throws(()=>new CourtService({storePath:path,autoTick:false}),/locked/);
    assert.equal(first.get(c.game.id).id,c.game.id);
    first.close();third=new CourtService({storePath:path,autoTick:false});assert.equal(third.get(c.game.id).id,c.game.id);
  } finally {first?.close();third?.close();await rm(dir,{recursive:true,force:true});}
});

test('jury majority can arrive before judge preparation without inventing or exposing a verdict',()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});
  try {
    const c=multiplayer(s); browserVote(s,c.game.id,'defendant'); browserVote(s,c.game.id,'plaintiff'); browserVote(s,c.game.id,'defendant');
    const voted=s.get(c.game.id); assert.equal(voted.jury.outcome,'defendant'); assert.equal(voted.status,'waiting-jury'); assert.equal(voted.session.ruling,undefined);
    assert.equal(s.state(c.tokens.judge).action,'prepare_verdicts');
    const prepared=prepare(s,c.tokens.judge).state; assert.equal(prepared.game.status,'completed'); assert.equal(prepared.game.session.ruling.winner,'defendant'); assert.equal(prepared.roleFinished,true);
  } finally{s.close();}
});

test('HTTP judge seals both full verdict payloads without a caller-supplied speaker',async()=>{
  const service=new CourtService({storePath:':memory:',autoTick:false}); const handler=createCourtHttpHandler({service});
  const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const origin=`http://127.0.0.1:${server.address().port}`;
  const post=(id,value,seatToken)=>fetch(`${origin}/api/games/${id}/verdicts`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${seatToken}`},body:JSON.stringify(value)});
  try {
    const c=multiplayer(service); const state=service.state(c.tokens.judge);
    const make=winner=>{
      const {speaker,...payload}=rehearsalTurn(castJuryVote(state.game.session,winner),{role:'judge',phase:'verdict',interventionIds:[]});
      assert.equal(speaker,'judge'); return payload;
    };
    const input={clientActionId:actionId(),revision:state.expectedRevision,plaintiff:make('plaintiff'),defendant:make('defendant')};
    const forbidden=await post(c.game.id,input,c.tokens.plaintiff); assert.equal(forbidden.status,403); assert.equal((await forbidden.json()).error,'ROLE_SCOPE');
    const response=await post(c.game.id,input,c.tokens.judge); assert.equal(response.status,200); const sealed=await response.json();
    assert.equal(sealed.roleFinished,true); assert.equal(sealed.game.verdict.prepared,true); assert.equal(sealed.game.session.ruling,undefined);
    assert.ok(!JSON.stringify(sealed.game).includes('reasons'),'neither private verdict is published at preparation');
    const retry=await post(c.game.id,input,c.tokens.judge); assert.equal(retry.status,200); assert.equal((await retry.json()).expectedRevision,sealed.expectedRevision);
    browserVote(service,c.game.id,'defendant'); browserVote(service,c.game.id,'plaintiff');
    const result=browserVote(service,c.game.id,'defendant'); assert.equal(result.status,'completed'); assert.equal(result.session.ruling.winner,'defendant');
    assert.deepEqual(result.session.ruling.reasons,input.defendant.ruling.reasons);
  } finally {service.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));handler.close();}
});
