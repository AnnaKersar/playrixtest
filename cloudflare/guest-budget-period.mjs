import {applyReliabilityUpgrade} from './reliability-upgrade.mjs';
import {ownerOnly} from './roles.mjs';
const ready=new WeakMap();
export async function ensureGuestPeriod(env){
 if(!ready.has(env.DB))ready.set(env.DB,(async()=>{
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS guest_budget_resets(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT UNIQUE NOT NULL,epoch TEXT UNIQUE NOT NULL,principal_id TEXT NOT NULL,created_at TEXT NOT NULL,limit_nanodollars INTEGER NOT NULL)").bind().run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS guest_budget_period(id INTEGER PRIMARY KEY CHECK(id=1),reset_id INTEGER NOT NULL,epoch TEXT NOT NULL)").bind().run();
 })().catch(e=>{ready.delete(env.DB);throw e;}));return ready.get(env.DB);
}
// Explicit allowance reset. Original attempts, actual charges and project holds stay intact.
export async function resetGuestBudget(env,auth,body){
 ownerOnly(auth);
 if(body.limit_nanodollars!==10000000000||body.acknowledgeNewPeriod!==true||!/^[-a-zA-Z0-9_]{1,120}$/.test(body.requestId||''))throw Object.assign(Error('Explicit new $10 guest period acknowledgement and request ID required'),{status:400});
 await applyReliabilityUpgrade(env);await ensureGuestPeriod(env);
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO guest_budget_resets(request_id,epoch,principal_id,created_at,limit_nanodollars) VALUES(?,?,?,?,?)').bind(body.requestId,crypto.randomUUID(),auth.principalId,new Date().toISOString(),10000000000),
  env.DB.prepare(`INSERT INTO guest_budget_period(id,reset_id,epoch) SELECT 1,id,epoch FROM guest_budget_resets WHERE request_id=?
   ON CONFLICT(id) DO UPDATE SET reset_id=excluded.reset_id,epoch=excluded.epoch WHERE excluded.reset_id>guest_budget_period.reset_id`).bind(body.requestId)
 ]);
 return {reset:true,period:await env.DB.prepare('SELECT * FROM guest_budget_period WHERE id=1').first(),limit_nanodollars:10000000000,historical_attempts_preserved:true,provider_calls:0};
}
