import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createWorker} from '../cloudflare/worker.mjs';
import {sha,IMAGE_MODEL} from '../cloudflare/provider.mjs';
import {mockPNG,decodePNG,finalPNG} from '../cloudflare/png.mjs';
import {createProcessing,processingHealth,PROCESSING_DEADLINE_MS} from '../cloudflare/processing-diagnostics.mjs';
import {journalRead,processingExecutions} from '../cloudflare/experiment-journal.mjs';

globalThis.fetch=()=>{throw Error('External network forbidden in offline tests');};
const schema=await readFile(new URL('../cloudflare/schema.sql',import.meta.url),'utf8');
const raw=await mockPNG(1376,1536),sheet=await mockPNG(896,1040),finalFixture=await mockPNG(860,960);
const cost=141000,usage={input_tokens:3,input_tokens_details:{text_tokens:1,image_tokens:2},output_tokens:4,total_tokens:7};
const confidential='TOKEN_PROMPT_HEADER_IP_BASE64_DO_NOT_LOG';
const fastPNG={resize:()=>({width:860,height:960,rgba:new Uint8Array(0)}),encode:()=>finalFixture};
const warnings=[],originalError=console.error;console.error=value=>warnings.push(JSON.parse(value));
let passed=0;
async function fixture({pngOperations=fastPNG,providerError=null,generation=null}={}){
  const db=new DatabaseSync(':memory:');db.exec(schema);db.exec('UPDATE budget SET approved=1,ceiling=100000000000');
  const state={dbFail:null,r2Fail:null,sendFail:false,calls:0,acks:0,sent:[],map:new Map()};
  function statement(sql,args=[]){return {bind(...a){return statement(sql,a);},async first(){if(state.dbFail?.(sql))throw Error(confidential);return db.prepare(sql).get(...args)||null;},async all(){if(state.dbFail?.(sql))throw Error(confidential);return {results:db.prepare(sql).all(...args)};},async run(){if(state.dbFail?.(sql))throw Error(confidential);return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}
  const DB={prepare:statement,async batch(items){db.exec('BEGIN');try{const values=[];for(const s of items)values.push(await s.run());db.exec('COMMIT');return values;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const ARTIFACTS={async put(key,value){if(state.r2Fail?.(key,'put'))throw Error(confidential);state.map.set(key,typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value));},async get(key){if(state.r2Fail?.(key,'get'))throw Error(confidential);const bytes=state.map.get(key);return bytes?{text:async()=>new TextDecoder().decode(bytes),json:async()=>JSON.parse(new TextDecoder().decode(bytes)),arrayBuffer:async()=>bytes.slice().buffer,body:new Blob([bytes]).stream()}:null;},async head(key){return state.map.has(key)?{}:null;}};
  const ad='Synthetic offline Art Direction',manifest={version:'reference-pack/v1',model:IMAGE_MODEL,reference_count:50,art_direction:ad,art_direction_sha256:await sha(ad),sheets:Array.from({length:13},(_,i)=>({key:'references/'+i+'.png',count:i===12?2:4,sha256:null}))};
  for(const entry of manifest.sheets){entry.sha256=await sha(sheet);await ARTIFACTS.put(entry.key,sheet);}
  const manifestText=JSON.stringify(manifest);await ARTIFACTS.put('references/manifest.json',manifestText);
  const env={DB,ARTIFACTS,IMAGE_JOBS:{async send(body){if(state.sendFail)throw Error(confidential);state.sent.push(body);}},ASSETS:{},OPENAI_API_KEY:confidential,LIVE_GENERATION_ENABLED:'true',REFERENCE_MANIFEST_KEY:'references/manifest.json',APPROVED_REFERENCE_MANIFEST_SHA256:await sha(manifestText),APPROVED_ART_DIRECTION_SHA256:await sha(ad),CF_VERSION_METADATA:{id:'test-deployment'}};
  const frozen={model:IMAGE_MODEL,provider_version:'fixture',reference_manifest_sha:env.APPROVED_REFERENCE_MANIFEST_SHA256,art_direction_sha:env.APPROVED_ART_DIRECTION_SHA256,native:[1376,1536],quality:'medium',background:'transparent',reservation:1000000000,objects:[{object_id:'card',prompt:confidential,...(generation?{generation}:{})}]},text=JSON.stringify(frozen);
  await ARTIFACTS.put('frozen.json',text);db.prepare('INSERT INTO runs VALUES (?,?,?,?,?,?,?)').run('run_fixture','live','Fixture','frozen.json',await sha(text),new Date().toISOString(),'owner');db.prepare('INSERT INTO jobs VALUES (?,?,?,?)').run('job_fixture','run_fixture','card','queued');
  const worker=createWorker({authenticate:async()=>({principalId:'owner',role:'owner'}),pngOperations,provider:async()=>{state.calls++;if(providerError)throw providerError;return {png:raw,usage,requestId:'fixture-request'};}});
  const deliver=body=>worker.queue({messages:[{body,ack(){state.acks++;}}]},env);
  const generate=()=>deliver({version:1,jobId:'job_fixture'});
  const recover=()=>deliver({version:1,kind:'image-recovery',jobId:'job_fixture',parentExecutionId:state.sent[0]?.parentExecutionId});
  const job=()=>db.prepare('SELECT * FROM jobs').get(),attempt=()=>db.prepare('SELECT * FROM attempts').get();
  const events=()=>db.prepare("SELECT payload_json FROM experiment_journal_events WHERE event_type='processing_stage' ORDER BY rowid").all().map(r=>JSON.parse(r.payload_json));
  const rawKey='runs/run_fixture/card/raw.png',receiptKey='runs/run_fixture/card/receipt.json';
  return {env,db,state,worker,deliver,generate,recover,job,attempt,events,rawKey,receiptKey,close:()=>db.close()};
}
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
const has=(events,stage,outcome)=>events.some(e=>e.stage===stage&&e.outcome===outcome);
try{
await check('full real PNG lifecycle; stages, dimensions, correlation and native/final pixels',async()=>{
  const f=await fixture({pngOperations:undefined}); // Explicitly remove fast operations for this case.
  const realWorker=createWorker({provider:async()=>{f.state.calls++;return {png:raw,usage,requestId:'fixture'};}});
  const send=body=>realWorker.queue({messages:[{body,ack(){f.state.acks++;}}]},f.env);
  await send({version:1,jobId:'job_fixture'});assert.equal(f.state.calls,1);assert.equal(f.attempt().actual,cost);assert.equal(f.job().status,'running');
  await send(f.state.sent[0]);assert.equal(f.job().status,'complete');
  const events=f.events();for(const stage of ['provider_response','raw_r2_write','receipt_r2_write','receipt_d1_status','finalization_send','read_raw_receipt','decoding_png','resizing_png','encoding_png','final_r2_write','final_d1_status']){assert(has(events,stage,'started'),stage);assert(has(events,stage,'succeeded'),stage);}
  const receive=events.find(e=>e.stage==='finalization_receive');assert.equal(receive.parent_execution_id,f.state.sent[0].parentExecutionId);assert.notEqual(receive.execution_id,receive.parent_execution_id);
  assert(events.every(e=>e.run_id==='run_fixture'&&e.job_id==='job_fixture'&&e.attempt_id==='job_fixture'&&e.at&&e.deadline_at&&e.deploy_version==='test-deployment'));
  assert.equal(events.find(e=>e.stage==='decoding_png'&&e.outcome==='succeeded').width,1376);
  const png=await decodePNG(f.state.map.get('runs/run_fixture/card/final.png'));assert.equal(png.width,860);assert.equal(png.height,960);assert.equal(png.rgba[3],0);
  assert.equal(await sha(f.state.map.get(f.rawKey)),await sha(raw));assert.equal(JSON.stringify(events).includes(confidential),false);f.close();
});
for(const [stage,operation] of [['decoding_png','decode'],['resizing_png','resize'],['encoding_png','encode']])await check(stage+' failure retains raw, settled billing and blocks paid replay',async()=>{
  const f=await fixture({pngOperations:{...fastPNG,[operation]:()=>{throw Error(confidential);}}});await f.generate();await f.recover();
  assert.equal(f.job().status,'needs_review');assert.equal(f.attempt().actual,cost);assert.equal(f.attempt().status,'complete');assert(has(f.events(),stage,'failed'));
  await f.generate();assert.equal(f.state.calls,1);assert.equal(await sha(f.state.map.get(f.rawKey)),await sha(raw));assert(f.state.map.has(f.receiptKey));assert(!JSON.stringify(f.events()).includes(confidential));f.close();
});
for(const suffix of ['/final.png','/manifest.json'])await check('final R2 failure '+suffix+' can recover without payment',async()=>{
  const f=await fixture();await f.generate();f.state.r2Fail=key=>key.endsWith(suffix);await f.recover();assert.equal(f.job().status,'needs_review');assert(has(f.events(),'final_r2_write','failed'));assert.equal(f.attempt().actual,cost);f.state.r2Fail=null;await f.recover();assert.equal(f.job().status,'complete');assert.equal(f.state.calls,1);assert.equal(await sha(f.state.map.get(f.rawKey)),await sha(raw));f.close();
});
await check('final D1 batch error marks needs_review without erasing receipt/billing',async()=>{
  const f=await fixture();await f.generate();f.state.dbFail=sql=>sql.startsWith('INSERT OR REPLACE INTO results');await f.recover();assert.equal(f.job().status,'needs_review');assert(has(f.events(),'final_d1_status','failed'));assert.equal(f.attempt().actual,cost);assert.equal(f.attempt().receipt_key,f.receiptKey);f.state.dbFail=null;await f.recover();assert.equal(f.job().status,'complete');assert.equal(f.state.calls,1);f.close();
});
for(const suffix of ['/raw.png','/receipt.json'])await check('provider storage failure '+suffix+' preserves claim and prevents retry',async()=>{
  const f=await fixture();f.state.r2Fail=key=>key.endsWith(suffix);await f.generate();assert.equal(f.job().status,'needs_review');assert.equal(f.attempt().status,'unknown');assert.equal(f.attempt().reservation,1000000000);assert.equal(f.attempt().actual,null);await f.generate();assert.equal(f.state.calls,1);if(suffix==='/receipt.json')assert.equal(await sha(f.state.map.get(f.rawKey)),await sha(raw));f.close();
});
await check('queue send failure has durable receipt and known billing; explicit recovery only',async()=>{
  const f=await fixture();f.state.sendFail=true;await f.generate();assert.equal(f.job().status,'needs_review');assert.equal(f.attempt().actual,cost);assert(has(f.events(),'finalization_send','failed'));assert(f.state.map.has(f.receiptKey));await f.generate();assert.equal(f.state.calls,1);f.state.sendFail=false;await f.recover();assert.equal(f.job().status,'complete');assert.equal(f.state.calls,1);f.close();
});
await check('ambiguous provider error retains reservation and never becomes known by deadline',async()=>{
  const f=await fixture({providerError:Error(confidential)});await f.generate();assert.equal(f.job().status,'needs_review');assert.equal(f.attempt().actual,null);assert.equal(f.attempt().status,'unknown');assert(has(f.events(),'provider_response','failed'));await f.generate();assert.equal(f.state.calls,1);const snapshot=await (await f.env.ARTIFACTS.get('queue-diagnostics/job_fixture.json')).json();processingHealth(snapshot,Date.now()+PROCESSING_DEADLINE_MS*2);assert.equal(f.attempt().actual,null);assert.equal(f.attempt().reservation,1000000000);f.close();
});
await check('D1 journal outage falls back to durable R2 events and does not break success',async()=>{
  const f=await fixture();f.state.dbFail=sql=>sql.includes('experiment_journal_events');await f.generate();await f.recover();assert.equal(f.job().status,'complete');assert.equal(f.state.calls,1);const events=[...f.state.map].filter(([key])=>key.startsWith('processing-diagnostics/')).map(([,bytes])=>JSON.parse(new TextDecoder().decode(bytes)));assert(has(events,'decoding_png','started'));assert(has(events,'decoding_png','succeeded'));assert(events.every(e=>e.telemetry_degraded));assert(!JSON.stringify(events).includes(confidential));f.close();
});
await check('all telemetry writes fail visibly but successful business processing survives',async()=>{
  const f=await fixture();const before=warnings.length;f.state.dbFail=sql=>sql.includes('experiment_journal_events');f.state.r2Fail=key=>key.startsWith('processing-diagnostics/')||key.startsWith('queue-diagnostics/');await f.generate();await f.recover();assert.equal(f.job().status,'complete');assert.equal(f.state.calls,1);assert(warnings.length>before);assert(warnings.slice(before).some(w=>w.destination==='R2-event'));assert(!JSON.stringify(warnings).includes(confidential));f.close();
});
await check('duplicate concurrent generation and duplicate recovery have one paid claim',async()=>{
  const f=await fixture();await Promise.all([f.generate(),f.generate()]);assert.equal(f.state.calls,1);await f.recover();const originalRaw=await sha(f.state.map.get(f.rawKey));await Promise.all([f.recover(),f.recover()]);await f.generate();assert.equal(f.state.calls,1);assert.equal(f.job().status,'complete');assert.equal(await sha(f.state.map.get(f.rawKey)),originalRaw);assert.equal(f.db.prepare('SELECT count(*) n FROM attempts').get().n,1);f.close();
});
await check('stale execution remains unconfirmed with no status/billing change or automatic retry',async()=>{
  const f=await fixture();await f.generate();let now=1000000;const p=createProcessing(f.env,{id:'job_fixture',run_id:'run_fixture'},{clock:()=>now});await p.event('decoding_png','started',{headers:confidential,prompt:confidential,error:Error(confidential)});const snapshot=await(await f.env.ARTIFACTS.get('queue-diagnostics/job_fixture.json')).json();const stale=processingHealth(snapshot,now+PROCESSING_DEADLINE_MS+1);assert.equal(stale.stale,true);assert.equal(stale.processing_outcome,'unconfirmed');assert.equal(stale.automatic_retry_allowed,false);assert.equal(f.job().status,'running');assert.equal(f.attempt().actual,cost);assert.equal(f.state.calls,1);assert(!JSON.stringify(snapshot).includes(confidential));await p.end('complete');assert.equal(processingHealth(await(await f.env.ARTIFACTS.get('queue-diagnostics/job_fixture.json')).json(),now+PROCESSING_DEADLINE_MS*2).stale,false);f.close();
});
await check('handled failure plus D1 status outage is explicit and acknowledged without resend',async()=>{
  const f=await fixture({pngOperations:{...fastPNG,resize:()=>{throw Error(confidential);}}});await f.generate();f.state.dbFail=sql=>sql.startsWith('UPDATE jobs SET status=CASE');const before=f.state.acks;await f.recover();assert.equal(f.state.acks,before+1);assert.equal(f.state.calls,1);assert.equal(f.job().status,'running');assert(warnings.some(w=>w.event==='queue-failure-status-write-failed'));const snapshot=await(await f.env.ARTIFACTS.get('queue-diagnostics/job_fixture.json')).json();assert.equal(snapshot.stage,'status_write_failed');assert.equal(f.attempt().actual,cost);f.close();
});
await check('codec awaits persisted phase start before executing and emits failure end',async()=>{
  const trace=[];await assert.rejects(()=>finalPNG(raw,async(stage,detail)=>{await Promise.resolve();trace.push(stage+':'+detail.outcome);},{},{decode:()=>{assert.deepEqual(trace,['decoding_png:started']);throw Error('PNG CRC');}}));assert.deepEqual(trace,['decoding_png:started','decoding_png:failed']);
});
await check('journal summaries preserve stale execution despite duplicate progress and correlate handoff',async()=>{
  const f=await fixture();await f.generate();let now=1000000;
  const original=createProcessing(f.env,{id:'job_fixture',run_id:'run_fixture'},{clock:()=>now});await original.event('decoding_png','started');
  const duplicate=createProcessing(f.env,{id:'job_fixture',run_id:'run_fixture'},{clock:()=>now});await duplicate.event('replay_prevented','succeeded',{},'skipped');
  const summary=processingExecutions(f.events().map(payload=>({event_type:'processing_stage',payload})),now+PROCESSING_DEADLINE_MS+1);
  assert.equal(summary.find(e=>e.execution_id===original.executionId).stale,true);assert.equal(summary.find(e=>e.execution_id===duplicate.executionId).stale,false);
  await f.recover();const journal=await journalRead(f.env,'job_fixture');assert.equal(journal.processing_executions.find(e=>e.execution_id===f.state.sent[0].parentExecutionId).processing_state,'handed_off');assert.equal(journal.unresolved_provider_outcome,false);f.close();
});
await check('R2 diagnostic failure retains D1 stage history and successful result',async()=>{
  const f=await fixture();f.state.r2Fail=key=>key.startsWith('queue-diagnostics/');await f.generate();await f.recover();assert.equal(f.job().status,'complete');assert(has(f.events(),'decoding_png','started'));assert(has(f.events(),'decoding_png','succeeded'));assert(has(f.events(),'complete','succeeded'));assert.equal(f.state.calls,1);f.close();
});
await check('missing legacy provider events use explicit stage outcomes, never stale deadlines',async()=>{
  const f=await fixture();await f.generate();const env={...f.env,DB:{prepare(sql){if(sql.startsWith('SELECT * FROM experiment_journal_events'))return {bind(){return this;},async all(){return {results:f.db.prepare("SELECT * FROM experiment_journal_events WHERE event_type='processing_stage' AND payload_json NOT LIKE '%succeeded%' ORDER BY created_at,event_id").all()};}};return f.env.DB.prepare(sql);}}};
  assert.equal((await journalRead(env,'job_fixture')).unresolved_provider_outcome,true);f.close();
});
await check('owner Recover enqueue failure is visible and clears running without provider resend',async()=>{
  const f=await fixture();await f.generate();f.state.sendFail=true;
  const response=await f.worker.fetch(new Request('https://fixture.invalid/api/recover',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://fixture.invalid'},body:JSON.stringify({jobId:'job_fixture'})}),f.env);
  assert.equal(response.status,503);assert.equal(f.job().status,'needs_review');assert.equal(f.attempt().actual,cost);assert.equal(f.state.calls,1);assert.equal(await sha(f.state.map.get(f.rawKey)),await sha(raw));assert(has(f.events(),'finalization_send','failed'));f.close();
});
await check('modular foreground write failure keeps composition provenance and raw through recovery',async()=>{
  const f=await fixture({generation:{mode:'modular',category:'C1',background:'transparent'}});await f.generate();f.state.r2Fail=key=>key.endsWith('/foreground.png');await f.recover();
  assert.equal(f.job().status,'needs_review');assert(has(f.events(),'foreground_r2_write','failed'));assert(has(f.events(),'composing_card','succeeded'));assert.equal(f.attempt().actual,cost);
  f.state.r2Fail=null;await f.recover();assert.equal(f.job().status,'complete');assert.equal(f.state.calls,1);assert.equal(await sha(f.state.map.get(f.rawKey)),await sha(raw));
  const m=await(await f.env.ARTIFACTS.get('runs/run_fixture/card/manifest.json')).json();assert.equal(m.generation.mode,'modular');assert.equal(m.foreground_sha256,await sha(f.state.map.get(m.foreground_key)));assert.equal(m.final_opaque,true);f.close();
});
await check('whole-card alpha rejection retains raw and reports safe contract error',async()=>{
  const f=await fixture({generation:{mode:'whole_card',category:'C4',background:'opaque'}});await f.generate();await f.recover();assert.equal(f.job().status,'needs_review');assert.equal(f.attempt().actual,cost);assert.equal(f.state.calls,1);
  const failure=f.events().find(e=>e.stage==='source_alpha_validation'&&e.outcome==='failed');assert.equal(failure.error.code,'GENERATION_CONTRACT_FAILED');assert.equal(await sha(f.state.map.get(f.rawKey)),await sha(raw));assert.equal(f.state.map.has('runs/run_fixture/card/final.png'),false);f.close();
});
console.log(JSON.stringify({passed,externalRequests:0,paidRequests:0,telemetryWarningsCaptured:warnings.length}));
}finally{console.error=originalError;}
