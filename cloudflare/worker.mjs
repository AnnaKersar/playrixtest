import { authenticate } from './auth.mjs';
import { sha, imageRequest, IMAGE_MODEL, PROVIDER_VERSION, usageCost } from './provider.mjs';
import { mockPNG, finalPNG, decodePNG } from './png.mjs';
import { planMock, PLANNER_VERSION } from './planner-contract.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const query=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const one=(env,sql,...args)=>query(env,sql,...args).first();
const all=async(env,sql,...args)=>(await query(env,sql,...args).all()).results;
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(value);
async function bodyJSON(request,max=2000000){if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON required');const reader=request.body?.getReader();if(!reader)fail(400,'Body required');const parts=[];let size=0;while(true){const{value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail(413,'Body too large');}parts.push(value);}try{return JSON.parse(await new Blob(parts).text());}catch{fail(400,'Invalid JSON');}}
async function putJSON(env,key,value){await env.ARTIFACTS.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});}
async function getJSON(env,key){const value=await env.ARTIFACTS.get(key);if(!value)throw Error('Missing private artifact');return value.json();}
async function readiness(env){const missing=['DB','ARTIFACTS','IMAGE_JOBS','ASSETS'].filter(k=>!env[k]);let schema=false;if(env.DB)try{schema=(await one(env,'SELECT version FROM schema_version WHERE version=1'))?.version===1;}catch{}if(!schema)missing.push('schema.sql migration');return {version:'cloud-worker/v1',missing,mock_ready:missing.length===0,live_enabled:env.LIVE_GENERATION_ENABLED==='true',live_missing:[...missing,...(!env.OPENAI_API_KEY?['OPENAI_API_KEY Secret']:[]),...(!env.REFERENCE_MANIFEST_KEY||!env.APPROVED_REFERENCE_MANIFEST_SHA256?['pinned reference manifest']:[]),...(!env.APPROVED_ART_DIRECTION_SHA256?['pinned Art Direction']:[])],planner:{version:PLANNER_VERSION,live:false},editor:'bootstrap review; private calibrated v9 editor not deployed',billing:'Mock has no provider charges; infrastructure usage may be billed.'};}
async function requireReady(env){const state=await readiness(env);if(!state.mock_ready)fail(503,'Missing: '+state.missing.join(', '));}
async function references(env){
  if(!env.REFERENCE_MANIFEST_KEY||!env.APPROVED_REFERENCE_MANIFEST_SHA256||!env.APPROVED_ART_DIRECTION_SHA256)throw Error('Private pins not provisioned');
  const obj=await env.ARTIFACTS.get(env.REFERENCE_MANIFEST_KEY);if(!obj)throw Error('Missing reference manifest');const text=await obj.text();if(await sha(text)!==env.APPROVED_REFERENCE_MANIFEST_SHA256)throw Error('Reference manifest pin mismatch');const m=JSON.parse(text);
  if(m.version!=='reference-pack/v1'||m.reference_count!==50||m.model!==IMAGE_MODEL||m.art_direction_sha256!==env.APPROVED_ART_DIRECTION_SHA256||typeof m.art_direction!=='string'||await sha(m.art_direction)!==m.art_direction_sha256||!Array.isArray(m.sheets)||m.sheets.length!==13)throw Error('Frozen reference contract mismatch');
  if(m.sheets.some((s,i)=>s.count!==(i===12?2:4)||!s.key?.startsWith('references/')||!/^[a-f0-9]{64}$/.test(s.sha256)))throw Error('Reference sheet contract mismatch');
  const sheets=[];for(const s of m.sheets){const o=await env.ARTIFACTS.get(s.key);if(!o)throw Error('Missing sheet');const bytes=new Uint8Array(await o.arrayBuffer());if(await sha(bytes)!==s.sha256)throw Error('Reference SHA mismatch');const image=await decodePNG(bytes);if(image.width!==896||image.height!==1040)throw Error('Reference dimensions');sheets.push(bytes);}return {manifest:m,sheets};
}
async function dispatch(env){const rows=await all(env,"SELECT job_id FROM outbox WHERE state='pending' LIMIT 100");let count=0;for(const row of rows){await env.IMAGE_JOBS.send({version:1,jobId:row.job_id});await query(env,"UPDATE outbox SET state='sent' WHERE job_id=?",row.job_id).run();count++;}return count;}
async function createRun(env,body){
  const mode=body.mode||'mock';if(!['mock','live'].includes(mode))fail(400,'Invalid mode');const objects=body.objects;
  if(!Array.isArray(objects)||!objects.length||objects.length>20||new Set(objects.map(o=>o.object_id)).size!==objects.length||objects.some(o=>!safeId(o.object_id)||o.object_id.length>60||typeof o.brief!=='string'||!o.brief.trim()||o.brief.length>12000))fail(400,'Provide 1-20 distinct IDs and briefs');
  let manifest=null;if(mode==='live'){
    if(env.LIVE_GENERATION_ENABLED!=='true'||!env.OPENAI_API_KEY)fail(403,'Live generation disabled');
    if(body.approval!=='I approve one paid attempt per object')fail(400,'Explicit per-run paid approval required');
    const budget=await one(env,'SELECT * FROM budget WHERE id=1');if(!budget?.approved)fail(409,'Approved budget baseline required');manifest=(await references(env)).manifest;
  }
  const runId=crypto.randomUUID(),frozen={version:'run/v1',id:runId,mode,model:IMAGE_MODEL,provider_version:PROVIDER_VERSION,planner_version:PLANNER_VERSION,native:[1376,1536],final:[860,960],quality:'medium',background:'transparent',reference_manifest_sha:mode==='live'?env.APPROVED_REFERENCE_MANIFEST_SHA256:null,art_direction_sha:manifest?.art_direction_sha256||null,objects:objects.map(o=>({object_id:o.object_id,name:String(o.name||o.object_id).slice(0,200),prompt:manifest?`${manifest.art_direction}\n\nOBJECT\n${o.brief}`:`Synthetic mock fixture only.\n${o.brief}`}))};
  const text=JSON.stringify(frozen),key=`runs/${runId}/frozen.json`;await env.ARTIFACTS.put(key,text,{httpMetadata:{contentType:'application/json'}});
  const statements=[query(env,'INSERT INTO runs VALUES (?,?,?,?,?,?)',runId,mode,String(body.name||'Untitled study').slice(0,200),key,await sha(text),new Date().toISOString())];
  for(const object of objects){const jobId=`${runId}_${object.object_id}`;statements.push(query(env,'INSERT INTO jobs (id,run_id,object_id) VALUES (?,?,?)',jobId,runId,object.object_id),query(env,'INSERT INTO outbox (job_id) VALUES (?)',jobId));}await env.DB.batch(statements);
  let queuePending=false;try{await dispatch(env);}catch{queuePending=true;}return {runId,mode,queue_pending:queuePending};
}
async function finishReceipt(env,job,attempt){
  const receipt=await getJSON(env,attempt.receipt_key),raw=await env.ARTIFACTS.get(receipt.raw_key);if(!raw)throw Error('Missing stored raw PNG');const bytes=new Uint8Array(await raw.arrayBuffer());if(await sha(bytes)!==receipt.raw_sha256)throw Error('Stored raw SHA mismatch');
  const final=await finalPNG(bytes),finalKey=`runs/${job.run_id}/${job.object_id}/final.png`,manifestKey=`runs/${job.run_id}/${job.object_id}/manifest.json`;
  const manifest={version:'image-result/v1',job_id:job.id,mode:attempt.mode,provider:PROVIDER_VERSION,model:IMAGE_MODEL,native:[1376,1536],final:[860,960],resampler:'premultiplied-lanczos3-js/v1',raw_sha256:receipt.raw_sha256,final_sha256:await sha(final),request_id:receipt.request_id,usage:receipt.usage,cost_nanodollars:receipt.cost,artistic_review:'unreviewed',alpha:'RGBA8',raw_key:receipt.raw_key,final_key:finalKey};
  await env.ARTIFACTS.put(finalKey,final,{httpMetadata:{contentType:'image/png'}});await putJSON(env,manifestKey,manifest);
  await env.DB.batch([query(env,'INSERT OR REPLACE INTO results VALUES (?,?,?,?)',job.id,receipt.raw_key,finalKey,manifestKey),query(env,"UPDATE attempts SET status='complete',actual=?,error=NULL WHERE job_id=?",receipt.cost,job.id),query(env,"UPDATE jobs SET status='complete' WHERE id=?",job.id)]);
}
export async function processJob(env,jobId,deps={}){
  const job=await one(env,'SELECT * FROM jobs WHERE id=?',jobId);if(!job)return;
  const previous=await one(env,'SELECT * FROM attempts WHERE job_id=?',jobId);if(previous)return; // all ambiguous attempts are permanently non-replayable
  const run=await one(env,'SELECT * FROM runs WHERE id=?',job.run_id),frozenObject=await env.ARTIFACTS.get(run.frozen_key);if(!frozenObject)throw Error('Missing frozen run');const text=await frozenObject.text();if(await sha(text)!==run.frozen_sha)throw Error('Frozen SHA mismatch');const frozen=JSON.parse(text),object=frozen.objects.find(o=>o.object_id===job.object_id);if(!object)throw Error('Missing frozen object');
  let sheets=[];if(run.mode==='live'){
    if(env.LIVE_GENERATION_ENABLED!=='true'||!env.OPENAI_API_KEY)throw Error('Live disabled before claim');
    if(frozen.reference_manifest_sha!==env.APPROVED_REFERENCE_MANIFEST_SHA256||frozen.art_direction_sha!==env.APPROVED_ART_DIRECTION_SHA256)throw Error('Frozen pins changed');sheets=(await references(env)).sheets;
  }
  const reserve=run.mode==='live'?1000000000:0;
  // Single atomic statement: both duplicate claims and concurrent budget oversubscription are rejected.
  const claimed=await query(env,`INSERT OR IGNORE INTO attempts (job_id,mode,status,reservation,created_at)
    SELECT ?,?,'claimed',?,? WHERE ?='mock' OR EXISTS (SELECT 1 FROM budget b WHERE b.id=1 AND b.approved=1 AND b.historical_unknown=0
    AND NOT EXISTS (SELECT 1 FROM attempts WHERE mode='live' AND (status<>'complete' OR actual IS NULL))
    AND b.historical_known+COALESCE((SELECT SUM(COALESCE(actual,reservation)) FROM attempts WHERE mode='live'),0)+?<=b.ceiling)`,job.id,run.mode,reserve,new Date().toISOString(),run.mode,reserve).run();
  if(!claimed.meta.changes){await query(env,"UPDATE jobs SET status='blocked' WHERE id=? AND NOT EXISTS (SELECT 1 FROM attempts WHERE job_id=?)",job.id,job.id).run();return;}
  try{
    await query(env,"UPDATE jobs SET status='running' WHERE id=?",job.id).run();
    const answer=run.mode==='mock'?{png:await mockPNG(1376,1536),usage:null,requestId:null}:await (deps.provider||imageRequest)(env,object.prompt,sheets);
    const rawKey=`runs/${job.run_id}/${job.object_id}/raw.png`,receiptKey=`runs/${job.run_id}/${job.object_id}/receipt.json`,cost=run.mode==='mock'?0:usageCost(answer.usage);
    await env.ARTIFACTS.put(rawKey,answer.png,{httpMetadata:{contentType:'image/png'}});
    await putJSON(env,receiptKey,{raw_key:rawKey,raw_sha256:await sha(answer.png),usage:answer.usage,request_id:answer.requestId,cost});
    await query(env,"UPDATE attempts SET status='received',receipt_key=? WHERE job_id=?",receiptKey,job.id).run();
    await finishReceipt(env,job,{mode:run.mode,receipt_key:receiptKey});
  }catch(error){
    await env.DB.batch([query(env,"UPDATE attempts SET status='unknown',error=? WHERE job_id=?",String(error.message).slice(0,500),job.id),query(env,"UPDATE jobs SET status='needs_review' WHERE id=?",job.id)]);
  }
}
async function saveCandidates(env,b){if(!safeId(b.jobId))fail(400,'Invalid job');const job=await one(env,"SELECT id FROM jobs WHERE id=? AND status='complete'",b.jobId);if(!job)fail(409,'Completed job required');if(!Array.isArray(b.alternatives)||b.alternatives.length!==3||new Set(b.alternatives.map(a=>a.id)).size!==3||b.alternatives.some(a=>!safeId(a.id)||!a.config))fail(400,'Three distinct configurations required');const payload=JSON.stringify(b.alternatives),hash=await sha(payload);await query(env,'INSERT OR IGNORE INTO candidates VALUES (?,?,?)',b.jobId,payload,hash).run();const saved=await one(env,'SELECT * FROM candidates WHERE job_id=?',b.jobId);if(saved.payload_sha!==hash)fail(409,'Candidates immutable');return {saved:true};}
async function saveChoice(env,b){
  if(!safeId(b.jobId)||!safeId(b.eventId)||!Number.isSafeInteger(b.revision)||b.revision<1||!['select','none','skip','undo'].includes(b.action))fail(400,'Invalid choice');
  const row=await one(env,'SELECT * FROM candidates WHERE job_id=?',b.jobId);if(!row)fail(409,'Freeze candidates first');if(b.action==='select'&&!JSON.parse(row.payload).some(a=>a.id===b.selected))fail(400,'Unknown candidate');
  const payload=JSON.stringify({action:b.action,selected:b.action==='select'?b.selected:null,diagnostics:b.diagnostics||{},material:b.material||{}}),hash=await sha(JSON.stringify([b.jobId,b.revision,payload]));
  const prior=await one(env,'SELECT * FROM review_events WHERE event_id=?',b.eventId);if(prior){if(prior.payload_sha!==hash)fail(409,'Event ID conflict');return {saved:true,revision:prior.revision,idempotent:true};}
  const statements=[query(env,`INSERT INTO review_events SELECT ?,?,?,?,?,? WHERE ?=COALESCE((SELECT revision FROM choices WHERE job_id=?),0)+1`,b.eventId,b.jobId,b.revision,hash,payload,new Date().toISOString(),b.revision,b.jobId),query(env,`INSERT INTO choices SELECT job_id,revision,payload FROM review_events WHERE event_id=? ON CONFLICT(job_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload WHERE excluded.revision>choices.revision`,b.eventId)];
  let result;try{result=await env.DB.batch(statements);}catch{fail(409,'Revision conflict');}if(!result[0].meta.changes)fail(409,'Revision conflict');return {saved:true,revision:b.revision};
}
export function createWorker(deps={}){return {
  async fetch(request,env){
    const auth=await authenticate(request,env,deps.authFetch);if(auth.error)return json({error:auth.error},auth.status);
    const url=new URL(request.url);if(!['GET','HEAD','POST'].includes(request.method))return json({error:'Method not allowed'},405);
    if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'Same-origin request required'},403);
    try{
      if(url.pathname==='/api/preflight'&&request.method==='GET')return json(await readiness(env));
      if(url.pathname.startsWith('/api/')){
        await requireReady(env);
        if(request.method==='GET'){
          if(url.pathname==='/api/studies')return json({runs:await all(env,`SELECT r.*,COUNT(j.id) total,SUM(j.status='complete') complete FROM runs r LEFT JOIN jobs j ON r.id=j.run_id GROUP BY r.id ORDER BY created_at DESC`),budget:await one(env,'SELECT * FROM budget WHERE id=1'),attempts:await all(env,'SELECT * FROM attempts')});
          if(url.pathname==='/api/run'){const runId=url.searchParams.get('run');if(!safeId(runId))fail(400,'Invalid run');return json({run:await one(env,'SELECT * FROM runs WHERE id=?',runId),jobs:await all(env,'SELECT j.*,r.final_key,r.manifest_key,c.payload alternatives,ch.revision,ch.payload choice FROM jobs j LEFT JOIN results r ON r.job_id=j.id LEFT JOIN candidates c ON c.job_id=j.id LEFT JOIN choices ch ON ch.job_id=j.id WHERE j.run_id=?',runId)});}
          if(url.pathname==='/api/export'){const runId=url.searchParams.get('run');if(!safeId(runId))fail(400,'Invalid run');const run=await one(env,'SELECT * FROM runs WHERE id=?',runId);if(!run)fail(404,'Run not found');return json({version:'study-export/v1',run,frozen:await getJSON(env,run.frozen_key),jobs:await all(env,'SELECT * FROM jobs WHERE run_id=?',runId),events:await all(env,'SELECT e.* FROM review_events e JOIN jobs j ON e.job_id=j.id WHERE j.run_id=? ORDER BY e.created_at',runId),candidates:await all(env,'SELECT c.* FROM candidates c JOIN jobs j ON c.job_id=j.id WHERE j.run_id=?',runId)});}
          if(url.pathname==='/api/asset'){const jobId=url.searchParams.get('job'),kind=url.searchParams.get('kind')||'final';if(!safeId(jobId)||!['raw','final','manifest'].includes(kind))fail(400,'Invalid asset');const row=await one(env,'SELECT * FROM results WHERE job_id=?',jobId);if(!row)fail(404,'Asset not found');const object=await env.ARTIFACTS.get(row[kind+'_key']);if(!object)fail(404,'Asset not found');return new Response(object.body,{headers:{'Content-Type':kind==='manifest'?'application/json':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
        }else if(request.method==='POST'){
          const body=await bodyJSON(request);
          if(url.pathname==='/api/plan-mock')return json(await planMock(body));
          if(url.pathname==='/api/runs')return json(await createRun(env,body),201);
          if(url.pathname==='/api/dispatch')return json({sent:await dispatch(env)});
          if(url.pathname==='/api/candidates')return json(await saveCandidates(env,body));
          if(url.pathname==='/api/choices')return json(await saveChoice(env,body));
          if(url.pathname==='/api/recover'){
            if(!safeId(body.jobId))fail(400,'Invalid job');const job=await one(env,'SELECT * FROM jobs WHERE id=?',body.jobId),attempt=await one(env,'SELECT * FROM attempts WHERE job_id=?',body.jobId);if(!job||!attempt||attempt.status==='complete')fail(409,'No recoverable attempt');
            const receiptKey=`runs/${job.run_id}/${job.object_id}/receipt.json`;if(!await env.ARTIFACTS.head(receiptKey))fail(409,'No durable receipt; billing reconciliation required, no automatic resend');await finishReceipt(env,job,{...attempt,receipt_key:receiptKey});return json({recovered:true,provider_calls:0});
          }
        }
        fail(404,'Unknown API route');
      }
      if(!env.ASSETS)fail(503,'ASSETS binding missing');
      const asset=await env.ASSETS.fetch(request),headers=new Headers(asset.headers);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");return new Response(asset.body,{status:asset.status,headers});
    }catch(error){return json({error:error.status?error.message:'Storage or configuration failure; no automatic provider retry.'},error.status||503);}
  },
  async queue(batch,env){for(const message of batch.messages){try{if(message.body?.version===1&&safeId(message.body.jobId))await processJob(env,message.body.jobId,deps);message.ack();}catch{message.ack();}}}
};}
export default createWorker();
