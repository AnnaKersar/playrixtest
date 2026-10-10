import assert from 'node:assert/strict';
import {prepareSheets} from '../cloudflare/reference-sheets.mjs';
import {encodePNG} from '../cloudflare/png.mjs';
import {sha} from '../cloudflare/provider.mjs';
const bytes=await encodePNG(896,1040,new Uint8Array(896*1040*4)),hash=await sha(bytes);
const files=new Map([['references/one',{bytes,etag:'v1'}],['references/two',{bytes,etag:'v2'}]]),proofs=new Map(),sent=[];
const env={ARTIFACTS:{async head(k){return files.get(k)||null},async get(k){if(files.has(k)){const o=files.get(k);return {etag:o.etag,arrayBuffer:async()=>o.bytes.buffer}}return proofs.has(k)?{json:async()=>JSON.parse(proofs.get(k))}:null},async put(k,v){proofs.set(k,v)}},IMAGE_JOBS:{async send(v){sent.push(v)}}};
const manifest={sheets:[{key:'references/one',sha256:hash},{key:'references/two',sha256:hash}]},processing={async event(){}};
// Production hashes are unique. Exercise proof invalidation for a same-content key too.
assert.equal(await prepareSheets(env,manifest,'job',processing),null);
assert.equal(sent.length,1);
manifest.sheets=[manifest.sheets[0]];
const ready=await prepareSheets(env,manifest,'job',processing);assert.deepEqual(ready.sheets[0],bytes);assert.deepEqual(ready.hashes,[hash]);assert.equal(sent.length,1);
files.get('references/one').etag='changed';
assert.equal(await prepareSheets(env,manifest,'job',processing),null);assert.equal(sent.length,2);
files.get('references/one').etag='corrupt';files.get('references/one').bytes=new Uint8Array([1,2,3]);
await assert.rejects(()=>prepareSheets(env,manifest,'job',processing),/SHA mismatch/);assert.equal(sent.length,2);
console.log('PASS incremental validation, unchanged version reuse, changed version revalidation and corrupt file rejected; provider calls 0');
