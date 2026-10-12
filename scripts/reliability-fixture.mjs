import {DatabaseSync} from 'node:sqlite';import {readFile} from 'node:fs/promises';import {deflateSync} from 'node:zlib';
import {sha,IMAGE_MODEL} from '../cloudflare/provider.mjs';import {crc32} from '../cloudflare/visitor-public/collection-download.mjs';
export function rgbPNG(w=864,h=960,compressed){
 const chunk=(type,b)=>{const o=new Uint8Array(b.length+12),v=new DataView(o.buffer);v.setUint32(0,b.length);o.set(new TextEncoder().encode(type),4);o.set(b,8);v.setUint32(b.length+8,crc32(o.subarray(4,b.length+8)));return o;};
 const head=new Uint8Array(13),v=new DataView(head.buffer);v.setUint32(0,w);v.setUint32(4,h);head[8]=8;head[9]=2;
 const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',compressed||deflateSync(new Uint8Array(h*(w*3+1)))),chunk('IEND',new Uint8Array())];
 const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;
}
export async function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));db.exec('UPDATE budget SET approved=1,ceiling=100000000000');
 function statement(sql,args=[]){return {bind(...a){return statement(sql,a)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}}}
 const objects=new Map(),messages=[],state={calls:0,fail:null};
 const bucket={async head(k){return objects.has(k)?{etag:k}:null},async get(k){if(!objects.has(k))return null;const b=objects.get(k);return {etag:k,body:new Blob([b]).stream(),arrayBuffer:async()=>b.slice().buffer,json:async()=>JSON.parse(new TextDecoder().decode(b)),text:async()=>new TextDecoder().decode(b)};},async put(k,b){if(state.fail?.(k))throw Error('Temporary injected R2 outage');objects.set(k,typeof b==='string'?new TextEncoder().encode(b):new Uint8Array(b));}};
 const art='PINNED STYLE',sheet=rgbPNG(896,1040),manifest={version:'reference-pack/v1',reference_count:50,model:IMAGE_MODEL,art_direction:art,art_direction_sha256:await sha(art),sheets:Array.from({length:13},(_,i)=>({key:'references/s'+i,count:i===12?2:4,sha256:''}))};
 const hash=await sha(sheet);for(const s of manifest.sheets){s.sha256=hash;await bucket.put(s.key,sheet);await bucket.put('reference-validation/'+encodeURIComponent(s.key)+'-'+hash+'.json',JSON.stringify({key:s.key,etag:s.key,sha256:hash}));}const text=JSON.stringify(manifest);await bucket.put('refs',text);
 const env={DB:{prepare:statement,async batch(ss){db.exec('BEGIN');try{const results=[];for(const s of ss)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}},ARTIFACTS:bucket,IMAGE_JOBS:{async send(b){messages.push(b)}},FINAL_JOBS:{async send(b){messages.push(b)}},ASSETS:{fetch:async()=>new Response('fixture')},LIVE_GENERATION_ENABLED:'true',GUEST_PAID_GENERATION_ENABLED:'true',OPENAI_API_KEY:'offline-fixture',REFERENCE_MANIFEST_KEY:'refs',APPROVED_REFERENCE_MANIFEST_SHA256:await sha(text),APPROVED_ART_DIRECTION_SHA256:await sha(art)};
 return {db,env,bucket,objects,messages,state,manifest,provider:async()=>{state.calls++;if(state.timeout)throw Error('Ambiguous provider timeout');return {png:rgbPNG(),usage:state.usage===undefined?{input_tokens:3,input_tokens_details:{text_tokens:1,image_tokens:2},output_tokens:4,total_tokens:7}:state.usage,requestId:'fake-request'};}};
}
