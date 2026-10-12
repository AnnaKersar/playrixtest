import {generationRole} from './roles.mjs';
import {sha} from './provider.mjs';
export async function runStopped(env,id){
 const marker=await env.ARTIFACTS.get('runs/'+id+'/cancelled.json');if(!marker)return false;
 const stopped=await marker.json(),resume=await env.ARTIFACTS.get('runs/'+id+'/resumed.json');if(!resume)return true;
 return (await resume.json()).source_stop_sha256!==await sha(JSON.stringify(stopped));
}
export async function resumeGeneration(env,auth,id,{prepare=async()=>{},dispatch=async()=>{}}={}){
 generationRole(auth);
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(id))throw Object.assign(Error('Invalid run ID'),{status:400});
 const q=(sql,...args)=>env.DB.prepare(sql).bind(...args),run=await q('SELECT * FROM runs WHERE id=?',id).first();if(!run)throw Object.assign(Error('Run not found'),{status:404});
 if(auth.role!=='owner'&&run.principal_id!==auth.principalId)throw Object.assign(Error('Not authorized for this resource'),{status:403});
 if(!await runStopped(env,id)){await dispatch();return {runId:id,already_active:true,planner_repeated:false,previous_provider_attempts_repeated:false};}
 const rows=(await q('SELECT j.*,a.job_id attempt_id,a.receipt_key,r.job_id result_id FROM jobs j LEFT JOIN attempts a ON a.job_id=j.id LEFT JOIN results r ON r.job_id=j.id WHERE j.run_id=?',id).all()).results||[],queued=[],recover=[],review=[],complete=[];
 for(const job of rows){if(job.status==='complete'||job.result_id){complete.push(job);continue;}if(!job.attempt_id){await prepare(job);queued.push(job);}else if(await env.ARTIFACTS.head('runs/'+id+'/'+job.object_id+'/receipt.json'))recover.push(job);else review.push(job);}
 const marker=await env.ARTIFACTS.get('runs/'+id+'/cancelled.json'),stop=await marker.json();
 const resume={version:'run-resume/v1',resumed_at:new Date().toISOString(),principal_id:auth.principalId,source_stop_sha256:await sha(JSON.stringify(stop)),stopped_snapshot:stop,new_image_jobs:queued.map(j=>j.id),recovery_jobs:recover.map(j=>j.id),unresolved_jobs:review.map(j=>j.id)};
 await env.ARTIFACTS.put('runs/'+id+'/resume-history/'+resume.source_stop_sha256+'.json',JSON.stringify(resume));
 await env.ARTIFACTS.put('runs/'+id+'/resumed.json',JSON.stringify(resume));
 const writes=[];for(const job of queued){writes.push(q("UPDATE jobs SET status='queued' WHERE id=? AND NOT EXISTS (SELECT 1 FROM attempts WHERE job_id=?)",job.id,job.id),q("INSERT INTO outbox (job_id,state) SELECT ?,'pending' WHERE NOT EXISTS (SELECT 1 FROM attempts WHERE job_id=?) ON CONFLICT(job_id) DO UPDATE SET state='pending'",job.id,job.id));}
 for(const job of recover){writes.push(q("UPDATE jobs SET status='running' WHERE id=? AND status<>'complete'",job.id),q("INSERT INTO outbox (job_id,state) VALUES (?,'recovery_pending') ON CONFLICT(job_id) DO UPDATE SET state='recovery_pending'",job.id));}
 for(const job of review)writes.push(q("UPDATE jobs SET status='needs_review' WHERE id=? AND status<>'complete'",job.id));
 for(const job of complete)writes.push(q("UPDATE jobs SET status='complete' WHERE id=?",job.id));if(writes.length)await env.DB.batch(writes);
 let queue_pending=false;try{await dispatch();}catch{queue_pending=true;}
 return {runId:id,queued:queued.length,recovery:recover.length,unresolved:review.length,preserved:complete.length,queue_pending,planner_repeated:false,previous_provider_attempts_repeated:false};
}
