import {ensureFinalization} from './finalization-recovery.mjs';
import {runStopped} from './resume-generation.mjs';
import {runAccess,redactRun} from './roles.mjs';
const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const all=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results;
export function runMetadata(frozen){
 return {category_names:frozen.category_names||[],planner_request_id:frozen.planner_request_id||null,objects:(frozen.objects||[]).map(o=>({object_id:o.object_id,name:o.name,category:o.category,thematic_category:o.thematic_category,generation:o.generation,asset_stage:o.asset_stage}))};
}
export function metadataKey(run){return 'runs/'+run.id+'/view-'+run.frozen_sha+'.json';}
async function metadata(env,run){
 const key=metadataKey(run),cached=await env.ARTIFACTS.get(key);
 if(cached)return cached.json();
 const stored=await env.ARTIFACTS.get(run.frozen_key);if(!stored)throw Error('Missing private artifact');
 const view=runMetadata(await stored.json());
 if(view.planner_request_id&&(!view.category_names.length||view.objects.some(o=>!o.thematic_category))){
  const row=await one(env,'SELECT result_key FROM planner_requests WHERE id=?',view.planner_request_id);
  if(row?.result_key){const result=await env.ARTIFACTS.get(row.result_key),groups=result?(await result.json()).plan?.collections||[]:[];
   if(!view.category_names.length)view.category_names=groups.map(c=>c.name);
   const categories=new Map(groups.flatMap(c=>(c.objects||[]).map(o=>[o.object_id,c.name])));
   for(const object of view.objects)object.thematic_category=object.thematic_category||categories.get(object.object_id)||null;
  }
 }
 // Optional read-model cache: failure must never hide already stored results.
 try{await env.ARTIFACTS.put(key,JSON.stringify(view),{httpMetadata:{contentType:'application/json'}});}catch{}
 return view;
}
export async function readRun(env,auth,id,{statusOnly=false,compact=false,ensureCardEdits,readQueueDiagnostic}={}){
 const run=await runAccess(env,auth,id);await ensureFinalization(env);
 if(statusOnly){
  const jobs=await all(env,'SELECT j.id,j.run_id,j.object_id,j.status,f.public_error FROM jobs j LEFT JOIN finalization_jobs f ON f.job_id=j.id WHERE run_id=? ORDER BY j.id',id);
  return {run:{...redactRun(run),cancelled:await runStopped(env,id)},jobs};
 }
 await ensureCardEdits(env);
 const view=await metadata(env,run),byObject=new Map(view.objects.map(o=>[o.object_id,o]));
 const jobs=await all(env,`SELECT j.*,f.public_error,attempt.error attempt_error,${compact?'NULL':'c.payload'} alternatives,ch.revision,ch.payload choice,
 applied.edit_job_id applied_version,edited.object_id applied_object_id,editedRun.id applied_run_id,editedRun.frozen_key applied_frozen_key,editedRun.frozen_sha applied_frozen_sha
 FROM jobs j LEFT JOIN finalization_jobs f ON f.job_id=j.id LEFT JOIN attempts attempt ON attempt.job_id=j.id ${compact?'':'LEFT JOIN candidates c ON c.job_id=j.id'}
 LEFT JOIN choices_v2 ch ON ch.job_id=j.id AND ch.principal_id=?
 LEFT JOIN card_applied applied ON applied.source_job_id=j.id LEFT JOIN jobs edited ON edited.id=applied.edit_job_id
 LEFT JOIN runs editedRun ON editedRun.id=edited.run_id WHERE j.run_id=?`,auth.principalId,id);
 const appliedRuns=new Map();
 for(const job of jobs)if(job.applied_run_id&&!appliedRuns.has(job.applied_run_id))appliedRuns.set(job.applied_run_id,metadata(env,{id:job.applied_run_id,frozen_key:job.applied_frozen_key,frozen_sha:job.applied_frozen_sha}));
 const order=new Map(view.objects.map((o,i)=>[o.object_id,i]));jobs.sort((a,b)=>(order.get(a.object_id)??Infinity)-(order.get(b.object_id)??Infinity));
 const results=await Promise.all(jobs.map(async job=>{
  const {applied_run_id,applied_frozen_key,applied_frozen_sha,applied_object_id,...safe}=job;
  let object=byObject.get(job.object_id);
  if(applied_run_id)object=(await appliedRuns.get(applied_run_id)).objects.find(o=>o.object_id===applied_object_id)||object;
  let reference=null;try{const diagnostics=JSON.parse(job.choice||'{}').diagnostics;reference=diagnostics?.reference_category||diagnostics?.comparison?.category;}catch{}
  const admission=job.status==='blocked'&&readQueueDiagnostic?await readQueueDiagnostic(env,job.id):null;
  const publicError=job.public_error||(job.status==='blocked'?(admission?.stage==='admission_blocked'?'Нет доступного резерва для оплачиваемого запроса. Генерация не отправлена.':'Нет допуска к генерации. Проверьте доступ и актуальность задания; платный запрос не отправлен.'):null);
  return {...safe,public_error:publicError,applied_version:job.applied_version||null,attempt_error:auth.role==='owner'?job.attempt_error:null,
   queue_diagnostic:auth.role==='owner'&&(!compact||job.status==='running')?await readQueueDiagnostic(env,job.id):null,
   reference_category:['C1','C2','C3','C4'].includes(reference)?reference:null,name:object?.name||job.object_id,
   thematic_category:object?.thematic_category||null,category:['C1','C2','C3','C4'].includes(object?.category)?object.category:null,
   generation:object?.generation||null,asset_stage:object?.asset_stage||null};
 }));
 return {run:{...redactRun(run),cancelled:await runStopped(env,id),category_names:view.category_names},jobs:results};
}
