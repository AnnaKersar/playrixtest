import assert from 'node:assert/strict';import {fixture} from './reliability-fixture.mjs';
import {claimPaid,budgetState,GUEST_CAP} from '../cloudflare/budget.mjs';import {stopGeneration} from '../cloudflare/stop-generation.mjs';
const f=await fixture();assert.equal(GUEST_CAP,10000000000);
// Multiple independent principals race for the same pool; each SQL INSERT checks the hold atomically.
const claims=await Promise.all(Array.from({length:12},(_,i)=>claimPaid(f.env,'guest-'+i,2000000000,'guest:'+i)));
assert.equal(claims.filter(Boolean).length,5);let b=await budgetState(f.env);assert.equal(b.guest_remaining,0);assert.equal(b.active_reserved,10000000000);assert.equal(b.actual_spent,0);
assert.equal(await claimPaid(f.env,'guest-0',2000000000,'guest:0'),false);
f.db.prepare("UPDATE attempts SET actual=1900000000,status='complete' WHERE job_id='guest-0'").run();
assert.equal(await claimPaid(f.env,'cross-cap',200000000,'guest:x'),false);assert.equal(await claimPaid(f.env,'exact-cap',100000000,'guest:x'),true);
b=await budgetState(f.env);assert.equal(b.guest_committed,10000000000);assert.equal(b.actual_spent,1900000000);assert.equal(b.active_reserved,8100000000);
// A ledger already over the corrected ceiling is retained, never reset to make new funds available.
f.db.prepare("UPDATE attempts SET actual=19900000000,status='complete' WHERE job_id='guest-0'").run();assert.equal(await claimPaid(f.env,'old-19-90',200000000,'guest:z'),false);assert.equal(f.db.prepare("SELECT actual FROM attempts WHERE job_id='guest-0'").get().actual,19900000000);
// Stopping an unknown provider outcome preserves the entire original $10 hold.
f.db.prepare("INSERT INTO runs VALUES ('unknown-run','live','Unknown','frozen','sha','2020-01-01','owner')").run();f.db.prepare("INSERT INTO jobs(id,run_id,object_id,status) VALUES ('unknown-job','unknown-run','o','running')").run();
f.db.prepare("INSERT INTO attempts(job_id,mode,status,reservation,created_at) VALUES ('unknown-job','live','unknown',10000000000,'2020-01-01')").run();
await stopGeneration(f.env,{role:'owner',principalId:'owner'},{runId:'unknown-run'});const a=f.db.prepare("SELECT * FROM attempts WHERE job_id='unknown-job'").get();assert.equal(a.status,'unknown');assert.equal(a.reservation,10000000000);assert.equal(a.actual,null);
f.db.close();const breach=await fixture();
assert.equal(await claimPaid(breach.env,'over-hold',1000000000,'guest:a'),true);
breach.db.prepare("UPDATE attempts SET actual=1100000000,status='cost_bound_exceeded' WHERE job_id='over-hold'").run();
const exceeded=await budgetState(breach.env);assert.equal(exceeded.actual_spent,1100000000);assert.deepEqual(exceeded.guest_live_blockers,['guest_reservation_bound_exceeded']);
assert.equal(await claimPaid(breach.env,'after-breach',1000000000,'guest:b'),false);
assert.equal(await claimPaid(breach.env,'owner-independent',1000000000,'owner'),true);breach.db.close();
console.log('PASS atomic 12-principal reservations, exact-cap acceptance, overspend rejection, historical ledger/full unknown hold, breach stops guests without clamping actual costs; provider calls 0');
