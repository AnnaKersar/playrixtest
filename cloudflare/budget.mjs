export const GUEST_CAP=10000000000,PROJECT_CAP=100000000000;
export const GUEST_SOFT_SCOPE='guests-shared-soft-v1';
export const guestPaidEnabled=env=>env.GUEST_PAID_GENERATION_ENABLED==='true';
// A full-pool hold on unknown outcomes is an accounting policy, NOT a price bound.
// Legacy guest reservations retain their conservative accounting; no ledger reset.
const guest="(principal_id<>'owner' OR budget_scope IN ('guests-shared','guests-shared-soft-v1'))";
const charged="CASE WHEN budget_scope='guests-shared-soft-v1' THEN COALESCE(actual,reservation) WHEN "+guest+" THEN MAX(COALESCE(actual,0),reservation) ELSE COALESCE(actual,reservation) END";
const unresolved="((status<>'complete' OR actual IS NULL) AND status<>'closed_reserved_unknown') OR ("+guest+" AND actual IS NULL)";
export async function budgetState(env) {
 const b=await env.DB.prepare('SELECT * FROM budget WHERE id=1').first();
 const a=await env.DB.prepare("SELECT COALESCE(SUM("+charged+"),0) committed,SUM("+unresolved+") unresolved,COALESCE(SUM(CASE WHEN "+guest+" THEN "+charged+" ELSE 0 END),0) guests FROM attempts WHERE mode='live'").first();
 const reasons=[];if(!b?.approved)reasons.push('budget_baseline_unapproved');if(b?.historical_unknown>0)reasons.push('historical_billing_reconciliation_required');if(a?.unresolved>0)reasons.push('attempt_billing_reconciliation_required');
 return {unit:'nanodollars',...b,ceiling:Math.min(b?.ceiling||0,PROJECT_CAP),committed:a?.committed||0,unresolved_attempts:a?.unresolved||0,remaining:b?Math.max(0,Math.min(b.ceiling,PROJECT_CAP)-b.historical_known-b.historical_unknown-(a?.committed||0)):0,guest_scope:'all-non-owner-lifetime',guest_policy:'soft-budget-usage-accounting/v1',guest_ceiling:GUEST_CAP,guest_committed:a?.guests||0,guest_remaining:Math.max(0,GUEST_CAP-(a?.guests||0)),live_blockers:reasons};
}
export function reservationFor(env,kind,principalId){
 if(principalId!=='owner'){
  if(!guestPaidEnabled(env))throw Object.assign(Error('Guest paid generation disabled'),{status:403});
  return GUEST_CAP;
 }
 if(kind==='image')return 10000000000;
 const value=Number(env.TEXT_RESERVATION_NANODOLLARS);
 if(Number.isSafeInteger(value)&&value>0)return value;
 throw Object.assign(Error('Explicit positive reservation required'),{status:409});
}
export async function claimPaid(env,jobId,reservation,principalId='owner'){
 const isGuest=principalId!=='owner';if(isGuest&&!guestPaidEnabled(env))return false;
 if(!Number.isSafeInteger(reservation)||reservation<=0)throw Error('Explicit positive reservation required');
 if(isGuest)reservation=GUEST_CAP;
 const scope=isGuest?GUEST_SOFT_SCOPE:'owner';
 // One conditional INSERT is the lock and the idempotency claim. Unknown outcomes
 // never time out. A final usage-settled call may exceed the remaining soft budget.
 const r=await env.DB.prepare(`INSERT OR IGNORE INTO attempts (job_id,mode,status,reservation,created_at,principal_id,budget_scope)
 SELECT ?,'live','claimed',?,?,?,? WHERE EXISTS (SELECT 1 FROM budget b WHERE b.id=1 AND b.approved=1 AND b.historical_unknown=0
 AND NOT EXISTS (SELECT 1 FROM attempts WHERE mode='live' AND (${unresolved}))
 AND b.historical_known+COALESCE((SELECT SUM(${charged}) FROM attempts WHERE mode='live'),0)+?<=MIN(b.ceiling,100000000000))
 AND (?='owner' OR COALESCE((SELECT SUM(${charged}) FROM attempts WHERE mode='live' AND ${guest}),0)<10000000000)`).bind(jobId,reservation,new Date().toISOString(),principalId,scope,reservation,scope).run();return Boolean(r.meta.changes);
}
