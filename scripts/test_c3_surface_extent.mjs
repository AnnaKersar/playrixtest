import assert from 'node:assert/strict';
import {generationContract,generationInstructions} from '../cloudflare/generation-contract.mjs';
import {subjectLayoutInstructions} from '../cloudflare/subject-layout-policy.mjs';
import {collectionRules} from '../cloudflare/visitor-public/collection-policy.mjs';
for(const mode of ['whole_card','modular']){
 const text=generationInstructions(generationContract('C3',mode));
 assert(text.includes('both bottom corners'));
 assert(text.includes('y=80%'));
 assert(text.includes('bottom 20%'));
 assert(text.includes('isolated pedestal'));
 assert(/full (canvas|image) width/.test(text));
}
assert(subjectLayoutInstructions('C3').includes('overrides a small-platform OBJECT brief'));
assert(collectionRules.includes('Plan C3 developed receiving surfaces edge-to-edge'));
console.log('PASS C3 full-width receiving surface, bottom 20%, no pedestal, planner and image modes agree; no provider calls.');
