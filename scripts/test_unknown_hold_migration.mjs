import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {fixture} from './reliability-fixture.mjs';
const f=await fixture(),sql=await readFile('cloudflare/migration-008-unknown-holds.sql','utf8');f.db.exec('DELETE FROM schema_version WHERE version=8');
function seed(id,type,manual=false,actual=null){f.db.prepare("INSERT INTO attempts(job_id,mode,status,reservation,actual,created_at) VALUES(?,'live','closed_reserved_unknown',1000000000,?,'2020')").run(id,actual);
 f.db.prepare('INSERT INTO experiment_journal VALUES(?,?,?,?)').run(id,JSON.stringify({reservation_nanodollars:10000000000}),'fixture','2020');
 const suffix=type==='stop'?'user-stop-reserve':type==='429'?'http-429-closed':'auto-unknown-reserve-one-dollar';
 f.db.prepare('INSERT INTO experiment_journal_events VALUES(?,?,?,?,?,?)').run(id+':'+suffix,id,type==='auto'?'automatic_accounting_reconciliation':type==='stop'?'manual_accounting_closure':'provider_rejected',JSON.stringify({reservation_nanodollars:1000000000,previous_reservation_nanodollars:10000000000,actual_cost_nanodollars:null}),'fixture','2020');
 if(manual)f.db.prepare('INSERT INTO experiment_journal_events VALUES(?,?,?,?,?,?)').run(id+':manual-dollar',id,'manual_accounting_reserve_adjustment',JSON.stringify({reservation_nanodollars:1000000000}),'fixture','2021');
}
seed('auto','auto');seed('stop','stop');seed('rejected','429');seed('manual','auto',true);seed('known','auto',false,141000);
f.db.exec(sql);for(const id of ['auto','stop','rejected']){const a=f.db.prepare('SELECT * FROM attempts WHERE job_id=?').get(id);assert.equal(a.reservation,10000000000);assert.equal(a.status,'unknown');assert.equal(a.actual,null);}
assert.equal(f.db.prepare("SELECT reservation FROM attempts WHERE job_id='manual'").get().reservation,1000000000);assert.equal(f.db.prepare("SELECT actual FROM attempts WHERE job_id='known'").get().actual,141000);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM unknown_hold_restorations').get().n,3);
f.db.exec("UPDATE attempts SET status='closed_reserved_unknown',reservation=1000000000 WHERE job_id='auto'");f.db.exec(sql);assert.equal(f.db.prepare("SELECT reservation FROM attempts WHERE job_id='auto'").get().reservation,1000000000,'One-time migration cannot reverse a later manual decision');
console.log('PASS automated $1/Stop/429 closures restore original $10 hold; explicit manual decisions and actual charges preserved; auditable, one-time migration');f.db.close();
