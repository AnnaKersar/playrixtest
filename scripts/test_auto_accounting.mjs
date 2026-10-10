import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {reconcilePreviousAttempts} from '../cloudflare/worker.mjs';
const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
function statement(sql,args=[]){return {bind(...a){return statement(sql,a)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}}}
const objects=new Map(),env={DB:{prepare:statement},ARTIFACTS:{async head(k){return objects.has(k)?{}:null},async get(k){return objects.has(k)?{json:async()=>objects.get(k)}:null}}};
db.prepare("INSERT INTO runs (id,mode,name,frozen_key,frozen_sha,created_at) VALUES ('r','live','test','f','s',?)").run(new Date().toISOString());
for(const id of ['old','active','saved']){
 db.prepare('INSERT INTO jobs (id,run_id,object_id) VALUES (?,?,?)').run(id,'r',id);
 db.prepare("INSERT INTO attempts (job_id,mode,status,reservation,created_at) VALUES (?,'live','claimed',10000000000,?)").run(id,new Date(Date.now()-(id==='old'?21*60*1000:1000)).toISOString());
}
objects.set('runs/r/saved/receipt.json',{raw_key:'runs/r/saved/raw.png',raw_sha256:'s',cost:120000000,usage:null});
const auth={role:'owner',principalId:'owner'},result=await reconcilePreviousAttempts(env,auth);
assert.equal(result.closed_unknown,1);assert.equal(result.settled,1);assert.equal(result.still_running,1);assert.equal(result.provider_calls,0);
assert.equal(db.prepare("SELECT reservation FROM attempts WHERE job_id='old'").get().reservation,1000000000);
assert.equal(db.prepare("SELECT actual FROM attempts WHERE job_id='saved'").get().actual,120000000);
assert.equal(db.prepare("SELECT status FROM attempts WHERE job_id='active'").get().status,'claimed');
const again=await reconcilePreviousAttempts(env,auth);assert.equal(again.closed_unknown,0);assert.equal(again.settled,0);
await assert.rejects(()=>reconcilePreviousAttempts(env,{role:'guest'}));
console.log('PASS durable receipt settlement, expired unknown $1, active request protected, idempotency and owner access; provider calls 0');

