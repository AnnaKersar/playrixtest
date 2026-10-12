import assert from 'node:assert/strict';import {fixture,rgbPNG} from './reliability-fixture.mjs';
import {createWorker,reconcilePreviousAttempts} from '../cloudflare/worker.mjs';import {sha} from '../cloudflare/provider.mjs';import {stopGeneration} from '../cloudflare/stop-generation.mjs';
import {nativeOpaqueRGBPNG} from '../cloudflare/png.mjs';import {acquireFinalization,sweepFinalizations,failFinalization} from '../cloudflare/finalization-recovery.mjs';import {budgetState} from '../cloudflare/budget.mjs';
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function setup(){const f=await fixture(),w=createWorker({authenticate:async()=>({role:'owner',principalId:'owner'}),provider:f.provider});
 const api=async(path,body)=>{const r=await w.fetch(new Request('https://test'+path,{method:body?'POST':'GET',headers:{Origin:'https://test',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),f.env);const d=await r.json();assert(r.ok,JSON.stringify(d));return d;};
 const r=await api('/api/runs',{mode:'live',requestId:'saved-card',approval:'I approve one paid attempt per object',objects:[{object_id:'o',name:'Whistle',brief:'A complete brass whistle with attached loop.',category:'C1',generation_mode:'whole_card',living_creatures:'none',semantic_family:'tool',factual_checks:['The loop attaches to the whistle body','The mouthpiece has a coherent opening']}]});
 const id=r.runId+'_o',key='runs/'+r.runId+'/o/',deliver=async body=>{let ack=0,retry=0;await w.queue({messages:[{body,ack(){ack++},retry(){retry++}}]},f.env);return {ack,retry};};
 return {...f,w,api,id,key,run:r.runId,deliver};}
await check('lost finalization delivery is found by sweep; duplicate delivery charges once',async()=>{
 const f=await setup();await f.deliver(f.messages.shift());assert.equal(f.state.calls,1);f.messages.length=0;
 f.db.prepare("UPDATE attempts SET created_at='2020-01-01' WHERE job_id=?").run(f.id);
 assert.equal((await f.w.scheduled({},f.env)).sent,1);const body=f.messages.shift();await Promise.all([f.deliver(body),f.deliver(body)]);
 assert.equal(f.db.prepare('SELECT status FROM jobs WHERE id=?').get(f.id).status,'complete');assert.equal(f.state.calls,1);
 const hash=await sha(f.objects.get(f.key+'final.png'));await f.deliver(body);assert.equal(hash,await sha(f.objects.get(f.key+'final.png')));assert.equal(f.state.calls,1);
 f.db.prepare("INSERT INTO jobs(id,run_id,object_id,status) VALUES(?,?,?,'queued')").run(f.run+'_waiting',f.run,'waiting');const queued=f.messages.length;await f.api('/api/recover',{jobId:f.id});await f.api('/api/recover',{jobId:f.id});assert.equal(f.messages.length,queued,'Completed image recovery must not enqueue paid work');f.db.close();
});
await check('hard interruption after raw save before receipt recovers from checkpoint with zero replay',async()=>{
 const f=await setup();f.state.fail=k=>k.endsWith('/receipt.json');await f.deliver(f.messages.shift());
 assert(f.objects.has(f.key+'raw.png'));assert(f.objects.has(f.key+'pending-receipt.json'));assert(!f.objects.has(f.key+'receipt.json'));assert.equal(f.state.calls,1);
 f.state.fail=null;await f.api('/api/recover',{jobId:f.id});await f.deliver(f.messages.shift());
 assert.equal(f.db.prepare('SELECT status FROM jobs WHERE id=?').get(f.id).status,'complete');assert.equal(f.state.calls,1);f.db.close();
});
await check('temporary finalization failure retries saved PNG then completes without provider call',async()=>{
 const f=await setup();await f.deliver(f.messages.shift());const body=f.messages.shift();f.state.fail=k=>k.endsWith('/final.png');
 assert.deepEqual(await f.deliver(body),{ack:0,retry:1});f.state.fail=null;assert.deepEqual(await f.deliver(body),{ack:1,retry:0});
 assert.equal(f.db.prepare('SELECT status FROM jobs WHERE id=?').get(f.id).status,'complete');assert.equal(f.state.calls,1);f.db.close();
});
await check('four storage failures stop retries and expose a safe UI error',async()=>{
 const f=await setup();await f.deliver(f.messages.shift());const body=f.messages.shift();f.state.fail=k=>k.endsWith('/final.png');
 for(let i=0;i<4;i++){const r=await f.deliver(body);assert.equal(r.retry,i<3?1:0);assert.equal(r.ack,i===3?1:0);}
 assert.equal(f.db.prepare('SELECT status FROM jobs WHERE id=?').get(f.id).status,'needs_review');const view=await f.api('/api/run?compact=1&run='+f.run);assert.match(view.jobs[0].public_error,/4 попыток/);assert.equal(f.state.calls,1);
 await f.deliver(body);assert.equal(f.db.prepare('SELECT attempts FROM finalization_jobs WHERE job_id=?').get(f.id).attempts,4);f.db.close();
});
await check('CRC-correct broken DEFLATE is rejected; corrupted image never becomes complete',async()=>{
 const bad=rgbPNG(864,960,new Uint8Array([0x78,0x9c,0xff,0,0,0,0]));assert.throws(()=>nativeOpaqueRGBPNG(bad,[864,960]),/PNG deflate/);
 const f=await setup();await f.deliver(f.messages.shift());const body=f.messages.shift();f.objects.set(f.key+'raw.png',bad);
 const receipt=JSON.parse(new TextDecoder().decode(f.objects.get(f.key+'receipt.json')));receipt.raw_sha256=await sha(bad);await f.bucket.put(f.key+'receipt.json',JSON.stringify(receipt));
 const r=await f.deliver(body);assert.deepEqual(r,{ack:1,retry:0});assert.equal(f.db.prepare('SELECT status FROM jobs WHERE id=?').get(f.id).status,'needs_review');assert(!f.db.prepare('SELECT * FROM results WHERE job_id=?').get(f.id));assert.equal(f.state.calls,1);f.db.close();
});
await check('expired lease is recovered and hard interruptions exhaust the same four-attempt limit',async()=>{
 const f=await setup();await f.deliver(f.messages.shift());f.messages.length=0;f.db.prepare("UPDATE attempts SET created_at='2020-01-01' WHERE job_id=?").run(f.id);
 let lease=await acquireFinalization(f.env,f.id,Date.now()-600000);assert(lease);
 assert.equal((await sweepFinalizations(f.env)).sent,1);await f.deliver(f.messages.shift());assert.equal(f.state.calls,1);
 assert.equal(f.db.prepare('SELECT status FROM jobs WHERE id=?').get(f.id).status,'complete');f.db.close();
});
await check('valid saved PNG completes even with unknown cost; the entire original reserve remains',async()=>{
 const f=await setup();f.state.usage=null;await f.deliver(f.messages.shift());await f.deliver(f.messages.shift());
 const a=f.db.prepare('SELECT * FROM attempts WHERE job_id=?').get(f.id);assert.equal(a.status,'unknown');assert.equal(a.actual,null);assert.equal(a.reservation,10000000000);assert.equal(f.db.prepare('SELECT status FROM jobs WHERE id=?').get(f.id).status,'complete');assert.equal((await budgetState(f.env)).active_reserved,10000000000);assert.equal(f.state.calls,1);f.db.close();
});
await check('stale request without any saved PNG becomes visible unknown; never resends provider',async()=>{
 const f=await setup();f.state.timeout=true;await f.deliver(f.messages.shift());f.db.prepare("UPDATE attempts SET created_at='2020-01-01' WHERE job_id=?").run(f.id);assert.equal((await f.w.scheduled({},f.env)).sent,0);
 const view=await f.api('/api/run?compact=1&run='+f.run);assert.match(view.jobs[0].public_error,/полный резерв/);assert.equal(view.jobs[0].status,'needs_review');assert.equal(f.db.prepare('SELECT reservation FROM attempts WHERE job_id=?').get(f.id).reservation,10000000000);assert.equal(f.state.calls,1);f.db.close();
});
await check('four hard terminations exhaust the persistent lease counter and surface an error',async()=>{
 const f=await setup();await f.deliver(f.messages.shift());f.messages.length=0;f.db.prepare("UPDATE attempts SET created_at='2020-01-01' WHERE job_id=?").run(f.id);
 const now=Date.now();for(let i=0;i<4;i++)assert(await acquireFinalization(f.env,f.id,now-(4-i)*360000));
 assert.equal((await sweepFinalizations(f.env)).sent,0);const row=f.db.prepare('SELECT * FROM finalization_jobs WHERE job_id=?').get(f.id);assert.equal(row.state,'failed');assert.equal(row.attempts,4);assert.match(row.public_error,/4 попыток/);assert.equal(f.state.calls,1);f.db.close();
});
await check('late failure from an expired lease cannot overwrite the current recovery state',async()=>{
 const f=await setup();await f.deliver(f.messages.shift());const old=await acquireFinalization(f.env,f.id,Date.now()-600000),current=await acquireFinalization(f.env,f.id);assert(old&&current);
 assert.equal((await failFinalization(f.env,old,Error('Temporary failure'))).stale,true);assert.equal(f.db.prepare('SELECT lease_token FROM finalization_jobs WHERE job_id=?').get(f.id).lease_token,current.lease_token);assert.equal(f.db.prepare('SELECT status FROM jobs WHERE id=?').get(f.id).status,'running');assert.equal(f.state.calls,1);f.db.close();
});
await check('cancelled image keeps its output and can settle verified receipt cost without resuming or paying',async()=>{
 const f=await setup();f.state.fail=k=>k.endsWith('/receipt.json');await f.deliver(f.messages.shift());f.state.fail=null;
 await stopGeneration(f.env,{role:'owner',principalId:'owner'},{runId:f.run});const report=await reconcilePreviousAttempts(f.env,{role:'owner',principalId:'owner'});
 assert.equal(report.settled,1);assert.equal(f.db.prepare('SELECT actual FROM attempts WHERE job_id=?').get(f.id).actual,141000);assert.equal(f.db.prepare('SELECT status FROM jobs WHERE id=?').get(f.id).status,'cancelled');assert(f.objects.has(f.key+'raw.png'));assert.equal(f.state.calls,1);f.db.close();
});
await check('PNG time budget exhaustion retries saved output without a second provider call',async()=>{
 const f=await setup();await f.deliver(f.messages.shift());const body=f.messages.shift(),put=f.bucket.put;let injected=false;f.bucket.put=async(k,v)=>{if(k.endsWith('/final.png')&&!injected){injected=true;throw Error('PNG decode time limit');}return put(k,v);};
 const first=await f.deliver(body);assert.equal(first.retry,1);assert.equal(first.ack,0);assert.equal(f.db.prepare('SELECT status FROM jobs WHERE id=?').get(f.id).status,'running');const second=await f.deliver(body);assert.equal(second.retry,0);assert.equal(second.ack,1);assert.equal(f.db.prepare('SELECT status FROM jobs WHERE id=?').get(f.id).status,'complete');assert.equal(f.state.calls,1);assert.equal(f.db.prepare('SELECT attempts FROM finalization_jobs WHERE job_id=?').get(f.id).attempts,2);f.db.close();
});
console.log(JSON.stringify({checks:checks.length,paid_requests:0}));
