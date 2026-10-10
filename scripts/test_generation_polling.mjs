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

