import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {gameStats} from '../cloudflare/mini-game-stats.mjs';
import {GAME_RUN} from '../cloudflare/mini-game.mjs';
import {libraryReferences} from '../cloudflare/reference-library-data.mjs';
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE jobs (id TEXT,run_id TEXT,status TEXT)');
for(let i=0;i<30;i++)db.prepare('INSERT INTO jobs VALUES (?,?,?)').run(GAME_RUN+'_o'+i,GAME_RUN,'complete');
function prepare(sql,args=[]){return {bind(...v){return prepare(sql,v)},async run(){return db.prepare(sql).run(...args)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}}}}
const env={DB:{prepare,async batch(stmts){for(const s of stmts)await s.run()}}};
async function call(path,body){const r=await gameStats(new Request('https://test'+path,body?{method:'POST',headers:{Origin:'https://test'},body:JSON.stringify(body)}:{}),env);assert.equal(r.status,200);return r.json();}
const participant=crypto.randomUUID(),attempt=(await call('/api/game/start',{participant,protocol:'simultaneous/v2'})).id,refs=libraryReferences.slice(0,5).map(r=>r.id);
for(let i=0;i<30;i++){const generated=GAME_RUN+'_o'+i,b={attempt,round:i+1,options:[generated,...refs],selected:i%2?refs[0]:generated};await call('/api/game/answer',b);await call('/api/game/answer',b);}
let stats=await call('/api/game/stats');assert.equal(stats.attempts.length,1);assert.equal(stats.attempts[0].score,15);assert.equal(stats.participants,1);assert.equal(stats.votes.find(c=>c.card===refs[0]).votes,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM game_answers').get().n,30);
const again=(await call('/api/game/start',{participant,protocol:'simultaneous/v2'})).id;await call('/api/game/answer',{attempt:again,round:1,options:[GAME_RUN+'_o0',...refs],selected:GAME_RUN+'_o0'});stats=await call('/api/game/stats');assert.equal(stats.votes.find(c=>c.card===GAME_RUN+'_o0').votes,1);assert.equal(stats.participants,1);assert.equal(stats.attempts.length,1);
const old=(await call('/api/game/start',{participant:crypto.randomUUID()})).id;await call('/api/game/answer',{attempt:old,round:1,options:[GAME_RUN+'_o1',...refs],selected:GAME_RUN+'_o1'});stats=await call('/api/game/stats');assert.equal(stats.archived.length,1);assert.equal(stats.participants,1);assert.equal(stats.votes.find(c=>c.card===GAME_RUN+'_o1').votes,0);
console.log('PASS durable 30-round summary, score, idempotent retries, repeated-browser vote deduplication and incomplete attempts excluded');
