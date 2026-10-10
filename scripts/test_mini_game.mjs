import assert from 'node:assert/strict';
import {miniGame,GAME_RUN} from '../cloudflare/mini-game.mjs';
let reads=0;const jobs=Array.from({length:30},(_,i)=>({id:GAME_RUN+'_o'+i,object_id:'o'+i}));
const env={
 DB:{prepare(sql){return {bind(...args){assert(args.includes(GAME_RUN));return {
  async first(){reads++;return sql.includes('final_key')?{final_key:'final'}:{frozen_key:'f'}},
  async all(){reads++;return {results:jobs}}
 };}};}},
 ARTIFACTS:{async get(key){return key==='f'?{json:async()=>({objects:jobs.map(j=>({object_id:j.object_id,category:'C2'}))})}:{body:new Uint8Array([1,2])};}}
};
let r=await miniGame(new Request('https://test/api/game'),env);const d=await r.json();assert.equal(d.cards.length,30);assert(d.cards.every(c=>c.id.startsWith(GAME_RUN+'_')&&c.category==='C2'));
const before=reads;r=await miniGame(new Request('https://test/api/game/image?job=old-run_o1'),env);assert.equal(r.status,404);assert.equal(reads,before);
r=await miniGame(new Request('https://test/api/game/image?job='+jobs[0].id),env);assert.equal(r.status,200);
r=await miniGame(new Request('https://test/api/game',{method:'POST'}),env);assert.equal(r.status,405);
console.log('PASS 30 fixed-batch cards, other runs inaccessible, image read and no mutations/provider calls');
