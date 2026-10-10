import assert from 'node:assert/strict';
import {categoryVisualSchedule,validateCategoryInventory,collectionRules} from '../cloudflare/visitor-public/collection-policy.mjs';
import {compileObjectPrompt} from '../cloudflare/object-content-policy.mjs';
import {generationContract} from '../cloudflare/generation-contract.mjs';
const items=Array.from({length:10},(_,i)=>({semantic_family:['instrument','audio_equipment','clothing_accessory','recorded_media'][i%4],living_creatures:'none',factual_checks:['Pedal belongs on the rear batter head','Stand feet contact a common ground plane']}));
validateCategoryInventory(items);
assert.throws(()=>validateCategoryInventory(items.map(o=>({...o,semantic_family:'instrument'}))),/однообразна/);
assert.throws(()=>validateCategoryInventory([{...items[0],living_creatures:'human'}]),/Живые/);
assert.throws(()=>validateCategoryInventory([{...items[0],factual_checks:[]}]),/проверки/);
for(let seed=0;seed<200;seed++)for(const count of [1,3,10,15]){
 const deck=categoryVisualSchedule(count,'seed-'+seed);
 assert.equal(deck.length,count);assert.deepEqual(deck,categoryVisualSchedule(count,'seed-'+seed));
 assert.equal(new Set(deck.map(v=>v.background_pattern)).size,count);
 for(const v of deck)assert(deck.filter(n=>n.background_palette===v.background_palette).length<=v.palette_repeat_limit);
 if(count===10)assert(new Set(deck.map(v=>v.background_palette)).size>=4);
}
assert.throws(()=>categoryVisualSchedule(16,'test'),/Не хватает/);
for(const category of ['C1','C2','C3','C4']){
 const contract={...generationContract(category,'whole_card','test'),variation:categoryVisualSchedule(10,'test')[0]};
 const prompt=compileObjectPrompt({art_direction:'PINNED STYLE'},'Inanimate drum kit',contract);
 assert(prompt.startsWith('PINNED STYLE'));assert(prompt.includes(collectionRules));
 assert.match(prompt,/No living creatures/);assert.match(prompt,/rear batter-head side/);
 assert.match(prompt,/78% canvas width and 76% height/);assert.match(prompt,/FROZEN CATEGORY VARIATION/);
 if(category==='C3')assert.match(prompt,/against a BASIC designed background/);
 if(category==='C4'){assert.match(prompt,/INTEGRATED INTO A DETAILED ENVIRONMENT OR A DETAILED SCENE-FILLING SURFACE/);assert.match(prompt,/NO STANDARD BACKGROUND/);assert.match(prompt,/football pitch/);assert(!prompt.includes('Background gradient targets'));}
}
console.log('PASS living-creature ban, semantic diversity, 800 seeded category decks, palette caps, unique patterns, size/perspective/construction rules in every C1-C4 prompt; paid calls 0');
