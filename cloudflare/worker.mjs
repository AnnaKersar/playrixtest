import {ownerOnly,generationRole,runAccess,jobAccess,redactRun} from './roles.mjs';
import {budgetState,claimPaid,reservationFor} from './budget.mjs';
import {createPlan,processPlan,recoverPlan} from './text-planner.mjs';
import {privateEditor} from './private-editor.mjs';
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
async function readiness(env){const missing=['DB','ARTIFACTS','IMAGE_JOBS','ASSETS'].filter(k=>!env[k]);let schema=false;if(env.DB)try{schema=(await one(env,'SELECT version FROM schema_version WHERE version=3'))?.version===3;}catch{}if(!schema)missing.push('schema.sql migration');return {version:'cloud-worker/v1',missing,mock_ready:missing.length===0,review_ready:missing.filter(k=>k!=='IMAGE_JOBS').length===0,live_enabled:env.LIVE_GENERATION_ENABLED==='true',live_missing:[...missing,...(!env.OPENAI_API_KEY?['OPENAI_API_KEY Secret']:[]),...(!env.REFERENCE_MANIFEST_KEY||!env.APPROVED_REFERENCE_MANIFEST_SHA256?['pinned reference manifest']:[]),...(!env.APPROVED_ART_DIRECTION_SHA256?['pinned Art Direction']:[])],budget:env.DB&&schema?await budgetState(env):null,planner:{version:PLANNER_VERSION,live:env.LIVE_PLANNER_ENABLED==='true'},editor:(env.EDITOR_MANIFEST_KEY&&env.EDITOR_MANIFEST_SHA256)||(env.ARTIFACTS&&await env.ARTIFACTS.get('private-editor/active.json'))?'private-package-configured':'not-provisioned',billing:'Mock has no provider charges; infrastructure usage may be billed.'};}
async function requireReady(env,pathname){const state=await readiness(env);const queuePaths=new Set(['/api/runs','/api/dispatch','/api/recover','/api/plan-live','/api/planner-recover']);const missing=state.missing.filter(k=>k!=='IMAGE_JOBS'||queuePaths.has(pathname));if(missing.length)fail(503,'Missing: '+missing.join(', '));}
async function references(env){
  if(!env.REFERENCE_MANIFEST_KEY||!env.APPROVED_REFERENCE_MANIFEST_SHA256||!env.APPROVED_ART_DIRECTION_SHA256)throw Error('Private pins not provisioned');
  const obj=await env.ARTIFACTS.get(env.REFERENCE_MANIFEST_KEY);if(!obj)throw Error('Missing reference manifest');const text=await obj.text();if(await sha(text)!==env.APPROVED_REFERENCE_MANIFEST_SHA256)throw Error('Reference manifest pin mismatch');const m=JSON.parse(text);
  if(m.version!=='reference-pack/v1'||m.reference_count!==50||m.model!==IMAGE_MODEL||m.art_direction_sha256!==env.APPROVED_ART_DIRECTION_SHA256||typeof m.art_direction!=='string'||await sha(m.art_direction)!==m.art_direction_sha256||!Array.isArray(m.sheets)||m.sheets.length!==13)throw Error('Frozen reference contract mismatch');
  if(m.sheets.some((s,i)=>s.count!==(i===12?2:4)||!s.key?.startsWith('references/')||!/^[a-f0-9]{64}$/.test(s.sha256)))throw Error('Reference sheet contract mismatch');
  const sheets=[];for(const s of m.sheets){const o=await env.ARTIFACTS.get(s.key);if(!o)throw Error('Missing sheet');const bytes=new Uint8Array(await o.arrayBuffer());if(await sha(bytes)!==s.sha256)throw Error('Reference SHA mismatch');const image=await decodePNG(bytes);if(image.width!==896||image.height!==1040)throw Error('Reference dimensions');sheets.push(bytes);}return {manifest:m,sheets};
}
async function dispatch(env){const rows=await all(env,"SELECT job_id FROM outbox WHERE state='pending' LIMIT 100");let count=0;for(const row of rows){await env.IMAGE_JOBS.send({version:1,jobId:row.job_id});await query(env,"UPDATE outbox SET state='sent' WHERE job_id=?",row.job_id).run();count++;}return count;}
async function createRun(env,body,auth){
  generationRole(auth);
  const mode=body.mode||'mock';if(!['mock','live'].includes(mode))fail(400,'Invalid mode');const objects=body.objects;
  if(!Array.isArray(objects)||!objects.length||objects.length>20||new Set(objects.map(o=>o.object_id)).size!==objects.length||objects.some(o=>!safeId(o.object_id)||o.object_id.length>60||typeof o.brief!=='string'||!o.brief.trim()||o.brief.length>12000))fail(400,'Provide 1-20 distinct IDs and briefs');
  let manifest=null;if(mode==='live'){
    if(env.LIVE_GENERATION_ENABLED!=='true'||!env.OPENAI_API_KEY)fail(403,'Live generation disabled');
    if(body.approval!=='I approve one paid attempt per object')fail(400,'Explicit per-run paid approval required');
    const budget=await one(env,'SELECT * FROM budget WHERE id=1');if(!budget?.approved)fail(409,'Approved budget baseline required');const state=await budgetState(env);if(state.live_blockers.length)fail(409,state.live_blockers.join(', '));reservationFor(env,'image',auth.principalId);manifest=(await references(env)).manifest;
  }
  const runId=crypto.randomUUID(),frozen={version:'run/v1',id:runId,mode,principal_id:auth.principalId,reservation:mode==='live'?reservationFor(env,'image',auth.principalId):0,model:IMAGE_MODEL,provider_version:PROVIDER_VERSION,planner_version:PLANNER_VERSION,native:[1376,1536],final:[860,960],quality:'medium',background:'transparent',reference_manifest_sha:mode==='live'?env.APPROVED_REFERENCE_MANIFEST_SHA256:null,art_direction_sha:manifest?.art_direction_sha256||null,objects:objects.map(o=>({object_id:o.object_id,name:String(o.name||o.object_id).slice(0,200),prompt:manifest?`${manifest.art_direction}\n\nOBJECT\n${o.brief}`:`Synthetic mock fixture only.\n${o.brief}`}))};
  const text=JSON.stringify(frozen),key=`runs/${runId}/frozen.json`;await env.ARTIFACTS.put(key,text,{httpMetadata:{contentType:'application/json'}});
  const statements=[query(env,'INSERT INTO runs (id,mode,name,frozen_key,frozen_sha,created_at,principal_id) VALUES (?,?,?,?,?,?,?)',runId,mode,String(body.name||'Untitled study').slice(0,200),key,await sha(text),new Date().toISOString(),auth.principalId)];
  for(const object of objects){const jobId=`${runId}_${object.object_id}`;statements.push(query(env,'INSERT INTO jobs (id,run_id,object_id) VALUES (?,?,?)',jobId,runId,object.object_id),query(env,'INSERT INTO outbox (job_id) VALUES (?)',jobId));}await env.DB.batch(statements);
  let queuePending=false;try{await dispatch(env);}catch{queuePending=true;}return {runId,mode,queue_pending:queuePending};
}
async function finishReceipt(env,job,attempt){
  const receipt=await getJSON(env,attempt.receipt_key),raw=await env.ARTIFACTS.get(receipt.raw_key);if(!raw)throw Error('Missing stored raw PNG');const bytes=new Uint8Array(await raw.arrayBuffer());if(await sha(bytes)!==receipt.raw_sha256)throw Error('Stored raw SHA mismatch');
  const final=await finalPNG(bytes),finalKey=`runs/${job.run_id}/${job.object_id}/final.png`,manifestKey=`runs/${job.run_id}/${job.object_id}/manifest.json`;
  const manifest={version:'image-result/v1',job_id:job.id,mode:attempt.mode,provider:PROVIDER_VERSION,model:IMAGE_MODEL,native:[1376,1536],final:[860,960],resampler:'premultiplied-lanczos3-js/v1',raw_sha256:receipt.raw_sha256,final_sha256:await sha(final),request_id:receipt.request_id,usage:receipt.usage,cost_nanodollars:receipt.cost,artistic_review:'unreviewed',alpha:'RGBA8',raw_key:receipt.raw_key,final_key:finalKey};
  await env.ARTIFACTS.put(finalKey,final,{httpMetadata:{contentType:'image/png'}});await putJSON(env,manifestKey,manifest);
  await env.DB.batch([query(env,'INSERT OR REPLACE INTO results VALUES (?,?,?,?)',job.id,receipt.raw_key,finalKey,manifestKey),query(env,"UPDATE attempts SET status=CASE WHEN ?>reservation THEN 'cost_bound_exceeded' ELSE 'complete' END,actual=?,error=NULL WHERE job_id=?",receipt.cost,receipt.cost,job.id),query(env,"UPDATE jobs SET status='complete' WHERE id=?",job.id)]);
}
export async function processJob(env,jobId,deps={}){
  const job=await one(env,'SELECT * FROM jobs WHERE id=?',jobId);if(!job)return;
  const previous=await one(env,'SELECT * FROM attempts WHERE job_id=?',jobId);if(previous)return; // all ambiguous attempts are permanently non-replayable
  const run=await one(env,'SELECT * FROM runs WHERE id=?',job.run_id),frozenObject=await env.ARTIFACTS.get(run.frozen_key);if(!frozenObject)throw Error('Missing frozen run');const text=await frozenObject.text();if(await sha(text)!==run.frozen_sha)throw Error('Frozen SHA mismatch');const frozen=JSON.parse(text),object=frozen.objects.find(o=>o.object_id===job.object_id);if(!object)throw Error('Missing frozen object');
  let sheets=[];if(run.mode==='live'){
    if(env.LIVE_GENERATION_ENABLED!=='true'||!env.OPENAI_API_KEY)throw Error('Live disabled before claim');
    if(frozen.reference_manifest_sha!==env.APPROVED_REFERENCE_MANIFEST_SHA256||frozen.art_direction_sha!==env.APPROVED_ART_DIRECTION_SHA256)throw Error('Frozen pins changed');sheets=(await references(env)).sheets;
  }
  const reserve=run.mode==='live'?(frozen.reservation||reservationFor(env,'image',run.principal_id)):0;
  const claimed=run.mode==='live'?await claimPaid(env,job.id,reserve,run.principal_id):Boolean((await query(env,"INSERT OR IGNORE INTO attempts (job_id,mode,status,reservation,created_at,principal_id,budget_scope) VALUES (?,'mock','claimed',0,?,?,'owner')",job.id,new Date().toISOString(),run.principal_id).run()).meta.changes);
  if(!claimed){await query(env,"UPDATE jobs SET status='blocked' WHERE id=? AND NOT EXISTS (SELECT 1 FROM attempts WHERE job_id=?)",job.id,job.id).run();return;}
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
async function saveCandidates(env,b,auth){const access=await jobAccess(env,auth,b.jobId);const run=await one(env,'SELECT principal_id FROM runs WHERE id=?',access.run_id);if(auth.role!=='owner'&&run.principal_id!==auth.principalId)fail(403,'Only study creator can freeze candidates');if(!safeId(b.jobId))fail(400,'Invalid job');const job=await one(env,"SELECT id FROM jobs WHERE id=? AND status='complete'",b.jobId);if(!job)fail(409,'Completed job required');if(!Array.isArray(b.alternatives)||b.alternatives.length!==3||new Set(b.alternatives.map(a=>a.id)).size!==3||b.alternatives.some(a=>!safeId(a.id)||!a.config))fail(400,'Three distinct configurations required');const payload=JSON.stringify(b.alternatives),hash=await sha(payload);await query(env,'INSERT OR IGNORE INTO candidates VALUES (?,?,?)',b.jobId,payload,hash).run();const saved=await one(env,'SELECT * FROM candidates WHERE job_id=?',b.jobId);if(saved.payload_sha!==hash)fail(409,'Candidates immutable');return {saved:true};}
async function saveChoice(env,b,auth){
  if(!safeId(b.jobId)||!safeId(b.eventId)||!Number.isSafeInteger(b.revision)||b.revision<1||!['select','none','skip','undo'].includes(b.action))fail(400,'Invalid choice');
  await jobAccess(env,auth,b.jobId);const principal=auth.principalId;
  const row=await one(env,'SELECT * FROM candidates WHERE job_id=?',b.jobId);if(!row)fail(409,'Freeze candidates first');if(b.action==='select'&&!JSON.parse(row.payload).some(a=>a.id===b.selected))fail(400,'Unknown candidate');
  const payload=JSON.stringify({action:b.action,selected:b.action==='select'?b.selected:null,diagnostics:b.diagnostics||{},material:b.material||{}}),hash=await sha(JSON.stringify([principal,b.jobId,b.revision,payload]));
  const prior=await one(env,'SELECT * FROM review_events_v2 WHERE principal_id=? AND event_id=?',principal,b.eventId);if(prior){if(prior.payload_sha!==hash)fail(409,'Event ID conflict');return {saved:true,revision:prior.revision,idempotent:true};}
  const statements=[query(env,`INSERT INTO review_events_v2 SELECT ?,?,?,?,?,?,? WHERE ?=COALESCE((SELECT revision FROM choices_v2 WHERE principal_id=? AND job_id=?),0)+1`,principal,b.eventId,b.jobId,b.revision,hash,payload,new Date().toISOString(),b.revision,principal,b.jobId),query(env,`INSERT INTO choices_v2 SELECT principal_id,job_id,revision,payload FROM review_events_v2 WHERE principal_id=? AND event_id=? ON CONFLICT(principal_id,job_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload WHERE excluded.revision>choices_v2.revision`,principal,b.eventId)];
  let result;try{result=await env.DB.batch(statements);}catch{fail(409,'Revision conflict');}if(!result[0].meta.changes)fail(409,'Revision conflict');return {saved:true,revision:b.revision};
}
export function createWorker(deps={}){return {
  async fetch(request,env){
    const auth=await (deps.authenticate||authenticate)(request,env,deps.authFetch);if(auth.error)return json({error:auth.error},auth.status);
    const url=new URL(request.url);if(!['GET','HEAD','POST'].includes(request.method))return json({error:'Method not allowed'},405);
    if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'Same-origin request required'},403);
    try{
      if(url.pathname.startsWith('/editor/')&&request.method==='GET')return await privateEditor(request,env);
      if(url.pathname==='/api/preflight'&&request.method==='GET'){const state=await readiness(env);if(auth.role!=='owner'){state.budget=state.budget?{guest_ceiling:state.budget.guest_ceiling,guest_remaining:state.budget.guest_remaining,live_blockers:state.budget.live_blockers}:null;delete state.live_missing;}return json({...state,role:auth.role,principalId:auth.principalId});}
      if(url.pathname.startsWith('/api/')){
        await requireReady(env,url.pathname);
        if(request.method==='GET'){
          if(url.pathname==='/api/planner'){const requestId=url.searchParams.get('id');if(!safeId(requestId))fail(400,'Invalid planner ID');const row=await one(env,'SELECT * FROM planner_requests WHERE id=?',requestId);if(!row)fail(404,'Planner request not found');if(auth.role!=='owner'&&row.principal_id!==auth.principalId)fail(403,'Planner access denied');return json({id:row.id,status:row.status,result:row.result_key?await getJSON(env,row.result_key):null});}
          if(url.pathname==='/api/budget'){ownerOnly(auth);return json(await budgetState(env));}
          if(url.pathname==='/api/studies'){const rows=await all(env,`SELECT r.*,COUNT(j.id) total,SUM(j.status='complete') complete FROM runs r LEFT JOIN jobs j ON r.id=j.run_id WHERE ?='owner' OR r.principal_id=? OR EXISTS(SELECT 1 FROM run_access a WHERE a.run_id=r.id AND a.principal_id=?) GROUP BY r.id ORDER BY created_at DESC`,auth.role,auth.principalId,auth.principalId);return json({runs:rows.map(redactRun),...(auth.role==='owner'?{budget:await budgetState(env),attempts:await all(env,'SELECT * FROM attempts')}:{})});}
          if(url.pathname==='/api/run'){const runId=url.searchParams.get('run');if(!safeId(runId))fail(400,'Invalid run');const run=await runAccess(env,auth,runId);return json({run:redactRun(run),jobs:await all(env,'SELECT j.*,c.payload alternatives,ch.revision,ch.payload choice FROM jobs j LEFT JOIN candidates c ON c.job_id=j.id LEFT JOIN choices_v2 ch ON ch.job_id=j.id AND ch.principal_id=? WHERE j.run_id=?',auth.principalId,runId)});}
          if(url.pathname==='/api/export'){ownerOnly(auth);const runId=url.searchParams.get('run');if(!safeId(runId))fail(400,'Invalid run');const run=await one(env,'SELECT * FROM runs WHERE id=?',runId);if(!run)fail(404,'Run not found');return json({version:'study-export/v1',run,frozen:await getJSON(env,run.frozen_key),jobs:await all(env,'SELECT * FROM jobs WHERE run_id=?',runId),events:await all(env,'SELECT e.* FROM review_events_v2 e JOIN jobs j ON e.job_id=j.id WHERE j.run_id=? ORDER BY e.created_at',runId),candidates:await all(env,'SELECT c.* FROM candidates c JOIN jobs j ON c.job_id=j.id WHERE j.run_id=?',runId)});}
          if(url.pathname==='/api/image-info'){const jobId=url.searchParams.get('job');if(!safeId(jobId))fail(400,'Invalid job');await jobAccess(env,auth,jobId);const row=await one(env,'SELECT manifest_key FROM results WHERE job_id=?',jobId);if(!row)fail(404,'Image not ready');const m=await getJSON(env,row.manifest_key);return json({final_sha256:m.final_sha256,final:m.final,alpha:m.alpha});}
          if(url.pathname==='/api/asset'){const jobId=url.searchParams.get('job'),kind=url.searchParams.get('kind')||'final';if(!safeId(jobId)||!['raw','final','manifest'].includes(kind))fail(400,'Invalid asset');await jobAccess(env,auth,jobId);if(kind!=='final')ownerOnly(auth);const row=await one(env,'SELECT * FROM results WHERE job_id=?',jobId);if(!row)fail(404,'Asset not found');const object=await env.ARTIFACTS.get(row[kind+'_key']);if(!object)fail(404,'Asset not found');return new Response(object.body,{headers:{'Content-Type':kind==='manifest'?'application/json':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
        }else if(request.method==='POST'){
          const body=await bodyJSON(request);
          if(url.pathname==='/api/plan-live')return json(await createPlan(env,body,auth),202);
          if(url.pathname==='/api/planner-recover'){ownerOnly(auth);if(!safeId(body.requestId))fail(400,'Invalid planner ID');return json(await recoverPlan(env,body.requestId));}
          if(url.pathname==='/api/plan-mock'){generationRole(auth);return json(await planMock(body));}
          if(url.pathname==='/api/runs')return json(await createRun(env,body,auth),201);
          if(url.pathname==='/api/dispatch'){ownerOnly(auth);return json({sent:await dispatch(env)});}
          if(url.pathname==='/api/candidates')return json(await saveCandidates(env,body,auth));
          if(url.pathname==='/api/choices')return json(await saveChoice(env,body,auth));
          if(url.pathname==='/api/recover'){ownerOnly(auth);
            if(!safeId(body.jobId))fail(400,'Invalid job');const job=await one(env,'SELECT * FROM jobs WHERE id=?',body.jobId),attempt=await one(env,'SELECT * FROM attempts WHERE job_id=?',body.jobId);if(!job||!attempt||attempt.status==='complete')fail(409,'No recoverable attempt');
            const receiptKey=`runs/${job.run_id}/${job.object_id}/receipt.json`;if(!await env.ARTIFACTS.head(receiptKey))fail(409,'No durable receipt; billing reconciliation required, no automatic resend');await finishReceipt(env,job,{...attempt,receipt_key:receiptKey});return json({recovered:true,provider_calls:0});
          }
        }
        fail(404,'Unknown API route');
      }
      if(!env.ASSETS)fail(503,'ASSETS binding missing');
      const asset=await env.ASSETS.fetch(request),headers=new Headers(asset.headers);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");return new Response(asset.body,{status:asset.status,headers});
    }catch(error){return json({error:error.status?error.message:'Storage or configuration failure; no automatic provider retry.'},error.status||503);}
  },
  async queue(batch,env){for(const message of batch.messages){try{if(message.body?.version===1&&safeId(message.body.jobId)){if(message.body.kind==='planner')await processPlan(env,message.body.jobId,deps.textProvider);else await processJob(env,message.body.jobId,deps);}message.ack();}catch{message.ack();}}}
};}
export default createWorker();
