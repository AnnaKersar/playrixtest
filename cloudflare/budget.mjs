import {ensureGuestPeriod} from './guest-budget-period.mjs';
export const GUEST_CAP=10000000000,PROJECT_CAP=100000000000;
export const GUEST_SOFT_SCOPE='guests-shared-soft-v1';
export const guestPaidEnabled=env=>env.GUEST_PAID_GENERATION_ENABLED==='true';
// A $10 hold on unknown outcomes is an accounting policy, NOT an actual charge.
// Legacy guest reservations retain their conservative accounting; no ledger reset.
const guest="(principal_id<>'owner' OR budget_scope IN ('guests-shared','guests-shared-soft-v1'))";
// Settled usage and outstanding holds remain separate; historical ledger rows are retained.
const charged="COALESCE(actual,reservation)";
const currentGuest=guest+" AND (NOT EXISTS(SELECT 1 FROM guest_budget_period WHERE id=1) OR budget_scope='guests-shared-hard-v2:'||(SELECT epoch FROM guest_budget_period WHERE id=1))";
const unknown="actual IS NULL AND status NOT IN ('claimed','closed_reserved_unknown')";
// A manual allowance reset excludes previous guest periods from admission blockers,
// while their unknown holds remain fully committed against the project budget.
const unresolved="("+unknown+") AND (NOT "+guest+" OR ("+currentGuest+"))";
export async function budgetState(env) {
 await ensureGuestPeriod(env);const b=await env.DB.prepare('SELECT * FROM budget WHERE id=1').first();
 const a=await env.DB.prepare("SELECT COALESCE(SUM("+charged+"),0) committed,SUM("+unresolved+") unresolved,COALESCE(SUM(CASE WHEN "+currentGuest+" THEN "+charged+" ELSE 0 END),0) guests,COALESCE(SUM(CASE WHEN ("+currentGuest+") AND status='cost_bound_exceeded' THEN 1 ELSE 0 END),0) guest_breaches FROM attempts WHERE mode='live'").first();
 const totals=await env.DB.prepare("SELECT COALESCE(SUM(COALESCE(actual,0)),0) actual_spent,COALESCE(SUM(CASE WHEN actual IS NULL THEN reservation ELSE 0 END),0) active_reserved FROM attempts WHERE mode='live'").first();
 const reasons=[];if(!b?.approved)reasons.push('budget_baseline_unapproved');if(b?.historical_unknown>0)reasons.push('historical_billing_reconciliation_required');if(a?.unresolved>0)reasons.push('attempt_billing_reconciliation_required');
 return {unit:'nanodollars',actual_spent:totals.actual_spent,active_reserved:totals.active_reserved,...b,ceiling:Math.min(b?.ceiling||0,PROJECT_CAP),committed:a?.committed||0,unresolved_attempts:a?.unresolved||0,remaining:b?Math.max(0,Math.min(b.ceiling,PROJECT_CAP)-b.historical_known-b.historical_unknown-(a?.committed||0)):0,guest_scope:'shared-current-manual-period',guest_policy:'atomic-shared-reservations/v2',guest_ceiling:GUEST_CAP,guest_committed:a?.guests||0,guest_remaining:Math.max(0,GUEST_CAP-(a?.guests||0)),guest_live_blockers:a?.guest_breaches>0?['guest_reservation_bound_exceeded']:[],live_blockers:reasons};
}
export function reservationFor(env,kind,principalId){
 if(principalId!=='owner'){
  if(!guestPaidEnabled(env))throw Object.assign(Error('Guest paid generation disabled'),{status:403});
  const configured=Number(env[kind==='image'?'GUEST_IMAGE_RESERVATION_NANODOLLARS':'GUEST_TEXT_RESERVATION_NANODOLLARS']);
  return Number.isSafeInteger(configured)&&configured>0&&configured<=GUEST_CAP?configured:10000000000;
 }
 if(kind==='image')return 10000000000;
 const value=Number(env.TEXT_RESERVATION_NANODOLLARS);
 if(Number.isSafeInteger(value)&&value>0)return value;
 throw Object.assign(Error('Explicit positive reservation required'),{status:409});
}
export async function claimPaid(env,jobId,reservation,principalId='owner'){
 const isGuest=principalId!=='owner';if(isGuest&&!guestPaidEnabled(env))return false;
 if(!Number.isSafeInteger(reservation)||reservation<=0)throw Error('Explicit positive reservation required');

 await ensureGuestPeriod(env);const scope=isGuest?'guests-shared-hard-v2':'owner';
 // One conditional INSERT is the lock and the idempotency claim. Unknown outcomes
 // never time out. Available funds must cover the full new reservation.
 const r=await env.DB.prepare(`INSERT OR IGNORE INTO attempts (job_id,mode,status,reservation,created_at,principal_id,budget_scope)
 SELECT ?,'live','claimed',?,?,?,CASE WHEN ?='owner' THEN 'owner' ELSE COALESCE('guests-shared-hard-v2:'||(SELECT epoch FROM guest_budget_period WHERE id=1),'guests-shared-hard-v2') END WHERE EXISTS (SELECT 1 FROM budget b WHERE b.id=1 AND b.approved=1 AND b.historical_unknown=0
 AND NOT EXISTS (SELECT 1 FROM attempts WHERE mode='live' AND (${unresolved}))
 AND b.historical_known+COALESCE((SELECT SUM(${charged}) FROM attempts WHERE mode='live'),0)+?<=MIN(b.ceiling,100000000000))
 AND (?='owner' OR (COALESCE((SELECT SUM(${charged}) FROM attempts WHERE mode='live' AND (${currentGuest})),0)+?<=${GUEST_CAP}
 AND NOT EXISTS(SELECT 1 FROM attempts WHERE mode='live' AND (${currentGuest}) AND status='cost_bound_exceeded')))` ).bind(jobId,reservation,new Date().toISOString(),principalId,scope,reservation,principalId,reservation).run();return Boolean(r.meta.changes);
}
