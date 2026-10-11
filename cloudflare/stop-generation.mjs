import {journalEvent} from './experiment-journal.mjs';
export async function stopGeneration(env,auth,body){
 const ids=[];for(const [field,table,key,prefix] of [['runId','runs','id','runs/'],['planId','planner_requests','id','planner/']]){
  const id=body[field];if(!id)continue;if(!/^[a-zA-Z0-9_-]{1,200}$/.test(id))throw Object.assign(Error('Invalid stop ID'),{status:400});
  const row=await env.DB.prepare('SELECT * FROM '+table+' WHERE '+key+'=?').bind(id).first();if(!row)continue;
  if(auth.role!=='owner'&&row.principal_id!==auth.principalId)throw Object.assign(Error('Not authorized for this resource'),{status:403});
  ids.push({id,field,prefix});
 }
 // Validate every resource before making any change.
 let closed=0;for(const item of ids){
  await env.ARTIFACTS.put(item.prefix+item.id+'/cancelled.json',JSON.stringify({cancelled_at:new Date().toISOString(),principal_id:auth.principalId,reason:'User stopped generation; preserve assets and evidence; no provider replay'}));
  if(item.field==='runId'){
   await env.DB.prepare("UPDATE jobs SET status='cancelled' WHERE run_id=? AND status<>'complete'").bind(item.id).run();
   await env.DB.prepare("UPDATE outbox SET state='cancelled' WHERE state='pending' AND job_id IN (SELECT id FROM jobs WHERE run_id=?)").bind(item.id).run();
  }else await env.DB.prepare("UPDATE planner_requests SET status='cancelled' WHERE id=?").bind(item.id).run();
  const rows=(await env.DB.prepare(item.field==='runId'?"SELECT a.* FROM attempts a JOIN jobs j ON j.id=a.job_id WHERE j.run_id=? AND a.mode='live' AND a.actual IS NULL AND a.status<>'closed_reserved_unknown'":"SELECT * FROM attempts WHERE job_id=? AND mode='live' AND actual IS NULL AND status<>'closed_reserved_unknown'").bind(item.id).all()).results||[];
  for(const a of rows){
   await journalEvent(env,a.job_id,'user-stop-reserve','manual_accounting_closure',{principal_id:auth.principalId,previous_reservation_nanodollars:a.reservation,reservation_nanodollars:1000000000,actual_cost_nanodollars:null,decision:'User stops; unknown cost reserve $1; preserve receipts; no replay',provider_calls:0});
   await env.DB.prepare("UPDATE attempts SET status='closed_reserved_unknown',reservation=1000000000 WHERE job_id=? AND actual IS NULL").bind(a.job_id).run();closed++;
  }
 }
 return {stopped:true,closed_unknown:closed,provider_calls:0,inflight_requests_cannot_be_recalled:true};
}
