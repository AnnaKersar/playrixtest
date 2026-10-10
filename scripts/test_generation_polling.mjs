import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const store=new Map(),writes=new Map();let requests=0,now=100000;
const key='card-studio-generator/v2';store.set(key,JSON.stringify({pending:{plannerKey:'p',planId:'planner_p',expectedPlanId:'planner_p',expectedRunId:'run_p',name:'Music',wishes:'',startedAt:0,paused:true}}));
const source=(await readFile(new URL('../cloudflare/visitor-public/generation-background.mjs',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replace(/export /g,'');
function tab(){const events={};const context=vm.createContext({localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{store.set(k,v);writes.set(k,(writes.get(k)||0)+1);}},window:{addEventListener:(name,fn)=>events[name]=fn,dispatchEvent(){}},document:{addEventListener(){},getElementById(){return null;}},navigator:{locks:{async request(name,options,fn){return typeof options==='function'?options():fn({});}}},setInterval(){},Event:class{},Date:class extends Date{static now(){return now;}},JSON,AbortSignal,collectionBrief:()=>({card_count:10}),plannerStopped:new Set(),plannerProgress:()=>`Plan · 0:${Math.floor(now/1000)}`,fetch:async(url,options)=>{assert(!options.method);requests++;return new Response(JSON.stringify({status:'claimed',stage:'claimed',result:null}));}});vm.runInContext(source,context);return {context,events};}
const a=tab(),b=tab();await Promise.resolve();await Promise.resolve();const state=JSON.parse(store.get(key));state.pending.paused=false;store.set(key,JSON.stringify(state));
await vm.runInContext('tick()',a.context);await vm.runInContext('tick()',b.context);assert.equal(requests,1);
now+=2000;await vm.runInContext('tick()',a.context);await vm.runInContext('tick()',b.context);assert.equal(requests,1);
now+=10000;await vm.runInContext('tick()',b.context);assert.equal(requests,2);assert.equal(writes.get('card-studio-generation-progress/v1'),1);
now+=10000;a.events.storage({key:'card-studio-generation-progress/v1'});await Promise.resolve();assert.equal(requests,2);
assert.equal(writes.get(key)||0,0);
console.log('PASS shared 10-second gate across tabs, no progress-triggered polling, unchanged progress/state not saved repeatedly, GET only; paid sends 0');
store.set(key,JSON.stringify({pending:{plannerKey:'q',runKey:'rq',planId:'planner_q',expectedPlanId:'planner_q',expectedRunId:'run_q',name:'Music',wishes:'',startedAt:0,paused:true}}));
const c=tab();await Promise.resolve();await Promise.resolve();let planGets=0,runPosts=0;
c.context.plannedCollection=()=>({approved:true});c.context.imagePayload=()=>({objects:[]});c.context.imageProgress=()=> 'Images queued';
c.context.fetch=async(url,options)=>{
 if(url.startsWith('/api/planner?')){planGets++;return new Response(JSON.stringify({status:'complete',result:{plan:{collections:[{name:'Jazz',objects:[]}]}}}));}
 if(url==='/api/runs'){runPosts++;const payload=JSON.parse(options.body);assert.equal(payload.requestId,'rq');return new Response(JSON.stringify({runId:'run_q'}));}
 assert.equal(runPosts,1,'No missing-run lookup before creating the run');return new Response(JSON.stringify({jobs:[]}));
};
const ready=JSON.parse(store.get(key));ready.pending.paused=false;store.set(key,JSON.stringify(ready));now+=20000;
await vm.runInContext('tick()',c.context);assert.equal(runPosts,1);assert.equal(planGets,1);assert.equal(JSON.parse(store.get(key)).pending.runId,'run_q');
now+=20000;await vm.runInContext('tick()',c.context);assert.equal(runPosts,1);assert.equal(planGets,1);
console.log('PASS completed plan proceeds to one stable-id run submission, no missing-resource probe or repeated planner send; simulated network only');

