import assert from 'node:assert/strict';
import {plannerHTTPError} from '../cloudflare/planner-http-error.mjs';
import {closeRejectedPlanner,textRequest} from '../cloudflare/text-planner.mjs';
for(const [code,type,reason] of [['rate_limit_exceeded','rate_limit_error','rate_limit'],['slow_down','rate_limit_error','rate_limit'],['insufficient_quota','insufficient_quota','quota'],['organization_spend_limit_exceeded','insufficient_quota','quota']]){
 const err=await plannerHTTPError(Response.json({error:{code,type,message:'private input NEVER echo'}},{status:429,headers:{'retry-after':'30','x-request-id':'req-123'}}));
 assert.equal(err.provider_error.reason,reason);assert.equal(err.planner_rejection,true);assert(!JSON.stringify(err.provider_error).includes('private input'));assert.equal(err.provider_error.retry_after,'30');
}
const unknown=await plannerHTTPError(new Response('HTML', {status:429}));assert.equal(unknown.provider_error.reason,'unknown');
let sends=0;await assert.rejects(()=>textRequest({LIVE_PLANNER_ENABLED:'true',OPENAI_API_KEY:'test-fixture'},{input:{immutable_art_direction:{version:'v',sha256:'a'.repeat(64)}},model:'fixture'},async()=>{sends++;return Response.json({error:{code:'rate_limit_exceeded',type:'rate_limit_error'}},{status:429});}),e=>e.planner_rejection);assert.equal(sends,1);
const writes=[],puts=new Map(),attempt={actual:null,receipt_key:null,error:'Planner HTTP 429'};
const env={DB:{prepare(sql){return {bind(...args){return {async first(){return sql.includes('FROM attempts')?attempt:sql.includes('FROM planner_requests')?{id:'planner_a',result_key:null,status:'needs_review'}:null;},async run(){writes.push({sql,args});}};}};},async batch(stmts){for(const stmt of stmts)await stmt.run();}},ARTIFACTS:{async put(key,value){puts.set(key,JSON.parse(value));}}};
const result=await closeRejectedPlanner(env,'planner_a');assert.equal(result.provider_error.reason,'unknown');assert.equal(puts.get(result.resultKey).provider_calls,0);assert(writes.some(w=>w.sql.includes("closed_reserved_unknown")));assert(writes.some(w=>w.sql.includes('reservation=1000000000')));assert(!writes.some(w=>w.sql.includes('actual=0')));
attempt.error='Network timeout';assert.equal(await closeRejectedPlanner(env,'planner_a'),null);
console.log('PASS 429 rate/quota classification, safe diagnostics, one mocked send, legacy $1 closure, no timeout closure or fake zero cost; paid calls 0.');
