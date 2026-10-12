import assert from 'node:assert/strict';
import {plannerPrompt,plannerSchema,PLANNER_VERSION} from '../cloudflare/planner-contract.mjs';
import {artDirectionRule,compilerCompositionRules,resultReviewInstructions} from '../cloudflare/art-direction-policy.mjs';
import {compileObjectPrompt} from '../cloudflare/object-content-policy.mjs';
import {generationContract} from '../cloudflare/generation-contract.mjs';
import {validateUniqueSubjects,validatePlannerPresentation} from '../cloudflare/visitor-public/collection-policy.mjs';
import {imagePayload} from '../cloudflare/visitor-public/studio/flow-model.mjs';
import {parsePlan,strictSchema,boundPlannerSchema} from '../cloudflare/text-planner.mjs';
assert.equal(PLANNER_VERSION,'narrative-collection-designer/v1.5');
for(const h of ['CENTERING','FRAMING AND UI SAFETY','STYLE AND DETAIL','COLLECTION CONSISTENCY'])assert.ok(compilerCompositionRules.includes(h));
assert.ok(artDirectionRule.includes(compilerCompositionRules));assert.ok(resultReviewInstructions.includes('Exclude cast shadows'));
const schema=plannerSchema.properties.collections.items.properties.objects.items;
for(const k of ['display_name','subject_semantic_key','theme_facet'])assert.ok(schema.required.includes(k));
assert.ok(plannerPrompt.includes('Each of ten subjects'));assert.ok(!schema.properties.composition_key.enum.includes('upright-offset'));
const items=[{object_id:'p01',main_identity:'A red jigsaw puzzle',display_name:'Мозаика',subject_semantic_key:'jigsaw_puzzle',theme_facet:'Разгадка загадки'},{object_id:'p02',main_identity:'A blue assembled puzzle',display_name:'Пазл',subject_semantic_key:'jigsaw-puzzle',theme_facet:'Собранная загадка'}];
assert.throws(()=>validateUniqueSubjects(items),/Смысловой дубль/);
assert.throws(()=>validateUniqueSubjects([{main_identity:'A domino tower'},{main_identity:'Three domino tiles'}]),/Повторяется/);
validatePlannerPresentation([items[0]]);assert.throws(()=>validatePlannerPresentation([{...items[0],display_name:'p01'}]),/название/);assert.throws(()=>validatePlannerPresentation([items[0],{...items[1],theme_facet:items[0].theme_facet}]),/сторону/);
for(const category of ['C1','C2','C3','C4']){const p=compileObjectPrompt({art_direction:'PINNED BASE EXACT',generalized_rules:'PINNED RULES'},'SUBJECT',generationContract(category,'whole_card'));assert.ok(p.includes('PINNED BASE EXACT'));assert.ok(p.includes('STYLE AND DETAIL'));assert.ok(p.includes('horizontally center the complete focal subject at x=50%'));assert.ok(!p.includes('actual base contacts the plane at y=88%'));assert.ok(p.includes('Avoid photorealistic surface noise'));}
const d={theme:'Cinema',collection_name:'Films',card_count:1,approved:true,objects:[{...items[0],name:items[0].display_name,category:'C1',brief:'Thematic subject'}]};
const out=imagePayload(d).objects[0];assert.equal(out.name,'Мозаика');assert.equal(out.subject_semantic_key,'jigsaw_puzzle');assert.equal(out.object_id,'p01');
function fixture(s){if(s.enum)return s.enum[0];if(s.type==='string')return s.pattern?'a'.repeat(64):'Concrete coherent field';if(s.type==='array')return [];if(s.type==='object')return Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,fixture(v)]));}
const plan=fixture(strictSchema(plannerSchema)),collection=fixture(strictSchema(plannerSchema.properties.collections.items)),subject=fixture(strictSchema(schema));
Object.assign(subject,{object_id:'subject',display_name:'Мозаика',main_identity:'A jigsaw puzzle',subject_semantic_key:'jigsaw',theme_facet:'Разгадка',semantic_family:'game',living_creatures:'none',factual_checks:['All puzzle pieces fit coherent interlocks','Puzzle board has consistent perspective']});collection.objects=[subject];plan.collections=[collection];plan.art_direction_sha256='a'.repeat(64);plan.art_direction_version='base';
const frozen={planner_version:PLANNER_VERSION,input:{immutable_art_direction:{sha256:'a'.repeat(64),version:'base'}}},payload={status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(plan)}]}]};
assert.equal(parsePlan(payload,frozen).objects[0].name,'Мозаика');
const legacy=structuredClone(plan);for(const k of ['display_name','subject_semantic_key','theme_facet'])delete legacy.collections[0].objects[0][k];legacy.collections[0].objects[0].composition_key='upright-offset';
assert.equal(parsePlan({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(legacy)}]}]},{...frozen,planner_version:'narrative-collection-designer/v1.4'}).objects[0].name,'A jigsaw puzzle');
console.log('PASS universal prompt blocks, pinned base preservation, C1-C4 centering, title/metadata transport, semantic/facet duplicates, new plan validation and legacy compatibility; paid calls 0');

const metadataMismatch=structuredClone(plan);metadataMismatch.art_direction_version='supplemental-art-direction-version';metadataMismatch.art_direction_sha256='b'.repeat(64);const rawMismatch={status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(metadataMismatch)}]}]},repaired=parsePlan(rawMismatch,frozen);assert.equal(repaired.art_direction_version,'base');assert.equal(repaired.art_direction_sha256,'a'.repeat(64));assert.equal(repaired.art_direction_metadata.corrected,true);assert.equal(repaired.art_direction_metadata.reported.version,'supplemental-art-direction-version');assert.equal(JSON.parse(rawMismatch.output[0].content[0].text).art_direction_sha256,'b'.repeat(64));assert.deepEqual(boundPlannerSchema(frozen).properties.art_direction_sha256.enum,['a'.repeat(64)]);console.log('PASS metadata bound to immutable input, model-reported mismatch retained, raw response unchanged; no provider call');
