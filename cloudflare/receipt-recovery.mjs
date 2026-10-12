import {sha, usageCost} from './provider.mjs';
import {journalRead, journalEvent} from './experiment-journal.mjs';

// Reconstruct only a response already returned by the provider, never resend it.
export async function restoreImageReceipt(env, job, attempt, dependencies={}) {
 const key=`runs/${job.run_id}/${job.object_id}/receipt.json`;
 const reject=message=>{throw Object.assign(Error(message),{status:409});};
 if(!await env.ARTIFACTS.head(key)){
  const journal=await (dependencies.readJournal||journalRead)(env,job.id);
  if(journal.input?.attempt_id!==job.id || journal.input?.run_id!==job.run_id)
   reject('Recovery journal identity mismatch');
  const events=journal.events.filter(e=>e.event_type==='provider_returned');
  if(events.length!==1)reject('No unique returned response; provider replay forbidden');
  const returned=events[0].payload,rawKey=`runs/${job.run_id}/${job.object_id}/raw.png`;
  const raw=await env.ARTIFACTS.get(rawKey);
  if(!raw)reject('Missing saved raw PNG; provider replay forbidden');
  const bytes=new Uint8Array(await raw.arrayBuffer()),hash=await sha(bytes);
  if(hash!==returned.raw_sha256)reject('Saved PNG does not match provider journal');
  const cost=attempt.mode==='mock'?0:usageCost(returned.usage);
  if(!Number.isSafeInteger(cost)||cost<0||cost!==returned.usage_calculated_cost_nanodollars)
   reject('Returned usage cannot be reconciled');
  if(attempt.actual!=null&&attempt.actual!==cost)reject('Recorded cost conflicts with provider journal');
  const receipt={raw_key:rawKey,raw_sha256:hash,usage:returned.usage,request_id:returned.request_id,cost};
  await env.ARTIFACTS.put(key,JSON.stringify(receipt),{httpMetadata:{contentType:'application/json'}});
  await (dependencies.writeJournal||journalEvent)(env,job.id,'receipt-restored-'+hash,'receipt_restored_from_journal',{
   raw_key:rawKey,raw_sha256:hash,source_event_id:events[0].event_id,cost_nanodollars:cost,provider_calls:0
  });
 }
 // Repair the D1 pointer even when a previous recovery stopped after the R2 write.
 const receipt=await (await env.ARTIFACTS.get(key)).json();
 if(receipt.raw_key!==`runs/${job.run_id}/${job.object_id}/raw.png`)reject('Recovery receipt path mismatch');
 const raw=await env.ARTIFACTS.get(receipt.raw_key);
 if(!raw||await sha(new Uint8Array(await raw.arrayBuffer()))!==receipt.raw_sha256)
  reject('Recovery receipt PNG hash mismatch');
 const cost=attempt.mode==='mock'?0:usageCost(receipt.usage);
 if(!Number.isSafeInteger(cost)||cost<0||receipt.cost!==cost||(attempt.actual!=null&&attempt.actual!==cost))
  reject('Recovery receipt cost mismatch');
 await env.DB.prepare("UPDATE attempts SET receipt_key=?,actual=?,status=CASE WHEN ?>reservation AND budget_scope<>'guests-shared-soft-v1' THEN 'cost_bound_exceeded' ELSE 'complete' END,error=NULL WHERE job_id=?")
  .bind(key,cost,cost,job.id).run();
 return {receipt_key:key,provider_calls:0};
}
