import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {collectionPNG,crc32} from '../cloudflare/visitor-public/collection-download.mjs';
assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
const bytes=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]),jobs=Array.from({length:30},(_,i)=>({id:'job'+i,name:'Домино',thematic_category:'Кино',status:'complete'}));let count=0;
const blob=await collectionPNG(jobs,async(url,options)=>{assert.match(url,/^\/api\/asset\?job=job/);assert.ok(options.signal);count++;return {ok:true,arrayBuffer:async()=>bytes.buffer}});assert.equal(count,30);await writeFile(new URL('../review/collection-download-test.zip',import.meta.url),new Uint8Array(await blob.arrayBuffer()));
await assert.rejects(()=>collectionPNG([{status:'queued'}]),/Дождитесь/);
await assert.rejects(()=>collectionPNG(jobs,async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([1]).buffer})),/не PNG/);
console.log('PASS all 30 PNG downloaded without decoding, unique numbered paths, CRC32 and failure handling');

