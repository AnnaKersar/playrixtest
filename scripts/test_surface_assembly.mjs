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
import {C2_SURFACE_POLICY,surfaceHorizon,projectedSubjectShadow,surfacePalette,subjectLighting,shadowProjection,projectShadowPoint,unprojectShadowPoint} from '../cloudflare/visitor-public/studio/surface-policy.mjs';
const heights=C2_SURFACE_POLICY.references.map(r=>(480-r.horizon)/480).sort((a,b)=>a-b);
assert.equal(heights[Math.floor(heights.length/2)],C2_SURFACE_POLICY.medianHeightFraction);
const image=await decodePNG(await mockPNG(864,960)),unchanged=image.rgba.slice(),withShadow=proceduralCard(image,'C2'),withoutShadow=proceduralCard(image,'C2',{shadow:false});
assert.deepEqual(image.rgba,unchanged);assert.equal(withShadow.composition.surface.heightFraction,.30);
assert.equal(withShadow.composition.surface.horizon,672);let changedBelow=0;
for(let y=0;y<960;y++)for(let x=0;x<864;x++){const p=(y*864+x)*4;assert.equal(withShadow.rgba[p+3],255);const changed=withShadow.rgba[p]!==withoutShadow.rgba[p]||withShadow.rgba[p+1]!==withoutShadow.rgba[p+1]||withShadow.rgba[p+2]!==withoutShadow.rgba[p+2];if(y<surfaceHorizon(960))assert.equal(changed,false,'Shadow on background');else changedBelow+=changed;}
assert(changedBelow>0,'No surface shadow');
const silhouette=new Uint8Array(100*100*4);for(let y=15;y<88;y++)for(let x=30;x<70;x++)silhouette[(y*100+x)*4+3]=255;const solidShadow=projectedSubjectShadow(silhouette,100,100,{scale:1,dx:0,dy:0},subjectLighting(silhouette,100,100,'upper-left'));for(let y=25;y<60;y++)for(let x=40;x<60;x++)silhouette[(y*100+x)*4+3]=0;const hollowShadow=projectedSubjectShadow(silhouette,100,100,{scale:1,dx:0,dy:0},subjectLighting(silhouette,100,100,'upper-left'));assert(solidShadow.some((v,i)=>v>hollowShadow[i]+.005),'Shadow ignores subject holes');assert.deepEqual(projectedSubjectShadow(new Uint8Array(silhouette.length),100,100),new Float32Array(10000));
const existingPalette={h:44,s:.95,v:.98,shift:8};assert.equal(surfacePalette(existingPalette,[255,180,10]),existingPalette);for(const selection of ['gold',null,undefined,{h:'gold'}]){const palette=surfacePalette(selection,[255,180,10]);assert(['h','s','v','shift'].every(k=>Number.isFinite(palette[k])));}const manual=subjectLighting(silhouette,100,100,'upper-left');assert.equal(manual.lightDirection,'upper-left');assert.equal(manual.shadowDirection,'lower-right');const projection=shadowProjection(100,100,manual),forward=projectShadowPoint(50,15,projection);assert(forward[0]>50&&forward[1]>projection.baseY);const inverse=unprojectShadowPoint(...forward,projection);assert(Math.abs(inverse[0]-50)<1e-8&&Math.abs(inverse[1]-15)<1e-8);let shadowWeight=0,shadowX=0;for(let y=0;y<100;y++)for(let x=0;x<100;x++){const a=solidShadow[y*100+x];shadowWeight+=a;shadowX+=a*x;}assert(shadowX/shadowWeight>50,'Shadow faces illuminated left side');

for(let y=672;y<960;y+=10){const p=y*864*4,rgb=withoutShadow.rgba.slice(p,p+3),hi=Math.max(...rgb),lo=Math.min(...rgb);assert(hi/255>=.86);assert((hi-lo)/hi>=.8,'Surface washed out by white mixing');}

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

