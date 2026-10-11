import assert from 'node:assert/strict';
import {TARGETS,FIXED,CASH,PRODUCER_LABOR,artistRate,scenario,breakEven,GRADES,DEFAULTS} from '../cloudflare/visitor-public/archive-economics.mjs';
import {createPublicGuestWorker} from '../cloudflare/public-guests.mjs';
assert(Math.abs(FIXED-2832.3076923076924)<1e-8);
assert.equal(CASH,140);assert.equal(PRODUCER_LABOR.toFixed(2),'2692.31');
assert.equal((PRODUCER_LABOR/FIXED*100).toFixed(1),'95.1');
assert.equal((CASH/FIXED*100).toFixed(1),'4.9');
assert(Math.abs(artistRate(43500)-23.435625)<1e-8);
const expected=['2834.10','2837.67','2850.20','2885.97','3011.18','4621.06'];
for(const [i,n] of TARGETS.entries()){const s=scenario(n);assert.equal(s.total.toFixed(2),expected[i]);assert(Math.abs(s.variable/n-.178875)<1e-8);assert.equal(s.total,FIXED+s.variable);assert.equal(s.briefHours,Math.ceil(n/10)*2/60);}
assert.equal(scenario(10).grades[0].difference.toFixed(2),'-2078.34');
assert.equal(scenario(30).grades[1].difference.toFixed(2),'1041.33');
assert.equal(scenario(10000).grades[2].difference.toFixed(2),'1870228.94');
assert.equal(scenario(30,{...DEFAULTS,cost:null}),null);
assert.equal(scenario(30,{...DEFAULTS,yieldPercent:0}),null);
assert.equal(scenario(30,{...DEFAULTS,briefMinutes:-1}),null);
assert(Math.abs(scenario(11).variable-(11*.125+2*.53875))<1e-8);
for(const [i,g] of GRADES.entries()){assert.deepEqual(breakEven(g.salary),{cards:[38,22,16][i],collections:[40,30,20][i]});}
for(const [i,g] of GRADES.entries()){assert.deepEqual(breakEven(g.salary,DEFAULTS,CASH),{cards:[2,2,1][i],collections:10});}
assert.equal(breakEven(17535,{...DEFAULTS,cost:1000}).cards,null);
let calls=0;const worker=createPublicGuestWorker(()=>{throw Error('Private backend unexpectedly called');});
for(const path of ['/archive/economics.html','/archive/economics','/archive/economics/','/archive-economics.mjs']){const r=await worker.fetch(new Request('https://example.com'+path),{PUBLIC_ASSETS:{fetch:async()=>{calls++;return new Response('public');}}});assert.equal(r.status,200);assert(r.headers.get('Content-Security-Policy').includes("script-src 'self'"));}
assert.equal(calls,4);
assert.equal((await worker.fetch(new Request('https://example.com/api/owner/archive/seed'),{})).status,401);
console.table(TARGETS.map(n=>{const s=scenario(n);return {newCards:n,newUSD:s.variable.toFixed(2),withRD:s.total.toFixed(2),perCard:s.perCard.toFixed(2),juniorDifference:s.grades[0].difference.toFixed(2),middleDifference:s.grades[1].difference.toFixed(2),seniorDifference:s.grades[2].difference.toFixed(2)};}));
console.log('PASS simple economics: six exact scenarios, salary grades, signed differences, stepped break-even, partial collection, invalid inputs, zero ongoing producer QA, anonymous assets and owner restrictions.');
