export const GUEST_CAP=5000000000,PROJECT_CAP=100000000000;
export async function budgetState(env) {
 const b=await env.DB.prepare('SELECT * FROM budget WHERE id=1').first();
 const a=await env.DB.prepare("SELECT COALESCE(SUM(COALESCE(actual,reservation)),0) committed,SUM((status<>'complete' OR actual IS NULL) AND status<>'closed_reserved_unknown') unresolved,COALESCE(SUM(CASE WHEN budget_scope='guests-shared' THEN COALESCE(actual,reservation) ELSE 0 END),0) guests FROM attempts WHERE mode='live'").first();
 const reasons=[];if(!b?.approved)reasons.push('budget_baseline_unapproved');if(b?.historical_unknown>0)reasons.push('historical_billing_reconciliation_required');if(a?.unresolved>0)reasons.push('attempt_billing_reconciliation_required');
 return {unit:'nanodollars',...b,ceiling:Math.min(b?.ceiling||0,PROJECT_CAP),committed:a?.committed||0,unresolved_attempts:a?.unresolved||0,remaining:b?Math.max(0,Math.min(b.ceiling,PROJECT_CAP)-b.historical_known-b.historical_unknown-(a?.committed||0)):0,guest_scope:'all-non-owner-lifetime',guest_ceiling:GUEST_CAP,guest_committed:a?.guests||0,guest_remaining:Math.max(0,GUEST_CAP-(a?.guests||0)),live_blockers:reasons};
}
export function reservationFor(env,kind,principalId){
 if(kind==='image'&&principalId==='owner')return 10000000000;
 const value=Number(env[kind==='image'?'IMAGE_MAX_COST_NANODOLLARS':'TEXT_RESERVATION_NANODOLLARS']);
 if(principalId!=='owner'&&(!env[kind==='image'?'IMAGE_COST_BOUND_EVIDENCE':'TEXT_COST_BOUND_EVIDENCE']||!Number.isSafeInteger(value)||value<=0))throw Object.assign(Error('Verified request cost upper bound required for guest generation'),{status:409});
 if(Number.isSafeInteger(value)&&value>0)return value;
 throw Object.assign(Error('Explicit positive reservation required'),{status:409});
}
export async function claimPaid(env,jobId,reservation,principalId='owner'){
 if(!Number.isSafeInteger(reservation)||reservation<=0)throw Error('Explicit positive reservation required');const scope=principalId==='owner'?'owner':'guests-shared';
 const r=await env.DB.prepare(`INSERT OR IGNORE INTO attempts (job_id,mode,status,reservation,created_at,principal_id,budget_scope)
 SELECT ?,'live','claimed',?,?,?,? WHERE EXISTS (SELECT 1 FROM budget b WHERE b.id=1 AND b.approved=1 AND b.historical_unknown=0
 AND NOT EXISTS (SELECT 1 FROM attempts WHERE mode='live' AND ((status<>'complete' OR actual IS NULL) AND status<>'closed_reserved_unknown'))
 AND b.historical_known+COALESCE((SELECT SUM(COALESCE(actual,reservation)) FROM attempts WHERE mode='live'),0)+?<=MIN(b.ceiling,100000000000))
 AND (?='owner' OR COALESCE((SELECT SUM(COALESCE(actual,reservation)) FROM attempts WHERE mode='live' AND budget_scope='guests-shared'),0)+?<=5000000000)`).bind(jobId,reservation,new Date().toISOString(),principalId,scope,reservation,scope,reservation).run();return Boolean(r.meta.changes);
}
