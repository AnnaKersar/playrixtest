import {ownerIdentity} from './owner-session.mjs';
import {GAME_RUN} from './mini-game.mjs';
import {libraryReferences} from './reference-library-data.mjs';
const initialized=new WeakMap();
async function schema(db){if(!initialized.has(db))initialized.set(db,db.batch([
 db.prepare('CREATE TABLE IF NOT EXISTS game_attempts (id TEXT PRIMARY KEY, participant TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, score INTEGER NOT NULL DEFAULT 0, is_test INTEGER NOT NULL DEFAULT 0)'),
 db.prepare('CREATE TABLE IF NOT EXISTS game_protocols (attempt_id TEXT PRIMARY KEY, version TEXT NOT NULL)'),
 db.prepare('CREATE TABLE IF NOT EXISTS game_answers (attempt_id TEXT NOT NULL, round INTEGER NOT NULL, generated TEXT NOT NULL, selected TEXT NOT NULL, correct INTEGER NOT NULL, options TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(attempt_id,round), UNIQUE(attempt_id,generated))')
]).catch(e=>{initialized.delete(db);throw e}));await initialized.get(db);}
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
const json=(v,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
export async function gameStats(request,env){
 const u=new URL(request.url);if(!env.DB)return json({error:'Статистика временно недоступна'},503);
 await schema(env.DB);
 if(request.method==='GET'){
  const votes=(await env.DB.prepare(`SELECT o.value card, COUNT(DISTINCT p.participant) shown, COUNT(DISTINCT CASE WHEN a.selected=o.value THEN p.participant END) votes FROM game_answers a JOIN game_attempts p ON p.id=a.attempt_id JOIN game_protocols protocol ON protocol.attempt_id=p.id AND protocol.version='simultaneous/v2' JOIN json_each(a.options) o WHERE p.is_test=0 GROUP BY o.value`).all()).results;
  const attempts=(await env.DB.prepare('SELECT started_at,finished_at,score FROM game_attempts WHERE finished_at IS NOT NULL AND is_test=0 AND id IN (SELECT attempt_id FROM game_protocols WHERE version=\'simultaneous/v2\') ORDER BY finished_at DESC LIMIT 100').all()).results;
  const archived=(await env.DB.prepare("SELECT started_at,finished_at,score FROM game_attempts WHERE is_test=0 AND id NOT IN (SELECT attempt_id FROM game_protocols WHERE version='simultaneous/v2') ORDER BY started_at DESC LIMIT 100").all()).results;
  return json({votes,attempts,archived,archive_reason:'Нерелевантны: карточки появлялись в разное время, что подсказывало источник изображения.',participants:(await env.DB.prepare('SELECT COUNT(DISTINCT participant) total FROM game_attempts WHERE is_test=0 AND id IN (SELECT attempt_id FROM game_protocols WHERE version=\'simultaneous/v2\')').first()).total});
 }
 if(request.method!=='POST'||request.headers.get('Origin')!==u.origin)return json({error:'Same-origin POST required'},403);
 const raw=await request.text();if(raw.length>5000)return json({error:'Payload too large'},413);let b;try{b=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
 if(u.pathname==='/api/game/start'){
  if(!uuid(b.participant))return json({error:'Invalid participant'},400);
  const test=b.preview===true;if(test&&!await ownerIdentity(request,env))return json({error:'Preview requires owner session'},403);
  const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO game_attempts (id,participant,started_at,is_test) VALUES (?,?,?,?)').bind(id,b.participant,new Date().toISOString(),test?1:0).run();if(b.protocol==='simultaneous/v2')await env.DB.prepare('INSERT INTO game_protocols VALUES (?,?)').bind(id,b.protocol).run();return json({id});
 }
 if(!uuid(b.attempt)||!Number.isInteger(b.round)||b.round<1||b.round>30||!Array.isArray(b.options)||b.options.length!==6||new Set(b.options).size!==6||!b.options.includes(b.selected))return json({error:'Invalid answer'},400);
 const generated=b.options.filter(id=>typeof id==='string'&&id.startsWith(GAME_RUN+'_'));
 if(generated.length!==1||b.options.some(id=>!generated.includes(id)&&!libraryReferences.some(r=>r.id===id)))return json({error:'Cards outside game batch'},400);
 if(!await env.DB.prepare('SELECT id FROM jobs WHERE id=? AND run_id=? AND status=\'complete\'').bind(generated[0],GAME_RUN).first())return json({error:'Invalid generated card'},400);
 const attempt=await env.DB.prepare('SELECT * FROM game_attempts WHERE id=?').bind(b.attempt).first();
 if(!attempt)return json({error:'Attempt missing'},404);
 const prior=await env.DB.prepare('SELECT selected,options FROM game_answers WHERE attempt_id=? AND round=?').bind(b.attempt,b.round).first();
 if(prior){if(prior.selected!==b.selected||prior.options!==JSON.stringify(b.options))return json({error:'Answer already saved'},409);return json({saved:true});}
 if(attempt.finished_at)return json({error:'Attempt finished'},409);
 const correct=b.selected===generated[0]?1:0;
 await env.DB.prepare('INSERT OR IGNORE INTO game_answers VALUES (?,?,?,?,?,?,?)').bind(b.attempt,b.round,generated[0],b.selected,correct,JSON.stringify(b.options),new Date().toISOString()).run();
 const summary=await env.DB.prepare('SELECT COUNT(*) count,COALESCE(SUM(correct),0) score FROM game_answers WHERE attempt_id=?').bind(b.attempt).first();
 await env.DB.prepare('UPDATE game_attempts SET score=?,finished_at=? WHERE id=?').bind(summary.score,summary.count===30?new Date().toISOString():null,b.attempt).run();
 return json({saved:true,score:summary.score,finished:summary.count===30});
}
