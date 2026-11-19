import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, request } from 'node:http';
import { once } from 'node:events';

const dir = await mkdtemp(join(tmpdir(), 'court-platform-v2-build-'));
let api;
try {
  const outfile = join(dir, 'backend.mjs');
  await build({stdin:{contents:"export * from './server/courtService'; export * from './server/courtHttp'; export {rehearsalTurn,castJuryVote} from './src/utils/courtRuntime'; export {PRESET_CASES} from './src/data/presetCases';",resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent'});
  api = await import(pathToFileURL(outfile).href);
} finally { await rm(dir,{recursive:true,force:true}); }
const {CourtService,createCourtHttpHandler,PRESET_CASES,rehearsalTurn,castJuryVote}=api;
let sequence=0;
const unique=()=>`v2-${++sequence}`;
const create=(s,mode='multiplayer',title='真实案卷')=>s.create({caseData:{...PRESET_CASES[0],title},role:'judge',mode});
const claim=(s,invitation)=>s.join({ticket:invitation.ticket,agentName:invitation.role,clientActionId:unique()});
const turn=(s,seatToken)=>{const st=s.state(seatToken);return s.speak(seatToken,{turnId:st.turnId,revision:st.expectedRevision,clientActionId:unique(),payload:rehearsalTurn(st.game.session,st.game.session.pendingTurns[0])});};
function played(s,mode='multiplayer',title) {
  const c=create(s,mode,title); const joined={judge:claim(s,c.invitation)};
  if(mode==='multiplayer')for(const role of ['plaintiff','defendant']) joined[role]=claim(s,s.invite(c.game.id,{role}));
  while(s.get(c.game.id).currentRole)turn(s,joined[s.get(c.game.id).currentRole].seatToken);
  const st=s.state(joined.judge.seatToken);
  const verdict=winner=>({...rehearsalTurn(castJuryVote(st.game.session,winner),{role:'judge',phase:'verdict',interventionIds:[]}),text:`绝不提前泄露-${winner}`});
  s.prepareVerdicts(joined.judge.seatToken,{revision:st.expectedRevision,clientActionId:unique(),plaintiff:verdict('plaintiff'),defendant:verdict('defendant')});
  return {...c,joined};
}
const vote=(s,id)=>s.vote(id,{...s.visitor(),winner:'plaintiff',clientActionId:unique()});
async function host(s) {
  const handler=createCourtHttpHandler({service:s});
  const server=createServer((req,res)=>{void handler(req,res).then(handled=>{if(!handled){res.writeHead(404);res.end();}});});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  return {handler,base:`http://127.0.0.1:${server.address().port}`,async close(){handler.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
async function sse(url,headers={}) {
  const req=request(url,{headers});
  const promise=new Promise((resolve,reject)=>{req.once('response',resolve);req.once('error',reject);});
  req.end(); const res=await promise; res.setEncoding('utf8');
  let buffer=''; const frames=[]; const pending=[];
  res.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const next=pending.shift();if(next){clearTimeout(next.timer);next.resolve(frame);}else frames.push(frame);}});
  return {res,req,next(timeout=2000){if(frames.length)return Promise.resolve(frames.shift());return new Promise((resolve,reject)=>{const entry={resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(entry),1);reject(new Error('SSE frame timeout'));},timeout)};pending.push(entry);});},close(){req.destroy();res.destroy();for(const p of pending)clearTimeout(p.timer);}};
}
const gameFrame=frame=>{assert.match(frame,/event: game/);return JSON.parse(frame.split('\n').find(line=>line.startsWith('data: ')).slice(6));};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('public judgment HTTP library filters modes and lifecycle, searches, paginates ties, and survives SQLite restart',async()=>{
  const scratch=await mkdtemp(join(tmpdir(),'court-v2-persist-')); const path=join(scratch,'court.sqlite'); let s,h;
  let now=1000;
  try {
    s=new CourtService({storePath:path,now:()=>now,autoTick:false}); h=await host(s);
    assert.deepEqual(await (await fetch(h.base+'/api/judgments')).json(),{games:[]});
    const practice=played(s,'practice','只限排练');vote(s,practice.game.id);
    create(s); const waiting=played(s,'multiplayer','还在投票');
    const completed=played(s,'multiplayer','检索海豹'); for(let i=0;i<3;i++)vote(s,completed.game.id);
    const unresolved=played(s,'multiplayer','检索海豹'); now+=86400001;s.tick();
    const response=await fetch(h.base+'/api/judgments?query=检索海豹&limit=1');assert.equal(response.status,200);
    const first=await response.json();assert.equal(first.games.length,1);assert.ok(first.nextCursor);
    const second=await (await fetch(h.base+'/api/judgments?query=检索海豹&limit=1&cursor='+first.nextCursor)).json();
    assert.equal(second.games.length,1);assert.equal(second.nextCursor,undefined);
    assert.deepEqual(new Set([...first.games,...second.games].map(g=>g.id)),new Set([completed.game.id,unresolved.game.id]));
    assert.deepEqual(new Set([...first.games,...second.games].map(g=>g.status)),new Set(['completed','unresolved']));
    assert.equal((await fetch(h.base+'/api/judgments?cursor=bad')).status,400);
    assert.equal((await fetch(h.base+'/api/judgments?limit=51')).status,400);
    assert.equal((await fetch(h.base+'/api/judgments?query=other&cursor='+first.nextCursor)).status,400);
    assert.equal((await fetch(h.base+'/api/judgments',{headers:{origin:'https://evil.example'}})).status,200,'cross-site GET of public library data is allowed');
    assert.equal((await fetch(h.base+'/api/games',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'})).status,403,'cross-site POST stays blocked');
    const library=await (await fetch(h.base+'/api/judgments')).json();assert.equal(library.games.length,3,'also includes genuinely expired waiting jury, never the practice game or open seats');
    assert.ok(library.games.some(g=>g.id===waiting.game.id));
    const encoded=JSON.stringify(library);assert.ok(!encoded.includes(completed.ownerToken));assert.ok(!encoded.includes(completed.joined.judge.seatToken));assert.ok(!encoded.includes('绝不提前泄露-defendant'));
    await h.close();h=undefined;s.close();s=new CourtService({storePath:path,now:()=>now,autoTick:false});h=await host(s);
    const restored=await (await fetch(h.base+'/api/judgments?query=检索海豹&limit=1&cursor='+first.nextCursor)).json();assert.deepEqual(restored,second);
    const context=await (await fetch(`${h.base}/api/invitations/${completed.invitation.ticket}/context`)).json();assert.equal(context.role,'judge');assert.equal(context.game.id,completed.game.id);assert.equal(context.roleFinished,true);assert.ok(!JSON.stringify(context).includes(completed.joined.judge.seatToken));
  } finally {await h?.close();s?.close();await rm(scratch,{recursive:true,force:true});}
});

test('SSE pushes committed PublicGame snapshots, catches up via Last-Event-ID, and public longpoll wakes without leaking private payloads',async()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});const h=await host(s); const streams=[];
  try {
    const c=create(s);const stream=await sse(`${h.base}/api/games/${c.game.id}/events`);streams.push(stream);assert.equal(stream.res.statusCode,200);
    const initial=gameFrame(await stream.next());assert.equal(initial.revision,c.game.revision);
    const judge=claim(s,c.invitation);const pushed=gameFrame(await stream.next());assert.equal(pushed.revision,judge.state.expectedRevision);
    assert.ok(!JSON.stringify(pushed).includes(judge.seatToken));assert.ok(!JSON.stringify(pushed).includes(c.invitation.ticket));
    const resumed=await sse(`${h.base}/api/games/${c.game.id}/events`,{'last-event-id':String(initial.revision)});streams.push(resumed);assert.equal(gameFrame(await resumed.next()).revision,pushed.revision);
    const same=await sse(`${h.base}/api/games/${c.game.id}/events`,{'last-event-id':String(pushed.revision)});streams.push(same);
    const wait=fetch(`${h.base}/api/games/${c.game.id}/wait?after=${pushed.revision}&timeout=2`);await delay(20);
    s.invite(c.game.id,{role:'plaintiff'});
    const current=s.get(c.game.id);assert.equal(gameFrame(await same.next()).revision,current.revision);assert.equal((await (await wait).json()).revision,current.revision);
    const immediate=await fetch(`${h.base}/api/games/${c.game.id}/wait?after=0`);assert.equal((await immediate.json()).revision,current.revision);
    const bounded=await fetch(`${h.base}/api/games/${c.game.id}/wait?after=${current.revision}&timeout=0`);assert.equal((await bounded.json()).revision,current.revision);
    assert.equal((await fetch(`${h.base}/api/games/${c.game.id}/events`,{headers:{'last-event-id':'NaN'}})).status,400);
    assert.equal((await fetch(`${h.base}/api/games/${c.game.id}/wait?after=-1`)).status,400);
    assert.equal((await fetch(`${h.base}/api/games/${c.game.id}/events`,{headers:{origin:'https://evil.example'}})).status,200,'read-only event stream is public');
  } finally {streams.forEach(stream=>stream.close());await h.close();s.close();}
});

