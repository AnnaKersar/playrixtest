import assert from 'node:assert/strict';
import {validateFactualChecks} from '../cloudflare/visitor-public/collection-policy.mjs';
import {boundPlannerSchema,parsePlan} from '../cloudflare/text-planner.mjs';
import {plannerSchema} from '../cloudflare/planner-contract.mjs';
validateFactualChecks({factual_checks:['Two wheels','4 ножки']});
assert.throws(()=>validateFactualChecks({display_name:'Каска',factual_checks:['One check']}),/Каска/);
assert.throws(()=>validateFactualChecks({factual_checks:['Correct proportions','Correct construction']}),/Проверки конструкции/);
const frozen={planner_version:'narrative-collection-designer/v1.5',input:{immutable_art_direction:{version:'fixture',sha256:'a'.repeat(64)}}},schema=boundPlannerSchema(frozen);
assert.equal(schema.properties.collections.items.properties.objects.items.properties.factual_checks.minItems,2);
function fixture(s){
 if(s.const!==undefined)return s.const;if(s.enum)return s.enum[0];
 if(s.type==='array')return [];if(s.type==='object')return Object.fromEntries(Object.entries(s.properties||{}).map(([k,v])=>[k,fixture(v)]));if(s.type==='number'||s.type==='integer')return 1;if(s.type==='boolean')return false;return 'fixture';
}
const plan=fixture(plannerSchema);plan.art_direction_version='fixture';plan.art_direction_sha256='a'.repeat(64);
const category=fixture(plannerSchema.properties.collections.items),object=fixture(plannerSchema.properties.collections.items.properties.objects.items);
object.living_creatures='none';object.semantic_family='tool';object.factual_checks=['Single incomplete check'];category.objects=[object];plan.collections=[category];
try{parsePlan({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(plan)}]}]},frozen);assert.fail('Expected construction validation');}catch(e){assert(e.message.startsWith('Проверки конструкции:'),e.message);assert.equal(e.planDraft.collections[0].objects[0].factual_checks.length,1);}
console.log('PASS short concrete checks, generic rejection, schema minimum, saved structurally valid draft after construction error; paid calls 0.');
