import assert from 'node:assert/strict';
import {TARGETS,FIXED,CASH,PRODUCER_LABOR,SOFTWARE_RATE,artistRate,roundCents,scenario,breakEven,GRADES,GD_SALARIES,DEFAULTS} from '../cloudflare/visitor-public/archive-economics.mjs';
import {createPublicGuestWorker} from '../cloudflare/public-guests.mjs';
assert(Math.abs(FIXED-2942.3076923076924)<1e-8);
assert.equal(CASH,250);assert.equal(PRODUCER_LABOR.toFixed(2),'2692.31');
assert.equal((PRODUCER_LABOR/FIXED*100).toFixed(1),'91.5');
assert.equal((CASH/FIXED*100).toFixed(1),'8.5');
assert(Math.abs(artistRate(43500)-23.435625)<1e-8);
const expected=['2949.17','2952.90','2965.95','3003.23','3133.73','4811.48'];
assert(Math.abs(SOFTWARE_RATE-.21651285)<1e-12);
for(const [i,n] of TARGETS.entries()){const s=scenario(n);assert.equal(s.total.toFixed(2),expected[i]);assert(Math.abs(s.running/n-.1864175)<1e-8);assert.equal(s.hosting,5);assert.equal(s.total,FIXED+s.variable);assert.equal(s.briefHours,Math.ceil(n/10)*2/60);assert(Math.abs(scenario(n,{...DEFAULTS,hostingMonths:3}).variable-s.variable-10)<1e-8);for(const [j,g]of s.grades.entries()){assert(Math.abs(g.wages-n*[56.6818875,48.4875,46.87125][j])<1e-7);assert(Math.abs(g.software-g.manualHours*.21651285)<1e-8);assert.equal(g.cost,g.wages+g.software);assert.equal(g.manualHours,n*[6,3,2][j]);}}
assert.equal(scenario(10).grades[0].difference.toFixed(2),'-2369.36');
assert.equal(scenario(30).grades[1].difference.toFixed(2),'-1478.79');
assert.equal(scenario(10000).grades[2].difference.toFixed(2),'468231.27');
assert.equal(roundCents(scenario(300).grades[2].wages),14061.38);
assert.equal(scenario(30,{...DEFAULTS,cost:null}),null);
assert.equal(scenario(30,{...DEFAULTS,yieldPercent:0}),null);
assert.equal(scenario(30,{...DEFAULTS,briefMinutes:-1}),null);
assert(Math.abs(scenario(11).variable-(11*.125+2*.614175+5))<1e-8);
assert(Math.abs(DEFAULTS.designerRate-18.42525)<1e-10);
const senior={...DEFAULTS,designerRate:artistRate(GD_SALARIES.senior)};
assert.equal(senior.designerRate,29.63125);
const seniorExpected=['2949.55','2954.02','2969.68','3014.44','3171.08','5185.02'];
for(const [i,n] of TARGETS.entries()){const s=scenario(n,senior);assert.equal(s.total.toFixed(2),seniorExpected[i]);assert(Math.abs(s.running/n-.22377083333333333)<1e-10);}
for(const [i,g]of GRADES.entries()){assert.deepEqual(breakEven(g.salary,senior),{cards:[52,61,63][i],collections:[60,70,70][i]});assert.deepEqual(breakEven(g.salary,senior,CASH),{cards:[5,6,6][i],collections:10});}
for(const [i,g] of GRADES.entries()){assert.deepEqual(breakEven(g.salary),{cards:[52,61,63][i],collections:[60,70,70][i]});}
for(const input of [DEFAULTS,senior,{...DEFAULTS,hostingMonths:4}])for(const fixed of [FIXED,CASH])for(const [i,g]of GRADES.entries()){const b=breakEven(g.salary,input,fixed),current=scenario(b.cards,input),previous=scenario(b.cards-1,input);assert(current.grades[i].cost>=fixed+current.variable);assert(previous.grades[i].cost<fixed+previous.variable);}
assert.equal(scenario(10,{...DEFAULTS,hostingMonths:0}),null);
for(const [i,g] of GRADES.entries()){assert.deepEqual(breakEven(g.salary,DEFAULTS,CASH),{cards:[5,6,6][i],collections:10});}
assert.equal(scenario(10,{...DEFAULTS,artistHours:[6,3,0]}),null);
assert.equal(scenario(10,{...DEFAULTS,artistHours:[6,3,null]}),null);
assert.equal(breakEven(17535,{...DEFAULTS,cost:1000}).cards,null);
let calls=0;const worker=createPublicGuestWorker(()=>{throw Error('Private backend unexpectedly called');});
for(const path of ['/archive/economics.html','/archive/economics','/archive/economics/','/archive-economics.mjs']){const r=await worker.fetch(new Request('https://example.com'+path),{PUBLIC_ASSETS:{fetch:async()=>{calls++;return new Response('public');}}});assert.equal(r.status,200);assert(r.headers.get('Content-Security-Policy').includes("script-src 'self'"));}
assert.equal(calls,4);
assert.equal((await worker.fetch(new Request('https://example.com/api/owner/archive/seed'),{})).status,401);
console.table(TARGETS.map(n=>{const s=scenario(n);return {newCards:n,newUSD:s.variable.toFixed(2),withRD:s.total.toFixed(2),perCard:s.perCard.toFixed(2),juniorDifference:s.grades[0].difference.toFixed(2),middleDifference:s.grades[1].difference.toFixed(2),seniorDifference:s.grades[2].difference.toFixed(2)};}));
console.log('PASS simple economics: six exact scenarios, salary grades, signed differences, stepped break-even, partial collection, invalid inputs, zero ongoing producer QA, anonymous assets and owner restrictions.');