for(const direction of ['upper-left','upper-right','lower-left','lower-right']){const image=new Uint8Array(100*100*4),vx=direction.endsWith('left')?-1:1,vy=direction.startsWith('upper')?-1:1;for(let y=10;y<80;y++)for(let x=20;x<80;x++){const p=(y*100+x)*4,brightness=.50+.30*(vx*x/100+vy*y/100);image[p]=Math.round(20*brightness);image[p+1]=Math.round(100*brightness);image[p+2]=Math.round(255*brightness);image[p+3]=255;}const auto=subjectLighting(image,100,100);assert.equal(auto.lightDirection,direction);assert.deepEqual(auto.shadowVector,auto.lightVector.map(v=>-v));}
const left=await data('/api/reassemble',{jobId:j.id,lightDirection:'upper-right'});assert.equal(left.composition.surface.shadow.lighting.shadowDirection,'lower-left');assert.equal(left.provider_calls,0);assert.equal((await data('/api/reassemble',{jobId:j.id,lightDirection:'upper-right'})).idempotent,true);const bad=await call('/api/reassemble',{jobId:j.id,lightDirection:'sideways'});assert.equal(bad.status,400);
console.log('PASS editor palette object/string fallback, reversible forward/inverse projection, four inferred light sides, opposite shadow direction, manual override, contact-to-tip fade');

const near=projectShadowPoint(50,70,projection),far=projectShadowPoint(50,20,projection);assert(solidShadow[Math.round(near[1])*100+Math.round(near[0])]>solidShadow[Math.round(far[1])*100+Math.round(far[0])]*1.5,'Shadow is not darker at contact');

import {encodePNG} from '../cloudflare/png.mjs';
const uploadBefore=await data('/api/asset?job='+j.id+'&kind=manifest'),uploadedCard=proceduralCard(await decodePNG(bucket.map.get(uploadBefore.foreground_key)),'C2',{lightDirection:'upper-left',shadowMode:uploadBefore.generation.shadow_mode}),uploadedBytes=await encodePNG(uploadedCard.width,uploadedCard.height,uploadedCard.rgba),uploadBody={jobId:j.id,expectedForegroundSHA:uploadBefore.foreground_sha256,expectedFinalSHA:uploadBefore.final_sha256,rendererVersion:COMPOSITION_VERSION,composition:uploadedCard.composition,pngBase64:Buffer.from(uploadedBytes).toString('base64')};
assert.equal((await call('/api/reassemble-upload',uploadBody,{token:await jwt({email:'guest@example.invalid'})})).status,403);
assert.equal((await call('/api/reassemble-upload',{...uploadBody,expectedFinalSHA:'changed'})).status,409);
assert.equal((await call('/api/reassemble-upload',{...uploadBody,composition:{...uploadBody.composition,surface:{...uploadBody.composition.surface,heightFraction:.1}}})).status,400);
const saved=await data('/api/reassemble-upload',uploadBody);assert.equal(saved.provider_calls,0);const uploadAfter=await data('/api/asset?job='+j.id+'&kind=manifest');assert.equal(uploadAfter.assembly_renderer,'browser-procedural-editor');assert.equal(await sha(bucket.map.get(uploadAfter.foreground_key)),sourceHash);assert.deepEqual(db.prepare('SELECT * FROM attempts WHERE job_id=?').get(j.id),attemptBefore);assert.equal(providerCalls,0);
assert.equal((await data('/api/reassemble-upload',{...uploadBody,expectedFinalSHA:uploadAfter.final_sha256})).idempotent,true);
const opaqueImage=await decodePNG(uploadedBytes);opaqueImage.rgba[3]=0;const transparentBytes=await encodePNG(opaqueImage.width,opaqueImage.height,opaqueImage.rgba);const rejected=await call('/api/reassemble-upload',{...uploadBody,expectedFinalSHA:uploadAfter.final_sha256,pngBase64:Buffer.from(transparentBytes).toString('base64')});assert.equal(rejected.ok,false);
console.log('PASS browser-editor save: owner-only, stale-pointer rejection, surface contract, opaque PNG validation, immutable source and historical assemblies, unchanged cost, zero provider calls');