test('SSE connection limit is released on real disconnect; longpoll cancellation and handler shutdown release service subscriptions',async()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});const h=await host(s);const streams=[];let pending;
  try {
    const c=create(s);const url=`${h.base}/api/games/${c.game.id}/events?after=${c.game.revision}`;
    for(let i=0;i<128;i++)streams.push(await sse(url));
    assert.equal((await fetch(url)).status,429);
    streams.pop().close();await delay(30);
    const replacement=await sse(url);streams.push(replacement);assert.equal(replacement.res.statusCode,200);
    streams.forEach(stream=>stream.close());await delay(30);
    const controller=new AbortController();
    pending=fetch(`${h.base}/api/games/${c.game.id}/wait?after=${c.game.revision}&timeout=20`,{signal:controller.signal}).catch(e=>e);
    await delay(30);controller.abort();assert.equal((await pending).name,'AbortError');await delay(30);
    for(let i=0;i<128;i++)streams.push(await sse(url));
    h.handler.close();await delay(30);
    const other=createCourtHttpHandler({service:s});const release=[];
    try {for(let i=0;i<128;i++)release.push(s.subscribe(c.game.id,c.game.revision,()=>{}));}finally{release.forEach(fn=>fn());other.close();}
  } finally {streams.forEach(stream=>stream.close());await h.close();s.close();}
});

