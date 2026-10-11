import assert from 'node:assert/strict';
import {TARGETS,FIXED,PRODUCER_RATE,artistRate,scenario} from '../cloudflare/visitor-public/archive-economics.mjs';
import {createPublicGuestWorker} from '../cloudflare/public-guests.mjs';
assert.equal(PRODUCER_RATE,140000/2080);
assert(Math.abs(FIXED-2832.3076923076924)<1e-8);
assert(Math.abs(artistRate(43500)-23.435625)<1e-8);
const inputs={yieldPercent:80,cost:.1,qaMinutes:5,seconds:30,planner:0,infra:0,concurrency:1};
for(const n of TARGETS){const s=scenario(n,inputs);assert.equal(s.attempts,n*1.25);assert.equal(s.total,FIXED+s.variable);assert(Math.abs(s.perCard-7.136217948717949)<1e-8);}
assert.equal(scenario(30,{...inputs,cost:null}).variable,null);
assert.equal(scenario(30,{...inputs,yieldPercent:0}),null);
assert.equal(scenario(30,{...inputs,qaMinutes:null}),null);
assert.equal(scenario(30,{...inputs,concurrency:4}).capacityHours,scenario(30,inputs).serviceHours/4);
let calls=0;const worker=createPublicGuestWorker(()=>{throw Error('Private backend unexpectedly called');});
for(const path of ['/archive/economics.html','/archive-economics.mjs']){const r=await worker.fetch(new Request('https://example.com'+path),{PUBLIC_ASSETS:{fetch:async()=>{calls++;return new Response('public');}}});assert.equal(r.status,200);assert.equal(await r.text(),'public');assert(r.headers.get('Content-Security-Policy').includes("script-src 'self'"));}
assert.equal(calls,2);
const privateResponse=await worker.fetch(new Request('https://example.com/api/owner/archive/seed'),{});assert.equal(privateResponse.status,401);
console.table(TARGETS.map(n=>{const s=scenario(n,inputs);return {newCards:n,newUSD:s.variable.toFixed(2),withRD:s.total.toFixed(2),qaHours:s.laborHours.toFixed(2),serviceHours:s.serviceHours.toFixed(2),manual8hUSD:(n*8*artistRate(43500)).toFixed(2)};}));
console.log('PASS economics: six scenarios, fixed R&D once, missing/invalid input, concurrency, salary basis, anonymous assets and owner-route restriction.');
