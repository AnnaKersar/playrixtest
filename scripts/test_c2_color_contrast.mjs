import assert from 'node:assert/strict';
import {generationContract,generationInstructions} from '../cloudflare/generation-contract.mjs';
for(const finish of ['matte','reflective']){const prompt=generationInstructions({...generationContract('C2'),surface_finish:finish});assert.match(prompt,/Do not put a blue object on a blue or cyan base plane/);assert.match(prompt,/Do not change or boost the object saturation/);assert.match(prompt,/Reflections may inherit the subject color locally/);assert.match(prompt,/HSV S 42-100%, V 86-100%/);}
assert.doesNotMatch(generationInstructions(generationContract('C1')),/blue bucket prefer/);
console.log('PASS both C2 finishes prioritize subject contrast without changing subject saturation or surface HSV limits; C1 unaffected');