test('idle SSE sends a bounded heartbeat and service close ends its connection',async()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});const h=await host(s);let stream;
  try {
    const c=create(s);stream=await sse(`${h.base}/api/games/${c.game.id}/events?after=${c.game.revision}`);
    assert.equal(await stream.next(17000),': heartbeat');
    const ended=once(stream.res,'end');s.close();await ended;
  } finally {stream?.close();await h.close();s.close();}
});

test('read-only invitation context scopes own Agent state and receipts, never claims or exposes seat credentials or sealed verdicts',async()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});const h=await host(s);
  const post=(path,value,seatToken)=>fetch(h.base+path,{method:'POST',headers:{'content-type':'application/json',...(seatToken?{authorization:`Bearer ${seatToken}`}:{})},body:JSON.stringify(value)});
  try {
    const c=create(s);const url=`${h.base}/api/invitations/${c.invitation.ticket}/context`;
    const original=s.get(c.game.id).revision;
    const unclaimed=await (await fetch(url)).json();assert.equal(unclaimed.action,'claim');assert.equal(unclaimed.role,'judge');assert.equal(s.inspectInvitation(c.invitation.ticket).claimed,false);assert.equal(s.get(c.game.id).revision,original);
    const joinId=unique();const input={agentName:'网页法官',clientActionId:joinId};
    const joined=await (await post(`/api/invitations/${c.invitation.ticket}/claim`,input)).json();
    assert.equal((await (await post(`/api/invitations/${c.invitation.ticket}/claim`,input)).json()).seatToken,joined.seatToken);
    const tickets={judge:c.invitation};const seats={judge:joined};
    for(const role of ['plaintiff','defendant']){tickets[role]=s.invite(c.game.id,{role});seats[role]=claim(s,tickets[role]);}
    let ownAction;
    while(s.get(c.game.id).currentRole){const r=s.get(c.game.id).currentRole;const st=s.state(seats[r].seatToken);const action={turnId:st.turnId,revision:st.expectedRevision,clientActionId:unique(),payload:rehearsalTurn(st.game.session,st.game.session.pendingTurns[0])};if(r==='plaintiff')ownAction=action.clientActionId;const response=await post(`/api/games/${c.game.id}/turns`,action,seats[r].seatToken);assert.equal(response.status,200);}
    const plaintiff=await (await fetch(`${h.base}/api/invitations/${tickets.plaintiff.ticket}/context`)).json();assert.equal(plaintiff.role,'plaintiff');assert.ok(plaintiff.receipts.some(r=>r.clientActionId===ownAction));
    const judgeBefore=await (await fetch(url)).json();assert.equal(judgeBefore.action,'prepare_verdicts');assert.ok(!judgeBefore.receipts.some(r=>r.clientActionId===ownAction));
    const make=winner=>({...rehearsalTurn(castJuryVote(judgeBefore.game.session,winner),{role:'judge',phase:'verdict',interventionIds:[]}),text:`未公开判词-${winner}`});
    const sealed=await post(`/api/games/${c.game.id}/verdicts`,{clientActionId:unique(),revision:judgeBefore.expectedRevision,plaintiff:make('plaintiff'),defendant:make('defendant')},joined.seatToken);assert.equal(sealed.status,200);
    const contextResponse=await fetch(url);const context=await contextResponse.json();assert.equal(context.roleFinished,true);const encoded=JSON.stringify(context);
    for(const secret of [joined.seatToken,c.ownerToken,joinId,'未公开判词-plaintiff','未公开判词-defendant',seats.plaintiff.seatToken])assert.ok(!encoded.includes(secret));
    assert.equal(contextResponse.headers.get('referrer-policy'),'no-referrer');
    assert.equal((await fetch(`${h.base}/api/invitations/not-valid/context`)).status,404);
    assert.equal((await fetch(url,{headers:{origin:'https://evil.example'}})).status,200,'read-only invitation context is reachable cross-site');
    const other=create(s);assert.equal((await fetch(`${h.base}/api/games/${other.game.id}/agent`,{headers:{authorization:`Bearer ${joined.seatToken}`}})).status,403);
    const landing=await (await fetch(h.base+c.invitation.path)).text();for(const hint of ['MCP','HTTP','浏览器接力','courtAction','/context'])assert.ok(landing.includes(hint));
  } finally {await h.close();s.close();}
});


