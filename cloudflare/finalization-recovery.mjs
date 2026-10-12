// This queue path only reads saved outputs. It must never invoke a provider.
export const FINALIZATION_MAX_ATTEMPTS=4, FINALIZATION_LEASE_MS=300000;
const ready=new WeakMap();
export function ensureFinalization(env){
 if(!ready.has(env.DB))ready.set(env.DB,env.DB.prepare(`CREATE TABLE IF NOT EXISTS finalization_jobs (
 job_id TEXT PRIMARY KEY,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,next_retry_at INTEGER NOT NULL DEFAULT 0,
 public_error TEXT,updated_at INTEGER NOT NULL DEFAULT 0)`).run().catch(e=>{ready.delete(env.DB);throw e;}));
 return ready.get(env.DB);
}
export async function acquireFinalization(env,id,now=Date.now()){
 await ensureFinalization(env);const token=crypto.randomUUID();
 return env.DB.prepare(`INSERT INTO finalization_jobs(job_id,state,attempts,lease_token,lease_until,updated_at)
 VALUES(?,'running',1,?,?,?) ON CONFLICT(job_id) DO UPDATE SET state='running',attempts=attempts+1,
 lease_token=excluded.lease_token,lease_until=excluded.lease_until,updated_at=excluded.updated_at
 WHERE state NOT IN ('complete','failed') AND attempts<? AND lease_until<=?
 RETURNING *`).bind(id,token,now+FINALIZATION_LEASE_MS,now,FINALIZATION_MAX_ATTEMPTS,now).first();
}
export async function completeFinalization(env,lease){
 await env.DB.prepare("UPDATE finalization_jobs SET state='complete',lease_until=0,public_error=NULL,updated_at=? WHERE job_id=? AND lease_token=?").bind(Date.now(),lease.job_id,lease.lease_token).run();
}
// Only an explicit owner recovery action may start another bounded recovery cycle.
export async function resetFailedFinalization(env,id){
 await ensureFinalization(env);
 return env.DB.prepare("UPDATE finalization_jobs SET state='pending',attempts=0,lease_token=NULL,lease_until=0,next_retry_at=0,public_error=NULL,updated_at=? WHERE job_id=? AND state='failed'").bind(Date.now(),id).run();
}
export function permanentFinalizationError(error){return /PNG|dimensions|format|alpha|must be opaque|Empty foreground|Foreground includes|SHA mismatch|hash mismatch|does not match|identity mismatch|path mismatch|cost mismatch|cost conflicts|cannot be reconciled|No unique returned|Missing saved|Missing stored/i.test(error.message||'');}
export async function failFinalization(env,lease,error){
 const permanent=permanentFinalizationError(error),terminal=permanent||lease.attempts>=FINALIZATION_MAX_ATTEMPTS;
 const message=permanent?'Сохранённый результат не прошёл проверку PNG или данных ответа. Нужна проверка; повторной оплаты не было.':terminal?'Не удалось сохранить карточку после 4 попыток. Исходник сохранён; повторной оплаты не было.':'Временная ошибка сохранения. Повторяем обработку сохранённого PNG без генерации.';
 const delay=Math.min(120,15*2**(lease.attempts-1));
 const changed=await env.DB.prepare("UPDATE finalization_jobs SET state=?,lease_until=0,next_retry_at=?,public_error=?,updated_at=? WHERE job_id=? AND lease_token=?").bind(terminal?'failed':'retry',Date.now()+delay*1000,message,Date.now(),lease.job_id,lease.lease_token).run();
 if(!changed.meta.changes)return {terminal:true,stale:true};
 await env.DB.prepare("UPDATE jobs SET status=? WHERE id=? AND status<>'complete'").bind(terminal?'needs_review':'running',lease.job_id).run();
 return {terminal,delay};
}
export async function sweepFinalizations(env,limit=10,now=Date.now()){
 await ensureFinalization(env);
 // Recover hard termination too: an expired lease counts as an attempt, never resets the limit.
 await env.DB.prepare("UPDATE finalization_jobs SET state='failed',public_error='Не удалось завершить сохранение после 4 попыток. Исходник сохранён; повторной оплаты не было.' WHERE state='running' AND lease_until<=? AND attempts>=?").bind(now,FINALIZATION_MAX_ATTEMPTS).run();
 await env.DB.prepare("UPDATE jobs SET status='needs_review' WHERE status<>'complete' AND id IN (SELECT job_id FROM finalization_jobs WHERE state='failed')").run();
 const rows=(await env.DB.prepare(`SELECT j.*,a.created_at,a.actual FROM jobs j JOIN attempts a ON a.job_id=j.id
 LEFT JOIN results r ON r.job_id=j.id LEFT JOIN finalization_jobs f ON f.job_id=j.id
 WHERE r.job_id IS NULL AND j.status IN ('running','needs_review','failed')
 AND (f.job_id IS NULL OR (f.state NOT IN ('complete','failed') AND f.lease_until<=? AND f.next_retry_at<=? AND f.attempts<?))
 ORDER BY a.created_at LIMIT ?`).bind(now,now,FINALIZATION_MAX_ATTEMPTS,100).all()).results;
 let sent=0;for(const job of rows){
  if(now-Date.parse(job.created_at)<120000)continue;
  const {runStopped}=await import('./resume-generation.mjs');if(await runStopped(env,job.run_id))continue;
  if(!await env.ARTIFACTS.head(`runs/${job.run_id}/${job.object_id}/raw.png`)){
   if(now-Date.parse(job.created_at)<1200000)continue;
   await env.DB.prepare("UPDATE attempts SET status='unknown' WHERE job_id=? AND actual IS NULL AND status<>'closed_reserved_unknown'").bind(job.id).run();
   const message=job.actual==null?'Ответ генерации не сохранён. Стоимость неизвестна; полный резерв сохранён. Нужна ручная проверка, повторный платный запрос не отправлен.':'Исходный PNG отсутствует в хранилище. Нужна ручная проверка; повторный платный запрос не отправлен.';
   await env.DB.prepare("INSERT INTO finalization_jobs(job_id,state,public_error,updated_at) VALUES(?,'failed',?,?) ON CONFLICT(job_id) DO UPDATE SET state='failed',public_error=excluded.public_error,updated_at=excluded.updated_at WHERE state<>'complete'").bind(job.id,message,now).run();
   await env.DB.prepare("UPDATE jobs SET status='needs_review' WHERE id=? AND status<>'complete'").bind(job.id).run();continue;
  }
  await (env.FINAL_JOBS||env.IMAGE_JOBS).send({version:1,kind:'image-recovery',jobId:job.id});
  await env.DB.prepare("INSERT INTO finalization_jobs(job_id,next_retry_at,updated_at) VALUES(?,?,?) ON CONFLICT(job_id) DO UPDATE SET next_retry_at=excluded.next_retry_at,updated_at=excluded.updated_at WHERE state NOT IN ('complete','failed')").bind(job.id,now+120000,now).run();sent++;if(sent>=limit)break;
 }
 return {sent,provider_calls:0};
}
