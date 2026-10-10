import assert from 'node:assert/strict';
import {correctionStage,correctionPrompt} from '../cloudflare/card-correction-policy.mjs';
import {imageRequest} from '../cloudflare/provider.mjs';
assert.equal(correctionStage({status:'complete'},true),'image-edit');
assert.equal(correctionStage({status:'running'},true),'finalization');
assert.equal(correctionStage({status:'queued'},false),'unavailable');
assert.throws(()=>correctionPrompt('original',''),/Опишите/);
const prompt=correctionPrompt('PINNED ORIGINAL ART DIRECTION','Make the lighting softer');
assert(prompt.startsWith('PINNED ORIGINAL ART DIRECTION'));assert.match(prompt,/FIRST input image/);assert.match(prompt,/Make the lighting softer/);assert.match(prompt,/No living beings/);
let calls=0;const source=new Uint8Array([7,8,9]);
const answer=await imageRequest({LIVE_GENERATION_ENABLED:'true',OPENAI_API_KEY:'test-only'},prompt,Array.from({length:13},()=>new Uint8Array([1,2])),async(url,args)=>{
 calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');const images=args.body.getAll('image[]');assert.equal(images.length,14);assert.equal(images[0].name,'card-to-edit.png');assert.deepEqual(new Uint8Array(await images[0].arrayBuffer()),source);assert.equal(args.body.get('background'),'opaque');assert.equal(args.body.get('size'),'864x960');return Response.json({data:[{b64_json:'AQID'}]});
},{sourceImage:source,background:'opaque',size:'864x960'});
assert.equal(calls,1);assert.deepEqual([...answer.png],[1,2,3]);
console.log('PASS stage routing, original rules and targeted feedback, source first plus 13 pinned refs, opaque native size, exactly one mocked request; paid requests 0');
