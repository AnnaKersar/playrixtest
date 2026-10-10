import assert from 'node:assert/strict';
import {cardTypeMix,collectionBrief,collectionSettings,plannedCollection,imagePayload} from '../cloudflare/visitor-public/generator-model.mjs';
import {generationContract,generationInstructions} from '../cloudflare/generation-contract.mjs';
const object=i=>({object_id:'object_'+i,main_identity:'Film prop '+i,semantic_family:['instrument','audio_equipment','clothing_accessory','printed_material'][i%4],living_creatures:'none',factual_checks:['Functional parts connect to the main body','All feet contact the same ground plane'],production_category:'C2',asset_stage:'foreground_only',object_brief:'One clean illustrated film prop',contents:[],decoration:[]});
const group=(name,count,offset=0)=>({name,coherence_rationale:'Film genre',objects:Object.entries(cardTypeMix(count)).flatMap(([type,n])=>Array.from({length:n},()=>type)).map((type,i)=>({...object(i+offset),production_category:type,asset_stage:type==='C3'?'object_with_surface':type==='C4'?'whole_card':'foreground_only'}))});
const base=collectionBrief('Films','');
assert.equal(base.collection_settings.category_count,1);assert.equal(base.card_count,10);
assert.match(base.constraints,/Films -> category dimension film genres/);
const planned=plannedCollection(base,{collections:[group('Comedy',10)]});
const payload=imagePayload(planned);assert.equal(payload.objects.length,10);
assert(payload.objects.every(o=>o.generation_mode==='whole_card'&&o.brief.includes('Thematic category: Comedy')&&!o.brief.includes('Only the background above the surface is transparent')));
const custom=collectionBrief('Films','',{category_count:2,category_theme:'Film genres',categories:[{name:'Comedy',card_count:3},{name:'Adventure',card_count:7}]});
assert.equal(custom.card_count,10);
assert.equal(imagePayload(plannedCollection(custom,{collections:[group('Comedy',3),group('Adventure',7,3)]})).objects.length,10);
assert.equal(collectionBrief('Films','',{category_count:2}).card_count,20);
assert.throws(()=>plannedCollection(custom,{collections:[group('Comedy',4),group('Adventure',6,4)]}));
assert.throws(()=>plannedCollection(custom,{collections:[group('Wrong name',3),group('Adventure',7,3)]}));
assert.equal(collectionBrief('Films','',{category_count:3}).card_count,30);
assert.equal(imagePayload(plannedCollection(collectionBrief('Films','',{category_count:3}),{collections:[group('Comedy',10),group('Adventure',10,10),group('Premiere',10,20)]})).objects.length,30);
assert.throws(()=>collectionSettings({category_count:4}),/30/);
assert.throws(()=>collectionSettings({categories:[{card_count:0}]}));
for(const category of ['C1','C2','C3','C4']){
 const contract=generationContract(category,'whole_card','test|'+category),prompt=generationInstructions(contract);
 assert.equal(contract.background,'opaque');assert.match(prompt,new RegExp(category+':'));
 assert.match(prompt,/42-100%/);
 if(category==='C4'){assert.match(prompt,/NO STANDARD BACKGROUND/);assert.match(prompt,/DETAILED SCENE-FILLING SURFACE/);assert(!prompt.includes('13/255'));}else assert.match(prompt,/13\/255/);
 assert(!prompt.includes('editor adds')&&!prompt.includes('alpha zero'));
}
const seen=new Set();for(let i=0;i<30;i++)seen.add(generationContract('C2','whole_card','test|'+i).surface_finish);assert.equal(seen.size,2);
console.log('PASS default 1×10, inferred genre hierarchy, optional category names/themes/counts, whole-card payloads, reject mismatched plans before image calls, opaque C1-C4 prompts and seeded finishes; paid calls 0');


assert.deepEqual(cardTypeMix(10),{C1:3,C2:1,C3:2,C4:4});
const allOne=group('Comedy',10);allOne.objects.forEach(o=>o.production_category='C1');assert.throws(()=>plannedCollection(base,{collections:[allOne]}),/распределение/);
assert.deepEqual(payload.category_names,['Comedy']);assert.equal(payload.objects[0].thematic_category,'Comedy');
