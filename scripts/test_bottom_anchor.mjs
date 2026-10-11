import assert from 'node:assert/strict';
import {subjectLayoutInstructions,resolveLegacyPlacement} from '../cloudflare/subject-layout-policy.mjs';
const legacy='Place the object at the vertical center. Do not shift the subject upward, downward, left, or right. Keep the red case centered in the frame with two attached handles.';
for(const category of ['C2','C3','C4']) {
 const resolved=resolveLegacyPlacement(legacy,category);
 assert(!resolved.includes('at the vertical center'));
 assert(!resolved.includes('Do not shift'));
 assert(!resolved.includes('centered in the frame'));
 assert(resolved.includes('red case'));
 assert(resolved.includes('two attached handles'));
 const layout=subjectLayoutInstructions(category);
 assert(layout.includes('ONLY 12–14%'));
 assert(layout.includes('y=826–845px'));
 assert(layout.includes('beyond its y=768px horizon'));
}
assert.equal(resolveLegacyPlacement(legacy,'C1'),legacy);
console.log('PASS: legacy vertical-placement conflicts removed; bottom anchor explicit; C1 unchanged. No provider calls.');

