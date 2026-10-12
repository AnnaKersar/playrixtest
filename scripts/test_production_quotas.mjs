import assert from 'node:assert/strict';
import {cardTypeMix,productionQuotaIssues,validateProductionQuotas,quotaRepairInstruction} from '../cloudflare/visitor-public/production-quotas.mjs';
import {parsePlan} from '../cloudflare/text-planner.mjs';
import {plannerSchema} from '../cloudflare/planner-contract.mjs';
import {createPlanReview} from '../cloudflare/visitor-public/plan-review.mjs';
import {createPublicGuestWorker} from '../cloudflare/public-guests.mjs';
const settings={categories:Array.from({length:3},()=>({card_count:10,production_type_mix:cardTypeMix(10)}))};
const group=index=>({name:'Категория '+index,objects:['C1','C4','C3','C1','C2','C4','C1','C3','C4','C4'].map((type,i)=>({object_id:'category_'+index+'_'+i,production_category:type}))});
const plan={collections:[group(1),group(2),group(3)]};
validateProductionQuotas(plan,settings);
plan.collections[2].objects[8].production_category='C1';
const before=JSON.stringify(plan),issues=productionQuotaIssues(plan,settings);
assert.equal(issues.length,1);assert.equal(issues[0].index,3);
assert.deepEqual(issues[0].actual,{C1:4,C2:1,C3:2,C4:3});
assert.throws(()=>validateProductionQuotas(plan,settings),/C1=3, C2=1, C3=2, C4=4; в плане: C1=4, C2=1, C3=2, C4=3/);
assert.match(quotaRepairInstruction(issues),/простая смена метки недопустима/);
assert.equal(JSON.stringify(plan),before,'Validation never relabels or discards subjects');
for(let count=1;count<=15;count++)assert.equal(Object.values(cardTypeMix(count)).reduce((a,b)=>a+b,0),count);
assert.throws(()=>validateProductionQuotas({collections:plan.collections.slice(0,2)},settings),/3 тематических/);
function fixture(s){if(s.enum)return s.enum[0];if(s.type==='array')return [];if(s.type==='object')return Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,fixture(v)]));return 'fixture';}
const serverPlan=fixture(plannerSchema),objectSchema=plannerSchema.properties.collections.items.properties.objects.items;
serverPlan.collections=plan.collections.map(c=>({...fixture(plannerSchema.properties.collections.items),...c,objects:c.objects.map(o=>({...fixture(objectSchema),...o}))}));
const frozen={planner_version:'narrative-collection-designer/v1.5',input:{immutable_art_direction:{version:'fixture',sha256:'a'.repeat(64)},preset_collections:JSON.stringify(settings)}};
try{parsePlan({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(serverPlan)}]}]},frozen);assert.fail('Server accepted wrong quota');}catch(e){assert.match(e.message,/категории 3/);assert.equal(e.planDraft.collections.length,3,'Invalid plan remains available for repair');}
class Element{constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.value='';this.textContent='';}append(...children){this.children.push(...children);}setAttribute(k,v){this.attributes[k]=v;}replaceChildren(...children){this.children=children;}querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);}}
globalThis.document={createElement:tag=>new Element(tag)};
const sends=[],review=createPlanReview({storage:{getItem:()=>null,setItem(){},removeItem(){}},approve:()=>assert.fail('Invalid plan must not send images'),revise:(instruction,ids)=>sends.push({instruction,ids})});
review.update({planId:'planner_saved',draft:{collection_settings:settings},planResult:plan});
const buttons=review.panel.querySelectorAll('button'),repair=buttons.find(b=>b.textContent==='Исправить распределение C1–C4'),approve=buttons.find(b=>b.textContent==='Подтвердить и создать карточки');
assert.equal(approve.disabled,true);assert.equal(repair.hidden,false);repair.onclick();assert.equal(sends.length,0,'Staging repair never spends money');
await buttons.find(b=>b.textContent==='Отправить изменения').onclick();
assert.equal(sends.length,1);assert.deepEqual(sends[0].ids,[],'Quota repair does not blacklist unchanged subjects');assert.match(sends[0].instruction,/категории 3/);
console.log('PASS exact category-3 regression, server rejection with preserved draft, saved-plan repair, no implicit submission or relabeling; paid calls 0');
const publicWorker=createPublicGuestWorker();
const response=await publicWorker.fetch(new Request('https://fixture.test/production-quotas.mjs'),{PUBLIC_ASSETS:{fetch:async()=>new Response('export const fixture=true;',{headers:{'Content-Type':'application/javascript'}})}},{});
assert.equal(response.status,200);assert.match(await response.text(),/fixture/);
console.log('PASS quota module is publicly served to anonymous visitors');
