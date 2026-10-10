import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const values=new Map([['card-edit/source',JSON.stringify({runId:'r',jobId:'j',note:'fix'})]]),boxes=[],events=[];let status='queued',hidden=true,timer,requests=0;
const document={get hidden(){return hidden},head:{append(){}},body:{append(n){boxes.push(n)}},createElement(){return {append(){},setAttribute(){},remove(){}}},addEventListener(n,f){events[n]=f}};
const localStorage={get length(){return values.size},key(i){return [...values.keys()][i]},getItem(k){return values.get(k)||null},setItem(k,v){values.set(k,v)}};
const code=(await readFile(new URL('../cloudflare/visitor-public/card-edit-background.mjs',import.meta.url),'utf8')).replace('export function','function');
const ctx=vm.createContext({document,localStorage,window:{addEventListener(){},dispatchEvent(){}},CustomEvent:class{},setInterval(f){timer=f},fetch:async(path,options)=>{assert.equal(options,undefined);requests++;return {ok:true,json:async()=>({jobs:[{id:'j',status}]})}},encodeURIComponent});
vm.runInContext(code,ctx);await new Promise(r=>setImmediate(r));assert.equal(boxes.length,0);
status='complete';timer();await new Promise(r=>setImmediate(r));assert.equal(boxes.length,0);assert.equal(JSON.parse(values.get('card-edit-background/v1')).j.status,'complete');
hidden=false;events.visibilitychange();await new Promise(r=>setImmediate(r));assert.equal(boxes.length,1);timer();await new Promise(r=>setImmediate(r));assert.equal(boxes.length,1);assert.equal(requests,2);
console.log('PASS migrates queued edits, reads status only, persists completion, defers hidden-tab toast and displays once');

