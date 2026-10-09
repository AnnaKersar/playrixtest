import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {importArchiveSeed} from '../cloudflare/archive-seed.mjs';
const root='cloudflare/visitor-public/archive-seed/history-v1/';
const manifest=JSON.parse(await fs.readFile(root+'archive-manifest.json','utf8'));
const storage=new Map();let corrupt=false;
const env={ASSETS:{async fetch(req){const p=new URL(req.url).pathname;const b=await fs.readFile('cloudflare/visitor-public'+p);return new Response(corrupt&&p.endsWith('.png')?b.subarray(1):b);}},ARTIFACTS:{async get(key){const b=storage.get(key);return b?{text:async()=>Buffer.from(b).toString(),arrayBuffer:async()=>b}:null;},async put(key,value){storage.set(key,typeof value==='string'?Buffer.from(value):value);}}};
const req=(path='seed',origin='https://test.invalid',body='{}',method='POST')=>new Request('https://test.invalid/api/owner/archive/'+path,{method,headers:{Origin:origin},...(method==='POST'?{body}:{})});
assert.equal((await importArchiveSeed(req('seed','https://other.invalid'),env)).status,403);
assert.equal((await importArchiveSeed(req('seed',undefined,'{"url":"https://other.invalid"}'),env)).status,400);
corrupt=true;assert.equal((await importArchiveSeed(req(),env)).status,503);assert(!storage.has('experiment-archive/active.json'));corrupt=false;
let s=await(await importArchiveSeed(req(),env)).json();assert.equal(s.copied,5);assert.equal(s.verified,0);
const paused=await(await importArchiveSeed(req('seed-status',undefined,undefined,'GET'),env)).json();assert.equal(paused.copied,5);
for(let i=0;i<200&&!s.published;i++){s=await(await importArchiveSeed(req(),env)).json();assert(!s.error,s.error);if(s.verified<s.total)assert(!storage.has('experiment-archive/active.json'));}
assert.equal(s.published,true);assert.equal(s.copied,manifest.assets.length);assert.equal(s.verified,manifest.assets.length);
assert.deepEqual(JSON.parse(Buffer.from(storage.get('experiment-archive/active.json')).toString()),manifest);
assert.equal((await(await importArchiveSeed(req(),env)).json()).published,true);
console.log('PASS fixed server package, origin guard, URL rejection, corrupt bytes rejected, persistent resume, complete-only publication; no paid API calls');