test('private HTTP and MCP waits release shared capacity on disconnect and handler shutdown',async()=>{
  const s=new CourtService({storePath:':memory:',autoTick:false});const h=await host(s);
  try {
    const c=create(s);const joined=claim(s,c.invitation);const revision=s.get(c.game.id).revision;
    const reserveAll=()=>{const release=[];try{for(let i=0;i<128;i++)release.push(s.subscribe(c.game.id,revision,()=>{}));}finally{release.forEach(fn=>fn());}};
    for(const transport of ['http','mcp']) {
      const controller=new AbortController();
      const url=transport==='http'?`${h.base}/api/games/${c.game.id}/agent/wait?after=${revision}&timeout=15`:`${h.base}/mcp`;
      const options={signal:controller.signal,headers:{authorization:`Bearer ${joined.seatToken}`,...(transport==='mcp'?{'content-type':'application/json',accept:'application/json, text/event-stream'}:{})},...(transport==='mcp'?{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:unique(),method:'tools/call',params:{name:'court_wait',arguments:{afterRevision:revision,timeoutMs:15000}}})}:{})};
      const waiting=fetch(url,options).catch(error=>error);await delay(30);controller.abort();assert.equal((await waiting).name,'AbortError');await delay(30);reserveAll();
    }
    const pending=fetch(`${h.base}/mcp`,{method:'POST',headers:{authorization:`Bearer ${joined.seatToken}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:unique(),method:'tools/call',params:{name:'court_wait',arguments:{afterRevision:revision,timeoutMs:15000}}})}).then(r=>r.text());
    await delay(30);h.handler.close();await pending;await delay(30);reserveAll();
  } finally {await h.close();s.close();}
});
