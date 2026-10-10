import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createWorker,processJob } from '../cloudflare/worker.mjs';
import { sha,imageRequest,usageCost,IMAGE_MODEL } from '../cloudflare/provider.mjs';
import { mockPNG,decodePNG,finalPNG } from '../cloudflare/png.mjs';
const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
function statement(sql,args=[]){return {bind(...a){return statement(sql,a);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},sql,args};}
const DB={prepare:statement,async batch(items){db.exec('BEGIN');try{const results=[];for(const s of items)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
class Bucket{constructor(){this.map=new Map();this.fail=null;}async put(k,v){if(this.fail?.(k))throw Error('Injected R2 write failure');this.map.set(k,typeof v==='string'?new TextEncoder().encode(v):new Uint8Array(v));}async get(k){const v=this.map.get(k);return v?{body:new Blob([v]).stream(),arrayBuffer:async()=>v.slice().buffer,text:async()=>new TextDecoder().decode(v),json:async()=>JSON.parse(new TextDecoder().decode(v))}:null;}async head(k){return this.map.has(k)?{}:null;}}
const bucket=new Bucket(),messages=[];
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='test';
const b64=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url');
async function jwt(overrides={}){const now=Math.floor(Date.now()/1000),content=b64({alg:'RS256',kid:'test'})+'.'+b64({iss:'https://offline-test.cloudflareaccess.com',aud:['test-aud'],email:'owner'+'@'+'example.invalid',iat:now,exp:now+600,...overrides});return content+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(content))).toString('base64url');}
const token=await jwt(),env={DB,ARTIFACTS:bucket,IMAGE_JOBS:{async send(body){messages.push(body);}},ASSETS:{async fetch(){return new Response('<html>bootstrap</html>',{headers:{'Content-Type':'text/html'}});}},ACCESS_TEAM_DOMAIN:'https://offline-test.cloudflareaccess.com',ACCESS_AUD:'test-aud',OWNER_EMAIL:'owner'+'@'+'example.invalid',LIVE_GENERATION_ENABLED:'false'};
let providerCalls=0,providerMode='ok';const raw=await mockPNG(1376,1536);
const worker=createWorker({authFetch:async()=>Response.json({keys:[jwk]}),provider:async()=>{providerCalls++;if(providerMode==='timeout')throw Error('Injected ambiguous timeout');return {png:raw,usage:{input_tokens:3,input_tokens_details:{text_tokens:1,image_tokens:2},output_tokens:4,total_tokens:7},requestId:'synthetic-request'};}});
async function call(path,body,options={}){return worker.fetch(new Request('https://studio.example.invalid'+path,{method:body?'POST':'GET',headers:{'Cf-Access-Jwt-Assertion':options.token??token,...(body?{'Content-Type':'application/json',Origin:options.origin||'https://studio.example.invalid'}:{})},...(body?{body:JSON.stringify(body)}:{})}),options.env||env);}
async function data(path,body){const r=await call(path,body);const d=await r.json();assert(r.ok,JSON.stringify(d));return d;}

import {proceduralCard,COMPOSITION_VERSION} from '../cloudflare/procedural-card.mjs';
import {C2_SURFACE_POLICY,surfaceHorizon} from '../cloudflare/visitor-public/studio/surface-policy.mjs';
const heights=C2_SURFACE_POLICY.references.map(r=>(480-r.horizon)/480).sort((a,b)=>a-b);
assert.equal(heights[Math.floor(heights.length/2)],C2_SURFACE_POLICY.medianHeightFraction);
const image=await decodePNG(await mockPNG(864,960)),unchanged=image.rgba.slice(),withShadow=proceduralCard(image,'C2'),withoutShadow=proceduralCard(image,'C2',{shadow:false});
assert.deepEqual(image.rgba,unchanged);assert.equal(withShadow.composition.surface.heightFraction,.30);
assert.equal(withShadow.composition.surface.horizon,672);let changedBelow=0;
for(let y=0;y<960;y++)for(let x=0;x<864;x++){const p=(y*864+x)*4;assert.equal(withShadow.rgba[p+3],255);const changed=withShadow.rgba[p]!==withoutShadow.rgba[p]||withShadow.rgba[p+1]!==withoutShadow.rgba[p+1]||withShadow.rgba[p+2]!==withoutShadow.rgba[p+2];if(y<surfaceHorizon(960))assert.equal(changed,false,'Shadow on background');else changedBelow+=changed;}
assert(changedBelow>0,'No surface shadow');
const run=await data('/api/runs',{objects:[{object_id:'surface_fixture',category:'C2',brief:'Offline fixture'}]});
while(messages.length){const body=messages.shift();await worker.queue({messages:[{body,ack(){}}]},env);}
const j=(await data('/api/run?run='+run.runId)).jobs[0];assert.equal(j.status,'complete');
const row=db.prepare('SELECT * FROM results WHERE job_id=?').get(j.id),oldManifest=JSON.parse(new TextDecoder().decode(bucket.map.get(row.manifest_key)));
oldManifest.composition.version='procedural-card/v1';await bucket.put(row.manifest_key,JSON.stringify(oldManifest));
const sourceHash=await sha(bucket.map.get(oldManifest.foreground_key)),previousHash=await sha(bucket.map.get(row.final_key)),attemptBefore=db.prepare('SELECT * FROM attempts WHERE job_id=?').get(j.id);
let denied=await call('/api/reassemble',{jobId:j.id},{token:await jwt({email:'guest@example.invalid'})});assert.equal(denied.status,403);
const rebuilt=await data('/api/reassemble',{jobId:j.id});assert.equal(rebuilt.provider_calls,0);assert.equal(rebuilt.composition.version,COMPOSITION_VERSION);assert.equal(rebuilt.composition.surface.heightFraction,.30);
const current=await data('/api/asset?job='+j.id+'&kind=manifest');assert.notEqual(current.final_key,row.final_key);assert.equal(await sha(bucket.map.get(row.final_key)),previousHash);assert.equal(await sha(bucket.map.get(oldManifest.foreground_key)),sourceHash);assert.deepEqual(db.prepare('SELECT * FROM attempts WHERE job_id=?').get(j.id),attemptBefore);assert.equal(current.previous_assemblies[0].manifest_key,row.manifest_key);
assert.equal((await data('/api/reassemble',{jobId:j.id})).idempotent,true);assert.equal(providerCalls,0);
const prior=await call('/api/asset?job='+j.id+'&kind=previous');assert(prior.ok);assert.equal(await sha(new Uint8Array(await prior.arrayBuffer())),previousHash);
console.log('PASS reference median, 30% plane, automatic surface-only shadow, source preservation, owner-only rebuild, historical results retained, idempotency, zero provider calls');
