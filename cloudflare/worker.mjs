import {createProcessing,processingHealth,safeProcessingError} from './processing-diagnostics.mjs';
import {ART_DIRECTION_RULE_VERSION,artDirectionRule} from './art-direction-policy.mjs';
import {generationContract,validateAlpha} from './generation-contract.mjs';
import {proceduralCard,COMPOSITION_VERSION} from './procedural-card.mjs';
import {attemptPacket} from './attempt-archive.mjs';
import {compileObjectPrompt,OBJECT_CONTENT_POLICY_VERSION} from './object-content-policy.mjs';
import {referenceEnvironment} from './reference-import.mjs';
import {experimentContext,journalPrepare,journalEvent,journalRead,journalFeedback} from './experiment-journal.mjs';
import {ownerOnly,generationRole,runAccess,jobAccess,redactRun} from './roles.mjs';
import {budgetState,claimPaid,reservationFor} from './budget.mjs';
import {createPlan,processPlan,recoverPlan,plannerConfiguration} from './text-planner.mjs';
import {privateEditor} from './private-editor.mjs';
import { authenticate } from './auth.mjs';
import { sha, imageRequest, IMAGE_MODEL, PROVIDER_VERSION, usageCost } from './provider.mjs';
import { mockPNG, finalPNG, encodePNG, decodePNG, pinnedReferencePNG } from './png.mjs';
import { planMock, PLANNER_VERSION } from './planner-contract.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
async function contractMockPNG(contract,size=[1376,1536]){const bytes=await mockPNG(...size);if(contract?.background!=='opaque')return bytes;const image=proceduralCard(await decodePNG(bytes),'C1');return encodePNG(image.width,image.height,image.rgba);}
const query=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const one=(env,sql,...args)=>query(env,sql,...args).first();
const all=async(env,sql,...args)=>(await query(env,sql,...args).all()).results;
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(value);
async function bodyJSON(request,max=2000000){if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON required');const reader=request.body?.getReader();if(!reader)fail(400,'Body required');const parts=[];let size=0;while(true){const{value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail(413,'Body too large');}parts.push(value);}try{return JSON.parse(await new Blob(parts).text());}catch{fail(400,'Invalid JSON');}}
async function putJSON(env,key,value){await env.ARTIFACTS.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});}
async function getJSON(env,key){const value=await env.ARTIFACTS.get(key);if(!value)throw Error('Missing private artifact');return value.json();}
async function accountingEvidence(env,attempt){
  const job=await one(env,'SELECT run_id,object_id FROM jobs WHERE id=?',attempt.job_id);
  const canonical=job?'runs/'+job.run_id+'/'+job.object_id+'/receipt.json':null;
  const receiptKey=canonical||attempt.receipt_key;
  const receipt=receiptKey?await env.ARTIFACTS.get(receiptKey):null;
  let journal=null;try{journal=await journalRead(env,attempt.job_id);}catch(error){if(error.status!==404)throw error;}
  const evidence={receipt_key:receiptKey,receipt_present:!!receipt,journal};
  if(receipt&&job){
    const value=await receipt.json(),rawKey='runs/'+job.run_id+'/'+job.object_id+'/raw.png';
    if(value.raw_key!==rawKey)throw Error('Accounting receipt path mismatch');
    const raw=await env.ARTIFACTS.get(rawKey);
    evidence.raw_present=!!raw;evidence.raw_sha_matches=raw?await sha(new Uint8Array(await raw.arrayBuffer()))===value.raw_sha256:false;
    evidence.usage=value.usage;evidence.usage_cost_nanodollars=usageCost(value.usage);evidence.receipt_cost_nanodollars=value.cost;
  }
  return evidence;
}
async function readiness(env){const missing=['DB','ARTIFACTS','IMAGE_JOBS','ASSETS'].filter(k=>!env[k]);let schema=false;if(env.DB)try{schema=(await one(env,'SELECT version FROM schema_version WHERE version=3'))?.version===3;}catch{}if(!schema)missing.push('schema.sql migration');let journalReady=false;if(env.DB)try{journalReady=!!await one(env,'SELECT version FROM schema_version WHERE version=5');}catch{}return {version:'cloud-worker/v1',missing,journal_ready:journalReady,mock_ready:missing.length===0,review_ready:missing.filter(k=>k!=='IMAGE_JOBS').length===0,live_enabled:env.LIVE_GENERATION_ENABLED==='true',live_missing:[...missing,...(!journalReady?['experiment journal migration']:[]),...(!env.OPENAI_API_KEY?['OPENAI_API_KEY Secret']:[]),...(!env.REFERENCE_MANIFEST_KEY||!env.APPROVED_REFERENCE_MANIFEST_SHA256?['pinned reference manifest']:[]),...(!env.APPROVED_ART_DIRECTION_SHA256?['pinned Art Direction']:[])],budget:env.DB&&schema?await budgetState(env):null,planner:{version:PLANNER_VERSION,live:env.LIVE_PLANNER_ENABLED==='true',...plannerConfiguration(env)},editor:(env.EDITOR_MANIFEST_KEY&&env.EDITOR_MANIFEST_SHA256)||(env.ARTIFACTS&&await env.ARTIFACTS.get('private-editor/active.json'))?'private-package-configured':'not-provisioned',billing:'Mock has no provider charges; infrastructure usage may be billed.'};}
async function requireReady(env,pathname){const state=await readiness(env);const queuePaths=new Set(['/api/runs','/api/requeue-run','/api/dispatch','/api/recover','/api/plan-live','/api/planner-recover']);const missing=state.missing.filter(k=>k!=='IMAGE_JOBS'||queuePaths.has(pathname));if(queuePaths.has(pathname)&&!state.journal_ready)missing.push('experiment journal migration');if(missing.length)fail(503,'Missing: '+missing.join(', '));}
async function queueDiagnostic(env,jobId,stage,detail={}){const safe={stage,at:new Date().toISOString(),...detail};if(safe.error)safe.error=String(safe.error).split(env.OPENAI_API_KEY||'__NO_KEY__').join('[redacted]').slice(0,500);try{await putJSON(env,'queue-diagnostics/'+jobId+'.json',safe);}catch{console.error(JSON.stringify({event:'queue-diagnostic-write-failed',job_id:jobId,stage}));}}
async function readQueueDiagnostic(env,jobId){try{const o=await env.ARTIFACTS.get('queue-diagnostics/'+jobId+'.json');return o?processingHealth(await o.json()):null;}catch{return {stage:'diagnostic_unavailable'};}}
async function references(env,{manifestOnly=false}={}){
  if(!env.REFERENCE_MANIFEST_KEY||!env.APPROVED_REFERENCE_MANIFEST_SHA256||!env.APPROVED_ART_DIRECTION_SHA256)throw Error('Private pins not provisioned');
  const obj=await env.ARTIFACTS.get(env.REFERENCE_MANIFEST_KEY);if(!obj)throw Error('Missing reference manifest');const text=await obj.text();if(await sha(text)!==env.APPROVED_REFERENCE_MANIFEST_SHA256)throw Error('Reference manifest pin mismatch');const m=JSON.parse(text);
  if(m.version!=='reference-pack/v1'||m.reference_count!==50||m.model!==IMAGE_MODEL||m.art_direction_sha256!==env.APPROVED_ART_DIRECTION_SHA256||typeof m.art_direction!=='string'||await sha(m.art_direction)!==m.art_direction_sha256||!Array.isArray(m.sheets)||m.sheets.length!==13)throw Error('Frozen reference contract mismatch');
  if(m.sheets.some((s,i)=>s.count!==(i===12?2:4)||!s.key?.startsWith('references/')||!/^[a-f0-9]{64}$/.test(s.sha256)))throw Error('Reference sheet contract mismatch');
  if(manifestOnly)return {manifest:m,sheets:[]};
  const sheets=[];for(const s of m.sheets){const o=await env.ARTIFACTS.get(s.key);if(!o)throw Error('Missing sheet');const bytes=new Uint8Array(await o.arrayBuffer());if(await sha(bytes)!==s.sha256)throw Error('Reference SHA mismatch');pinnedReferencePNG(bytes);sheets.push(bytes);}return {manifest:m,sheets};
}
async function dispatch(env){const rows=await all(env,"SELECT job_id FROM outbox WHERE state='pending' LIMIT 100");let count=0;for(const row of rows){await env.IMAGE_JOBS.send({version:1,jobId:row.job_id});await query(env,"UPDATE outbox SET state='sent' WHERE job_id=?",row.job_id).run();count++;}return count;}
async function createRun(env,body,auth){
  generationRole(auth);
  const mode=body.mode||'mock';if(!['mock','live'].includes(mode))fail(400,'Invalid mode');const objects=body.objects;
  if(!Array.isArray(objects)||!objects.length||objects.length>20||new Set(objects.map(o=>o.object_id)).size!==objects.length||objects.some(o=>!safeId(o.object_id)||o.object_id.length>60||typeof o.brief!=='string'||!o.brief.trim()||o.brief.length>12000))fail(400,'Provide 1-20 distinct IDs and briefs');
  let manifest=null;if(mode==='live'){
    if(env.LIVE_GENERATION_ENABLED!=='true'||!env.OPENAI_API_KEY)fail(403,'Live generation disabled');
    if(objects.some(o=>!['C1','C2','C3','C4'].includes(o.category)||o.generation_mode!=='whole_card'))fail(409,'Эта коллекция должна генерироваться целиком. Обновите страницу перед новым запуском; модульная генерация отключена.');
    if(body.approval!=='I approve one paid attempt per object')fail(400,'Explicit per-run paid approval required');
    const budget=await one(env,'SELECT * FROM budget WHERE id=1');if(!budget?.approved)fail(409,'Approved budget baseline required');const state=await budgetState(env);if(state.live_blockers.length)fail(409,state.live_blockers.join(', '));reservationFor(env,'image',auth.principalId);manifest=(await references(env,{manifestOnly:true})).manifest;
  }
  if(body.planner_request_id!==undefined){if(!safeId(body.planner_request_id))fail(400,'Invalid planner request');const origin=await one(env,'SELECT principal_id FROM planner_requests WHERE id=?',body.planner_request_id);if(!origin||origin.principal_id!==auth.principalId)fail(403,'Planner origin access denied');}
  if(body.requestId!==undefined&&!safeId(body.requestId))fail(400,'Invalid stable request ID');
  if(body.category_names!==undefined&&(!Array.isArray(body.category_names)||body.category_names.length>20||body.category_names.some(n=>typeof n!=='string'||n.length>300)))fail(400,'Invalid thematic category names');
  const context=experimentContext(body);const runId=body.requestId?'run_'+(await sha(auth.principalId+'|'+body.requestId)).slice(0,48):crypto.randomUUID(),frozen={version:'run/v1',id:runId,category_names:body.category_names||[],experiment:context,mode,...(body.planner_request_id?{planner_request_id:body.planner_request_id}:{}),principal_id:auth.principalId,reservation:mode==='live'?reservationFor(env,'image',auth.principalId):0,model:IMAGE_MODEL,provider_version:PROVIDER_VERSION,planner_version:PLANNER_VERSION,object_content_policy_version:OBJECT_CONTENT_POLICY_VERSION,art_direction_rule_version:ART_DIRECTION_RULE_VERSION,art_direction_rule_sha256:await sha(artDirectionRule),native:[864,960],final:[864,960],quality:'medium',background:'transparent',reference_manifest_sha:mode==='live'?env.APPROVED_REFERENCE_MANIFEST_SHA256:null,art_direction_sha:manifest?.art_direction_sha256||null,objects:objects.map(o=>({...(o.category?{generation:generationContract(o.category,o.generation_mode,runId+'|'+o.object_id)}:{}),object_id:o.object_id,thematic_category:typeof o.thematic_category==='string'?o.thematic_category.slice(0,300):null,name:String(o.name||o.object_id).slice(0,200),category:['C1','C2','C3','C4'].includes(o.category)?o.category:null,asset_stage:o.category==='C3'?'object_with_surface':o.category==='C4'?'scene':'foreground',prompt:manifest?compileObjectPrompt(manifest,o.brief,o.category?generationContract(o.category,o.generation_mode,runId+'|'+o.object_id):null):`Synthetic mock fixture only.\n${o.brief}`}))};
  const text=JSON.stringify(frozen),key=`runs/${runId}/frozen-${await sha(text)}.json`;const prior=await one(env,'SELECT frozen_sha FROM runs WHERE id=?',runId);if(prior){if(prior.frozen_sha!==await sha(text))fail(409,'requestId input conflict');return {runId,mode,idempotent:true};}await env.ARTIFACTS.put(key,text,{httpMetadata:{contentType:'application/json'}});
  const statements=[query(env,'INSERT OR IGNORE INTO runs (id,mode,name,frozen_key,frozen_sha,created_at,principal_id) VALUES (?,?,?,?,?,?,?)',runId,mode,String(body.name||'Untitled study').slice(0,200),key,await sha(text),new Date().toISOString(),auth.principalId)];
  for(const object of objects){const jobId=`${runId}_${object.object_id}`;statements.push(query(env,'INSERT OR IGNORE INTO jobs (id,run_id,object_id) VALUES (?,?,?)',jobId,runId,object.object_id),query(env,'INSERT OR IGNORE INTO outbox (job_id) VALUES (?)',jobId));}await env.DB.batch(statements);const saved=await one(env,'SELECT frozen_sha FROM runs WHERE id=?',runId);if(saved.frozen_sha!==await sha(text))fail(409,'requestId input conflict');
  let queuePending=false;try{await dispatch(env);}catch{queuePending=true;}return {runId,mode,queue_pending:queuePending};
}
async function finishReceipt(env,job,attempt,processing,deps={}){
  const {receipt,bytes}=await processing.stage('read_raw_receipt',async()=>{
    const receipt=await getJSON(env,attempt.receipt_key),raw=await env.ARTIFACTS.get(receipt.raw_key);
    if(!raw)throw Error('Missing stored raw PNG');
    const bytes=new Uint8Array(await raw.arrayBuffer());
    if(await sha(bytes)!==receipt.raw_sha256)throw Error('Stored raw SHA mismatch');
    return {receipt,bytes};
  },{},value=>({input_bytes:value.bytes.length}));
  const savedRun=await one(env,'SELECT frozen_key FROM runs WHERE id=?',job.run_id),savedFrozen=await getJSON(env,savedRun.frozen_key);
  const directSize=savedFrozen.native?.[0]===864&&savedFrozen.native?.[1]===960?savedFrozen.native:null;
  const contract=await processing.stage('read_generation_contract',async()=>{
    const run=await one(env,'SELECT frozen_key FROM runs WHERE id=?',job.run_id),frozen=await getJSON(env,run.frozen_key);
    return frozen.objects.find(o=>o.object_id===job.object_id)?.generation;
  });
  let sourceQA=null,decodedSource=null;
  if(contract){
    const source=await processing.stage('source_decoding_png',()=>decodePNG(bytes),{input_bytes:bytes.length},image=>({width:image.width,height:image.height,channels:image.channels}));
    decodedSource=source;sourceQA=await processing.stage('source_alpha_validation',()=>validateAlpha(source,contract));
  }
  const foreground=await finalPNG(bytes,(stage,detail)=>processing.phase(stage,detail),{allowRGB:contract?.background==='opaque',directSize},{...deps.pngOperations,...(directSize&&decodedSource&&!deps.pngOperations?.decode?{decode:async()=>decodedSource}:{})});
  let final=foreground,composition=null,foregroundKey=null;
  if(contract?.mode==='modular'){
    const layer=await processing.stage('foreground_decoding_png',()=>directSize&&decodedSource?decodedSource:decodePNG(foreground),{input_bytes:foreground.length},image=>({width:image.width,height:image.height,channels:image.channels}));
    const card=await processing.stage('composing_card',()=>{const card=proceduralCard(layer,contract.category,{shadowMode:contract.shadow_mode,surfaceMode:contract.surface_mode,surfaceFinish:contract.surface_finish});validateAlpha(card,{mode:'whole_card'});return card;});
    final=await processing.stage('composition_encoding_png',()=>encodePNG(card.width,card.height,card.rgba),{width:card.width,height:card.height},bytes=>({output_bytes:bytes.length}));
    composition=card.composition;foregroundKey=`runs/${job.run_id}/${job.object_id}/foreground.png`;
    await processing.stage('foreground_r2_write',()=>env.ARTIFACTS.put(foregroundKey,foreground,{httpMetadata:{contentType:'image/png'}}),{input_bytes:foreground.length});
  }
  const finalKey=`runs/${job.run_id}/${job.object_id}/final.png`,manifestKey=`runs/${job.run_id}/${job.object_id}/manifest.json`;
  const manifest={version:'image-result/v1',job_id:job.id,mode:attempt.mode,provider:PROVIDER_VERSION,model:IMAGE_MODEL,native:savedFrozen.native,final:savedFrozen.final,resampler:directSize?'none-direct-native/v1':'premultiplied-lanczos3-js/v1',raw_sha256:receipt.raw_sha256,final_sha256:await sha(final),request_id:receipt.request_id,usage:receipt.usage,cost_nanodollars:receipt.cost,artistic_review:'unreviewed',alpha:'RGBA8',...(contract?{generation:contract,source_alpha_qa:sourceQA,composition,foreground_key:foregroundKey,foreground_sha256:foregroundKey?await sha(foreground):null,final_opaque:true}:{}),raw_key:receipt.raw_key,final_key:finalKey};
  await processing.stage('final_r2_write',async()=>{
    await env.ARTIFACTS.put(finalKey,final,{httpMetadata:{contentType:'image/png'}});
    await putJSON(env,manifestKey,manifest);
  },{output_bytes:final.length});
  await processing.stage('final_d1_status',()=>env.DB.batch([
    query(env,'INSERT OR REPLACE INTO results VALUES (?,?,?,?)',job.id,receipt.raw_key,finalKey,manifestKey),
    query(env,"UPDATE attempts SET status=CASE WHEN ?>reservation THEN 'cost_bound_exceeded' ELSE 'complete' END,actual=?,error=NULL WHERE job_id=?",receipt.cost,receipt.cost,job.id),
    query(env,"UPDATE jobs SET status='complete' WHERE id=?",job.id)
  ]));
  await processing.journal('storage-recovered','storage_recovered',{raw_sha256:manifest.raw_sha256,final_sha256:manifest.final_sha256,manifest_sha256:await sha(JSON.stringify(manifest)),usage_calculated_cost_nanodollars:receipt.cost,invoice_actual_cost_nanodollars:null,final_dimensions:savedFrozen.final});
}
export async function reassembleStored(env,jobId,auth,options={}){
 ownerOnly(auth);const lightDirection=options.lightDirection||'auto';if(!['auto','upper-left','upper-right','lower-left','lower-right'].includes(lightDirection))fail(400,'Invalid light direction');if(!safeId(jobId))fail(400,'Invalid job');await jobAccess(env,auth,jobId);
 const job=await one(env,'SELECT * FROM jobs WHERE id=?',jobId),result=await one(env,'SELECT * FROM results WHERE job_id=?',jobId);
 if(job?.status!=='complete'||!result)fail(409,'Completed result required');
 const previous=await getJSON(env,result.manifest_key);
 if(previous.generation?.category!=='C2'&&lightDirection!=='auto')fail(400,'Light override applies to C2 surface only');
 if(previous.generation?.mode!=='modular'||!previous.foreground_key)fail(409,'Stored transparent modular foreground required');
 if(previous.composition?.version===COMPOSITION_VERSION&&(previous.composition?.surface?.shadow?.lighting?.override||'auto')===lightDirection)return {assembled:true,provider_calls:0,idempotent:true,composition:previous.composition};
 const processing=createProcessing(env,job,{kind:'assembly-rebuild'});await processing.event('assembly_started','started');
 const object=await env.ARTIFACTS.get(previous.foreground_key);if(!object)fail(409,'Stored foreground missing');
 const bytes=new Uint8Array(await object.arrayBuffer());if(await sha(bytes)!==previous.foreground_sha256)fail(409,'Foreground SHA mismatch');
 const layer=await processing.stage('assembly_source_decode',()=>decodePNG(bytes));validateAlpha(layer,previous.generation);
 const card=await processing.stage('assembly_render',()=>proceduralCard(layer,previous.generation.category,{lightDirection,shadowMode:previous.generation.shadow_mode,surfaceMode:previous.generation.surface_mode,surfaceFinish:previous.generation.surface_finish}));validateAlpha(card,{mode:'whole_card'});
 const final=await processing.stage('assembly_png_encode',()=>encodePNG(card.width,card.height,card.rgba)),hash=await sha(final),assemblyId=crypto.randomUUID(),prefix=`runs/${job.run_id}/${job.object_id}/assemblies/${assemblyId}`;
 const manifest={...previous,final_key:prefix+'.png',final_sha256:hash,composition:card.composition,artistic_review:'unreviewed',assembly_cost_nanodollars:0,assembly_created_at:new Date().toISOString(),previous_assemblies:[...(previous.previous_assemblies||[]),{final_key:result.final_key,manifest_key:result.manifest_key,final_sha256:previous.final_sha256}]};
 await processing.stage('assembly_store',async()=>{await env.ARTIFACTS.put(manifest.final_key,final,{httpMetadata:{contentType:'image/png'}});await putJSON(env,prefix+'.json',manifest);});
 const changed=await query(env,'UPDATE results SET final_key=?,manifest_key=? WHERE job_id=? AND final_key=?',manifest.final_key,prefix+'.json',jobId,result.final_key).run();
 if(!changed.meta.changes)fail(409,'Result changed during assembly; refresh before retrying');
 await journalEvent(env,jobId,'assembly-'+assemblyId,'assembly_rebuilt',{assembly_id:assemblyId,version:COMPOSITION_VERSION,provider_calls:0,foreground_sha256:previous.foreground_sha256,final_sha256:hash,previous_final_sha256:previous.final_sha256,surface:card.composition.surface});
 await processing.end('complete');
 return {assembled:true,provider_calls:0,composition:card.composition};
}
export async function saveEditorAssembly(env,b,auth){
 ownerOnly(auth);if(!safeId(b.jobId)||b.rendererVersion!==COMPOSITION_VERSION)fail(400,'Invalid editor assembly');await jobAccess(env,auth,b.jobId);
 const job=await one(env,'SELECT * FROM jobs WHERE id=?',b.jobId),result=await one(env,'SELECT * FROM results WHERE job_id=?',b.jobId);if(job?.status!=='complete'||!result)fail(409,'Completed result required');
 const previous=await getJSON(env,result.manifest_key);if(previous.generation?.mode!=='modular'||!previous.foreground_key)fail(409,'Stored modular foreground required');
 if(b.expectedForegroundSHA!==previous.foreground_sha256||b.expectedFinalSHA!==previous.final_sha256)fail(409,'Card changed; refresh before assembly');
 const c=b.composition,light=c?.surface?.shadow?.lighting;
 if(c?.version!==COMPOSITION_VERSION||!['gold','purple','cyan','pink','green'].includes(c.palette)||c.objectAssembly?.sourceUnchanged!==true||typeof b.pngBase64!=='string'||b.pngBase64.length>7*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.pngBase64))fail(400,'Invalid composition contract');
 if(previous.generation.category==='C2'&&previous.generation.surface_mode!=='generated'&&(c.surface?.heightFraction!==.30||c.surface?.shadow?.source!==(previous.generation.shadow_mode==='generated-alpha'?'generated-alpha':'subject-alpha-copy')||previous.generation.shadow_mode==='generated-alpha'&&c.surface?.shadow?.editorAdded!==false||light?.scope!=='surface-only'||!Array.isArray(light.lightVector)||!Array.isArray(light.shadowVector)||light.lightVector.length!==2||light.shadowVector.length!==2||light.lightVector.some((n,i)=>!Number.isFinite(n)||light.shadowVector[i]!==-n)))fail(400,'Invalid C2 surface or shadow');
 if(previous.generation.surface_mode==='generated'&&(c.surface?.source!=='generated'||c.surface?.finish!==previous.generation.surface_finish||c.surface?.shadow?.editorAdded!==false||c.objectAssembly?.scale!==1||c.objectAssembly?.dx!==0||c.objectAssembly?.dy!==0))fail(400,'Generated surface must be preserved');
 const processing=createProcessing(env,job,{kind:'editor-assembly-save'}),bytes=Uint8Array.from(atob(b.pngBase64),n=>n.charCodeAt(0));
 const card=await processing.stage('editor_png_decode',()=>decodePNG(bytes));if(card.width!==previous.final[0]||card.height!==previous.final[1])fail(400,'Final dimensions changed');validateAlpha(card,{mode:'whole_card'});
 const hash=await sha(bytes);if(hash===previous.final_sha256&&previous.composition?.version===COMPOSITION_VERSION&&(previous.composition.surface?.shadow?.lighting?.override||'auto')===(light?.override||'auto'))return {assembled:true,provider_calls:0,idempotent:true,composition:previous.composition};
 const assemblyId=crypto.randomUUID(),prefix=`runs/${job.run_id}/${job.object_id}/assemblies/${assemblyId}`,manifest={...previous,final_key:prefix+'.png',final_sha256:hash,composition:c,assembly_renderer:'browser-procedural-editor',artistic_review:'unreviewed',assembly_cost_nanodollars:0,assembly_created_at:new Date().toISOString(),previous_assemblies:[...(previous.previous_assemblies||[]),{final_key:result.final_key,manifest_key:result.manifest_key,final_sha256:previous.final_sha256}]};
 await processing.stage('editor_assembly_store',async()=>{await env.ARTIFACTS.put(manifest.final_key,bytes,{httpMetadata:{contentType:'image/png'}});await putJSON(env,prefix+'.json',manifest);});
 const changed=await query(env,'UPDATE results SET final_key=?,manifest_key=? WHERE job_id=? AND final_key=?',manifest.final_key,prefix+'.json',job.id,result.final_key).run();if(!changed.meta.changes)fail(409,'Result changed during assembly; refresh before retrying');
 await journalEvent(env,job.id,'assembly-'+assemblyId,'assembly_rebuilt',{assembly_id:assemblyId,version:COMPOSITION_VERSION,renderer:'browser-procedural-editor',provider_calls:0,foreground_sha256:previous.foreground_sha256,final_sha256:hash,previous_final_sha256:previous.final_sha256,surface:c.surface});await processing.end('complete');
 return {assembled:true,provider_calls:0,composition:c};
}
async function sendFinalization(env,job,processing){
  await processing.stage('finalization_send',()=>env.IMAGE_JOBS.send({version:1,kind:'image-recovery',jobId:job.id,parentExecutionId:processing.executionId}));
  await processing.end('waiting_finalization');
}
export async function processJob(env,jobId,deps={}){
  const job=await one(env,'SELECT * FROM jobs WHERE id=?',jobId);if(!job)return;
  const processing=deps.processing||createProcessing(env,job);await processing.event('queue_receive','succeeded');
  const previous=await one(env,'SELECT * FROM attempts WHERE job_id=?',jobId);if(previous){await processing.event('replay_prevented','succeeded',{},'skipped');return;} // all ambiguous attempts are permanently non-replayable
  const run=await one(env,'SELECT * FROM runs WHERE id=?',job.run_id),frozenObject=await env.ARTIFACTS.get(run.frozen_key);if(!frozenObject)throw Error('Missing frozen run');const text=await frozenObject.text();if(await sha(text)!==run.frozen_sha)throw Error('Frozen SHA mismatch');const frozen=JSON.parse(text),object=frozen.objects.find(o=>o.object_id===job.object_id);if(!object)throw Error('Missing frozen object');
  await processing.event('checking_frozen_input','succeeded');
  if(run.mode==='live'&&object.generation?.mode!=='whole_card'){
    await query(env,"UPDATE jobs SET status='blocked' WHERE id=? AND NOT EXISTS (SELECT 1 FROM attempts WHERE job_id=?)",job.id,job.id).run();
    await processing.end('whole_card_required');return;
  }
  let sheets=[];if(run.mode==='live'){
    if(env.LIVE_GENERATION_ENABLED!=='true'||!env.OPENAI_API_KEY)throw Error('Live disabled before claim');
    if(frozen.reference_manifest_sha!==env.APPROVED_REFERENCE_MANIFEST_SHA256||frozen.art_direction_sha!==env.APPROVED_ART_DIRECTION_SHA256)throw Error('Frozen pins changed');await processing.event('checking_references','started');sheets=(await references(env)).sheets;await processing.event('references_checked','succeeded');
  }
  const sheetHashes=[];await processing.stage('reference_hashes',async()=>{for(const sheet of sheets)sheetHashes.push(await sha(sheet));});
  await processing.stage('journal_prepare',async()=>journalPrepare(env,job.id,{version:'experiment-input/v1',kind:'image',attempt_id:job.id,run_id:job.run_id,principal_id:run.principal_id,mode:run.mode,provider:run.mode==='mock'?'local-mock':'openai',model:frozen.model,provider_version:frozen.provider_version,prompt:object.prompt,prompt_sha256:await sha(object.prompt),parameters:{n:1,size:frozen.native,quality:frozen.quality,background:object.generation?.background||frozen.background,generation_mode:object.generation?.mode||'legacy',shadow_mode:object.generation?.shadow_mode||null,surface_mode:object.generation?.surface_mode||null,surface_finish:object.generation?.surface_finish||null,output_format:'png'},references:{manifest_sha256:frozen.reference_manifest_sha,art_direction_sha256:frozen.art_direction_sha,art_direction_rule_version:frozen.art_direction_rule_version||null,art_direction_rule_sha256:frozen.art_direction_rule_sha256||null,sheet_sha256:sheetHashes},experiment:frozen.experiment||experimentContext(),retry_policy:'one-provider-send; replay forbidden after claim',reservation_nanodollars:frozen.reservation||0,cost_basis:'usage-calculated estimate, not invoice',price_table_nanodollars_per_token:{text_input:5000,image_input:8000,image_output:30000,verification:'existing-code-table; not independently reverified for live admission'},public:false}));
  const reserve=run.mode==='live'?(frozen.reservation||reservationFor(env,'image',run.principal_id)):0;
  const claimed=run.mode==='live'?await claimPaid(env,job.id,reserve,run.principal_id):Boolean((await query(env,"INSERT OR IGNORE INTO attempts (job_id,mode,status,reservation,created_at,principal_id,budget_scope) VALUES (?,'mock','claimed',0,?,?,'owner')",job.id,new Date().toISOString(),run.principal_id).run()).meta.changes);
  if(!claimed){await processing.event('admission_blocked','succeeded',{},'skipped');await query(env,"UPDATE jobs SET status='blocked' WHERE id=? AND NOT EXISTS (SELECT 1 FROM attempts WHERE job_id=?)",job.id,job.id).run();return;}
  let invoked=false;const started=Date.now();
  try{
    await query(env,"UPDATE jobs SET status='running' WHERE id=?",job.id).run();await processing.event('provider_starting','started');
    await processing.journal('provider-started','provider_started',{started_at:new Date(started).toISOString(),mode:run.mode});invoked=true;
    const answer=await processing.stage('provider_response',async()=>run.mode==='mock'?{png:await contractMockPNG(object.generation,frozen.native),usage:null,requestId:null}:await (deps.provider||imageRequest)(env,object.prompt,sheets,undefined,{background:object.generation?.background||frozen.background,size:frozen.native.join('x')}),{},answer=>({output_bytes:answer.png.length}));
    const rawKey=`runs/${job.run_id}/${job.object_id}/raw.png`,receiptKey=`runs/${job.run_id}/${job.object_id}/receipt.json`,cost=run.mode==='mock'?0:usageCost(answer.usage);
    await processing.journal('provider-returned','provider_returned',{finished_at:new Date().toISOString(),elapsed_ms:Date.now()-started,request_id:answer.requestId,requested_model:frozen.model,actual_model:answer.model||null,usage:answer.usage,usage_calculated_cost_nanodollars:cost,reservation_nanodollars:reserve,invoice_actual_cost_nanodollars:null,raw_sha256:await sha(answer.png)});
    await processing.stage('raw_r2_write',()=>env.ARTIFACTS.put(rawKey,answer.png,{httpMetadata:{contentType:'image/png'}}),{input_bytes:answer.png.length});
    const receipt={raw_key:rawKey,raw_sha256:await sha(answer.png),usage:answer.usage,request_id:answer.requestId,cost};
    await processing.stage('receipt_r2_write',()=>putJSON(env,receiptKey,receipt));
    await processing.stage('receipt_d1_status',async()=>{
    await query(env,"UPDATE attempts SET status='received',receipt_key=? WHERE job_id=?",receiptKey,job.id).run();
    // The provider receipt is durable: settle known usage before a separate CPU-heavy finalization job.
    if(cost!==null){await query(env,"UPDATE attempts SET status=CASE WHEN ?>reservation THEN 'cost_bound_exceeded' ELSE 'complete' END,actual=? WHERE job_id=?",cost,cost,job.id).run();}
    });
    await sendFinalization(env,job,processing);
  }catch(error){
    const safe=safeProcessingError(error,processing.failedStage);
    await processing.event('processing_failed','failed',{error});
    await processing.journal('processing-failed',invoked?'provider_or_storage_failed':'provider_not_sent',{at:new Date().toISOString(),elapsed_ms:Date.now()-started,error:safe.message,error_code:safe.code,outcome:invoked?'unknown-or-durable-receipt':'not-sent'});
    // A finalization/queue failure must not erase already settled billing or the claim guard.
    await processing.stage('failure_d1_status',()=>env.DB.batch([
      query(env,"UPDATE attempts SET status=CASE WHEN actual IS NULL THEN 'unknown' ELSE status END,error=? WHERE job_id=?",safe.message,job.id),
      query(env,"UPDATE jobs SET status='needs_review' WHERE id=? AND status<>'complete'",job.id)
    ]));
    await processing.end('needs_review',error);
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
  if(await one(env,'SELECT version FROM schema_version WHERE version=5')){const journalPayload=JSON.stringify({principal_id:principal,revision:b.revision,action:b.action,selected:b.action==='select'?b.selected:null,diagnostics:b.diagnostics||{},material:b.material||{},decision:'relative-preference-only; not production approval'});statements.push(query(env,`INSERT OR IGNORE INTO experiment_journal_events (event_id,attempt_id,event_type,payload_json,payload_sha256,created_at) SELECT ?,?,'review_feedback',?,?,? WHERE EXISTS (SELECT 1 FROM experiment_journal WHERE attempt_id=?) AND EXISTS (SELECT 1 FROM review_events_v2 WHERE principal_id=? AND event_id=?)`,b.jobId+':review:'+principal+':'+b.eventId,b.jobId,journalPayload,await sha(journalPayload),new Date().toISOString(),b.jobId,principal,b.eventId));}
  let result;try{result=await env.DB.batch(statements);}catch{fail(409,'Revision conflict');}if(!result[0].meta.changes)fail(409,'Revision conflict');return {saved:true,revision:b.revision};
}
export function createWorker(deps={}){return {
  async fetch(request,env){
    const auth=await (deps.authenticate||authenticate)(request,env,deps.authFetch);if(auth.error)return json({error:auth.error},auth.status);
    env=await referenceEnvironment(env);const url=new URL(request.url);if(!['GET','HEAD','POST'].includes(request.method))return json({error:'Method not allowed'},405);
    if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'Same-origin request required'},403);
    try{
      if(url.pathname==='/api/budget/close-reserved-unknown'&&request.method==='POST'){
        ownerOnly(auth);const body=await bodyJSON(request);
        if(!safeId(body.jobId)||body.acknowledgeUnknownCost!==true)fail(400,'Explicit unknown-cost acknowledgement required');
        const attempt=await one(env,'SELECT * FROM attempts WHERE job_id=?',body.jobId);
        if(!attempt||attempt.mode!=='live'||attempt.principal_id!=='owner')fail(409,'Owner live attempt required');
        if(attempt.status==='closed_reserved_unknown')return json({closed:true,idempotent:true,reservation:attempt.reservation,actual:null,provider_calls:0});
        if(attempt.actual!=null||attempt.receipt_key||attempt.status!=='claimed'||(Date.now()-Date.parse(attempt.created_at)<20*60*1000&&body.acknowledgeEarlyClosure!==true))fail(409,'Only an expired unresolved claim without a receipt can be closed');
        if(body.expectedReservation!==attempt.reservation)fail(409,'Reservation changed; refresh accounting');
        const evidence=await accountingEvidence(env,attempt);if(evidence.receipt_present)fail(409,'Durable receipt exists; recover instead');
        await journalEvent(env,body.jobId,'manual-reserved-unknown','manual_accounting_closure',{principal_id:auth.principalId,reservation_nanodollars:attempt.reservation,actual_cost_nanodollars:null,invoice_actual_cost_nanodollars:null,decision:'Owner accepts unknown actual charge; original reservation remains committed; provider replay forbidden',provider_calls:0});
        const result=await query(env,"UPDATE attempts SET status='closed_reserved_unknown' WHERE job_id=? AND status='claimed' AND actual IS NULL AND receipt_key IS NULL AND reservation=?",body.jobId,attempt.reservation).run();
        if(!result.meta.changes)fail(409,'Attempt changed; refresh accounting');
        return json({closed:true,reservation:attempt.reservation,actual:null,provider_calls:0});
      }
      if(url.pathname==='/api/journal'&&request.method==='GET'){ownerOnly(auth);return json(await journalRead(env,url.searchParams.get('attempt')));}
      if(url.pathname==='/api/journal/feedback'&&request.method==='POST'){ownerOnly(auth);return json(await journalFeedback(env,await bodyJSON(request)));}
      if(url.pathname.startsWith('/editor/')&&request.method==='GET')return await privateEditor(request,env);
      if(url.pathname==='/api/preflight'&&request.method==='GET'){const state=await readiness(env);if(auth.role!=='owner'){state.budget=state.budget?{guest_ceiling:state.budget.guest_ceiling,guest_remaining:state.budget.guest_remaining,live_blockers:state.budget.live_blockers}:null;delete state.live_missing;}return json({...state,role:auth.role,principalId:auth.principalId});}
      if(url.pathname.startsWith('/api/')){
        await requireReady(env,url.pathname);
        if(request.method==='GET'){
          if(url.pathname==='/api/planner'){const requestId=url.searchParams.get('id');if(!safeId(requestId))fail(400,'Invalid planner ID');const row=await one(env,'SELECT * FROM planner_requests WHERE id=?',requestId);if(!row)fail(404,'Planner request not found');if(auth.role!=='owner'&&row.principal_id!==auth.principalId)fail(403,'Planner access denied');const attempt=await one(env,'SELECT status,created_at,error FROM attempts WHERE job_id=?',requestId);return json({id:row.id,status:row.status,stage:attempt?.status||row.status,started_at:attempt?.created_at||null,...(auth.role==='owner'&&attempt?.error?{error:String(attempt.error).split(env.OPENAI_API_KEY||'__NO_KEY__').join('[redacted]').slice(0,300)}:{}),result:row.result_key?await getJSON(env,row.result_key):null});}
          if(url.pathname==='/api/attempt-packet'){const id=url.searchParams.get('run');if(!safeId(id))fail(400,'Invalid run');return json(await attemptPacket(env,auth,id));}
          if(url.pathname==='/api/budget'){ownerOnly(auth);return json(await budgetState(env));}
          if(url.pathname==='/api/studies'){const rows=await all(env,`SELECT r.*,COUNT(j.id) total,SUM(j.status='complete') complete FROM runs r LEFT JOIN jobs j ON r.id=j.run_id WHERE ?='owner' OR r.principal_id=? OR EXISTS(SELECT 1 FROM run_access a WHERE a.run_id=r.id AND a.principal_id=?) GROUP BY r.id ORDER BY created_at DESC`,auth.role,auth.principalId,auth.principalId);return json({runs:rows.map(redactRun),...(auth.role==='owner'?{budget:await budgetState(env),attempts:await Promise.all((await all(env,'SELECT * FROM attempts')).map(async attempt=>({...attempt,...(attempt.mode==='live'&&(attempt.status!=='complete'||attempt.actual==null)?{accounting_evidence:await accountingEvidence(env,attempt)}:{})})))}:{})});}
          if(url.pathname==='/api/run'){const runId=url.searchParams.get('run');if(!safeId(runId))fail(400,'Invalid run');const run=await runAccess(env,auth,runId);const frozen=await getJSON(env,run.frozen_key),objects=frozen.objects||[];let categoryNames=frozen.category_names||[],categoryMap={};if(frozen.planner_request_id){const planRow=await one(env,'SELECT result_key FROM planner_requests WHERE id=?',frozen.planner_request_id);if(planRow?.result_key){const result=await getJSON(env,planRow.result_key);const groups=result.plan?.collections||[];if(!categoryNames.length)categoryNames=groups.map(c=>c.name);for(const c of groups)for(const o of c.objects||[])categoryMap[o.object_id]=c.name;}}const jobs=await all(env,'SELECT j.*,c.payload alternatives,ch.revision,ch.payload choice FROM jobs j LEFT JOIN candidates c ON c.job_id=j.id LEFT JOIN choices_v2 ch ON ch.job_id=j.id AND ch.principal_id=? WHERE j.run_id=?',auth.principalId,runId);return json({run:{...redactRun(run),category_names:categoryNames},jobs:await Promise.all(jobs.map(async j=>{const object=objects.find(o=>o.object_id===j.object_id);return {...j,queue_diagnostic:auth.role==='owner'?await readQueueDiagnostic(env,j.id):null,name:object?.name||j.object_id,thematic_category:object?.thematic_category||categoryMap[j.object_id]||null,category:['C1','C2','C3','C4'].includes(object?.category)?object.category:null,generation:object?.generation||null,asset_stage:object?.asset_stage||null};}))});}
          if(url.pathname==='/api/export'){ownerOnly(auth);const runId=url.searchParams.get('run');if(!safeId(runId))fail(400,'Invalid run');const run=await one(env,'SELECT * FROM runs WHERE id=?',runId);if(!run)fail(404,'Run not found');return json({version:'study-export/v1',run,frozen:await getJSON(env,run.frozen_key),jobs:await all(env,'SELECT * FROM jobs WHERE run_id=?',runId),events:await all(env,'SELECT e.* FROM review_events_v2 e JOIN jobs j ON e.job_id=j.id WHERE j.run_id=? ORDER BY e.created_at',runId),candidates:await all(env,'SELECT c.* FROM candidates c JOIN jobs j ON c.job_id=j.id WHERE j.run_id=?',runId)});}
          if(url.pathname==='/api/image-info'){const jobId=url.searchParams.get('job');if(!safeId(jobId))fail(400,'Invalid job');await jobAccess(env,auth,jobId);const row=await one(env,'SELECT manifest_key FROM results WHERE job_id=?',jobId);if(!row)fail(404,'Image not ready');const m=await getJSON(env,row.manifest_key);return json({final_sha256:m.final_sha256,foreground_sha256:m.foreground_sha256||null,has_foreground:!!m.foreground_key,generation_mode:m.generation?.mode||'legacy',generation:m.generation||null,final:m.final,alpha:m.alpha,composition:m.composition,has_previous_assembly:!!m.previous_assemblies?.length});}
          if(url.pathname==='/api/asset'){const jobId=url.searchParams.get('job'),kind=url.searchParams.get('kind')||'final';if(!safeId(jobId)||!['raw','final','foreground','manifest','previous'].includes(kind))fail(400,'Invalid asset');await jobAccess(env,auth,jobId);if(!['final','foreground'].includes(kind))ownerOnly(auth);let row=await one(env,'SELECT * FROM results WHERE job_id=?',jobId);if(!row&&kind==='raw'){const job=await one(env,'SELECT run_id,object_id FROM jobs WHERE id=?',jobId),attempt=await one(env,'SELECT receipt_key FROM attempts WHERE job_id=?',jobId);if(job&&attempt?.receipt_key){const receipt=await getJSON(env,attempt.receipt_key),canonical='runs/'+job.run_id+'/'+job.object_id+'/raw.png';if(receipt.raw_key!==canonical)fail(409,'Raw receipt path mismatch');row={raw_key:canonical};}}if(!row)fail(404,'Asset not found');let assetKey=row[kind+'_key'];if(kind==='previous'){const manifest=await getJSON(env,row.manifest_key);assetKey=manifest.previous_assemblies?.at(-1)?.final_key;if(!assetKey)fail(404,'Previous assembly not found');}if(kind==='foreground'){const manifest=await getJSON(env,row.manifest_key);assetKey=manifest.foreground_key||row.final_key;}const object=await env.ARTIFACTS.get(assetKey);if(!object)fail(404,'Asset not found');return new Response(object.body,{headers:{'Content-Type':kind==='manifest'?'application/json':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
        }else if(request.method==='POST'){
          const body=await bodyJSON(request,url.pathname==='/api/reassemble-upload'?8*1024*1024:2000000);
          if(url.pathname==='/api/reassemble-upload')return json(await saveEditorAssembly(env,body,auth));
          if(url.pathname==='/api/reassemble')return json(await reassembleStored(env,body.jobId,auth,{lightDirection:body.lightDirection}));
          if(url.pathname==='/api/plan-live')return json(await createPlan(env,body,auth),202);
          if(url.pathname==='/api/planner-recover'){ownerOnly(auth);if(!safeId(body.requestId))fail(400,'Invalid planner ID');return json(await recoverPlan(env,body.requestId));}
          if(url.pathname==='/api/plan-mock'){generationRole(auth);return json(await planMock(body));}
          if(url.pathname==='/api/runs')return json(await createRun(env,body,auth),201);
          if(url.pathname==='/api/requeue-run'){ownerOnly(auth);if(!safeId(body.runId))fail(400,'Invalid run ID');await runAccess(env,auth,body.runId);const eligible=await all(env,"SELECT j.id FROM jobs j WHERE j.run_id=? AND j.status IN ('queued','failed','blocked') AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.job_id=j.id)",body.runId);let sent=0;for(const job of eligible){if(await one(env,'SELECT job_id FROM attempts WHERE job_id=?',job.id))continue;await query(env,"UPDATE jobs SET status='queued' WHERE id=? AND NOT EXISTS (SELECT 1 FROM attempts WHERE job_id=?)",job.id,job.id).run();await queueDiagnostic(env,job.id,'requeue_requested');await env.IMAGE_JOBS.send({version:1,jobId:job.id});sent++;}return json({runId:body.runId,sent,planner_repeated:false,previous_provider_attempts_repeated:false});}
          if(url.pathname==='/api/dispatch'){ownerOnly(auth);return json({sent:await dispatch(env)});}
          if(url.pathname==='/api/candidates')return json(await saveCandidates(env,body,auth));
          if(url.pathname==='/api/choices')return json(await saveChoice(env,body,auth));
          if(url.pathname==='/api/recover'){ownerOnly(auth);
            if(!safeId(body.jobId))fail(400,'Invalid job');const job=await one(env,'SELECT * FROM jobs WHERE id=?',body.jobId),attempt=await one(env,'SELECT * FROM attempts WHERE job_id=?',body.jobId);if(!job||!attempt)fail(409,'No recoverable attempt');if(job.status==='complete')return json({recovered:true,provider_calls:0,idempotent:true});
            const receiptKey=`runs/${job.run_id}/${job.object_id}/receipt.json`;if(!await env.ARTIFACTS.head(receiptKey))fail(409,'No durable receipt; billing reconciliation required, no automatic resend');
            const processing=createProcessing(env,job,{kind:'recovery-request'});
            try{await sendFinalization(env,job,processing);}
            catch(error){
              try{await processing.stage('failure_d1_status',()=>query(env,"UPDATE jobs SET status='needs_review' WHERE id=? AND status<>'complete'",job.id).run());await processing.end('recovery_send_failed',error);}
              catch(statusError){await processing.end('status_write_failed',statusError);}
              throw error;
            }
            return json({recovery_queued:true,provider_calls:0},202);
          }
        }
        fail(404,'Unknown API route');
      }
      if(!env.ASSETS)fail(503,'ASSETS binding missing');
      const asset=await env.ASSETS.fetch(request),headers=new Headers(asset.headers);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");return new Response(asset.body,{status:asset.status,headers});
    }catch(error){const diagnostic=crypto.randomUUID();if(!error.status){const table=/no such table: ([a-zA-Z0-9_]+)/.exec(String(error.message));console.error(JSON.stringify({event:'api-failed',diagnostic,route:url.pathname,kind:table?'missing-database-table':'storage-or-configuration',...(table?{table:table[1]}:{})}));return json({error:table?'Database migration missing: '+table[1]+'; no automatic provider retry.':'Storage or configuration failure; no automatic provider retry.',route:url.pathname,diagnostic},503);}return json({error:error.message,route:url.pathname},error.status);} 
  },
  async queue(batch,env){
    for(const message of batch.messages){
      let processing=null,job=null;
      try{
        env=await referenceEnvironment(env);
        if(message.body?.version===1&&safeId(message.body.jobId)){
          if(message.body.kind==='planner')await processPlan(env,message.body.jobId,deps.textProvider);
          else{
            job=await one(env,'SELECT * FROM jobs WHERE id=?',message.body.jobId);
            if(job){
              processing=createProcessing(env,job,{kind:message.body.kind||'image'});
              if(message.body.kind==='image-recovery'){
                await processing.event('finalization_receive','succeeded',{parent_execution_id:message.body.parentExecutionId});
                const attempt=await one(env,'SELECT * FROM attempts WHERE job_id=?',job.id);
                if(attempt&&job.status!=='complete'){
                  const key='runs/'+job.run_id+'/'+job.object_id+'/receipt.json';
                  await query(env,"UPDATE jobs SET status='running' WHERE id=? AND status<>'complete'",job.id).run();
                  await finishReceipt(env,job,{...attempt,receipt_key:key},processing,deps);
                  await processing.end('complete');
                }else await processing.event('recovery_skipped','succeeded',{},'skipped');
              }else await processJob(env,message.body.jobId,{...deps,processing});
            }
          }
        }
      }catch(error){
        const jobId=message.body?.jobId;
        if(safeId(jobId)){
          const safe=safeProcessingError(error,processing?.failedStage);
          console.error(JSON.stringify({event:'queue-processing-failed',job_id:jobId,execution_id:processing?.executionId||null,...safe}));
          try{
            if(message.body.kind==='planner'){
              await query(env,"UPDATE planner_requests SET status='failed' WHERE id=? AND status='queued' AND NOT EXISTS (SELECT 1 FROM attempts WHERE job_id=?)",jobId,jobId).run();
            }else{
              processing ||= createProcessing(env,job||{id:jobId,run_id:null},{kind:'image'});
              await processing.stage('failure_d1_status',()=>query(env,"UPDATE jobs SET status=CASE WHEN EXISTS (SELECT 1 FROM attempts WHERE job_id=?) THEN 'needs_review' ELSE 'failed' END WHERE id=? AND status<>'complete'",jobId,jobId).run());
              await processing.end('needs_review',error);
            }
          }catch{
            console.error(JSON.stringify({event:'queue-failure-status-write-failed',job_id:jobId,execution_id:processing?.executionId||null,code:'STATUS_WRITE_FAILED'}));
            if(processing)await processing.end('status_write_failed',error);
          }
        }
      }
      // Never resend a possibly paid request, including when status/telemetry storage failed.
      message.ack();
    }
  }
};}
export default createWorker();




