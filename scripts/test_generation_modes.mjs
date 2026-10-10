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
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
import {generationContract,validateAlpha} from '../cloudflare/generation-contract.mjs';
import {proceduralCard} from '../cloudflare/procedural-card.mjs';
import {compileObjectPrompt} from '../cloudflare/object-content-policy.mjs';
await check('mode and prompt contracts preserve approved art direction',async()=>{
 for(const c of ['C1','C2','C3'])assert.equal(generationContract(c).background,'transparent');
 assert.equal(generationContract('C4').background,'opaque');assert.equal(generationContract('C1','whole_card').background,'opaque');
 assert.throws(()=>generationContract('C4','modular'));
 const prompt=compileObjectPrompt({art_direction:'Approved art',generalized_rules:'Approved rules'},'Bucket',generationContract('C2'));
 assert(prompt.startsWith('Approved art\n\nApproved rules'));assert.match(prompt,/standing directly on a simple horizontal surface/);assert.match(prompt,/rings, halo/);
});
await check('adapter preserves model, size, quality, references and sends the requested background',async()=>{
 for(const background of ['transparent','opaque']){
 let sends=0;
 await assert.rejects(()=>imageRequest({...env,LIVE_GENERATION_ENABLED:'true',OPENAI_API_KEY:'synthetic-not-a-key'},'offline',Array(13).fill(new Uint8Array()),async(url,init)=>{
 sends++;assert.equal(init.body.get('background'),background);assert.equal(init.body.get('model'),IMAGE_MODEL);assert.equal(init.body.get('size'),'1376x1536');assert.equal(init.body.get('quality'),'medium');assert.equal(init.body.getAll('image[]').length,13);return new Response('',{status:429});
 },{background}),/429/);assert.equal(sends,1);
 }
});
await check('opaque final cards and separate unmodified transparent source, all four categories',async()=>{
 const run=await data('/api/runs',{objects:['C1','C2','C3','C4'].map((category,i)=>({object_id:'contract_'+i,category,brief:'Synthetic bucket'})),name:'Offline contract QA'});
 while(messages.length){const body=messages.shift();await worker.queue({messages:[{body,ack(){}}]},env);}
 const jobs=(await data('/api/run?run='+run.runId)).jobs;assert.equal(jobs.filter(j=>j.status==='complete').length,4);
 for(const j of jobs){
 const m=await data('/api/asset?job='+j.id+'&kind=manifest'),final=await decodePNG(bucket.map.get(m.final_key));
 assert.equal(final.width,864);assert.equal(final.height,960);for(let i=3;i<final.rgba.length;i+=4)assert.equal(final.rgba[i],255);
 if(m.generation.mode==='modular'){
 const source=await decodePNG(bucket.map.get(m.foreground_key));assert.equal(source.rgba[3],0);
 assert.equal(source.rgba[(Math.round(960*.43)*864+Math.round(864*.58))*4+3],0);
 const fit=m.composition.objectAssembly;let protectedSamples=0;
 for(let y=2;y<source.height-2;y+=7)for(let x=2;x<source.width-2;x+=7){const p=(y*source.width+x)*4,color=source.rgba.slice(p,p+3);let uniform=true;for(let yy=y-2;yy<=y+2;yy++)for(let xx=x-2;xx<=x+2;xx++){const n=(yy*source.width+xx)*4;if(source.rgba[n+3]!==255||color.some((v,k)=>v!==source.rgba[n+k]))uniform=false;}if(!uniform)continue;const tx=Math.floor((x+.5)*fit.scale+fit.dx),ty=Math.floor((y+.5)*fit.scale+fit.dy);if(tx<0||ty<0||tx>=final.width||ty>=final.height)continue;const q=(ty*final.width+tx)*4;assert.deepEqual(final.rgba.slice(q,q+3),color);protectedSamples++;}assert(protectedSamples>0,'No solid subject samples verified after assembly transform');
 assert.equal(m.foreground_sha256,await sha(bucket.map.get(m.foreground_key)));
 assert.equal((await data('/api/image-info?job='+j.id)).has_foreground,true);
 }else assert.equal(m.foreground_key,null);
 }assert.equal(providerCalls,0);
});
await check('legacy artifacts and transparent holes preserved',async()=>{
 const run=await data('/api/runs',{objects:[{object_id:'legacy',brief:'legacy synthetic'}]});
 while(messages.length){const body=messages.shift();await worker.queue({messages:[{body,ack(){}}]},env);}
 const j=(await data('/api/run?run='+run.runId)).jobs[0],m=await data('/api/asset?job='+j.id+'&kind=manifest');
 assert.equal((await decodePNG(bucket.map.get(m.final_key))).rgba[3],0);assert.equal(m.generation,undefined);
});
await check('reject false matte, no mask or white replacement, allow C3 surface through lower corners',async()=>{
 const source={width:2,height:2,rgba:new Uint8Array([0,0,0,0,0,0,0,0,40,70,80,255,40,70,80,255])};
 validateAlpha(source,generationContract('C3'));assert.throws(()=>validateAlpha(source,generationContract('C1')));assert.throws(()=>validateAlpha(source,generationContract('C4')));
 const before=source.rgba.slice(),card=proceduralCard(source,'C3');assert.deepEqual(source.rgba,before);
 assert.notDeepEqual(card.rgba.slice(0,3),new Uint8Array([255,255,255]));assert.deepEqual(card.rgba.slice(8,11),source.rgba.slice(8,11));
});
console.log('No live provider requests.');
