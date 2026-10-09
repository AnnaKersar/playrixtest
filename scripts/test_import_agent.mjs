import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=await fs.readFile('cloudflare/public/import-agent.js','utf8');
for(const mode of ['references','private']){
 let registered,status={textContent:''},calls=[];
 const context={document:{modelContext:{registerTool(t){registered=t;}},getElementById(){return status;}},location:{pathname:mode==='private'?'/studio/private-import.html':'/studio/reference-import.html'},crypto:webcrypto,Uint8Array,atob,fetch:async(path,opts)=>{calls.push({path,opts});return {ok:true,json:async()=>({stored:true,imported:true,packageHash:'b'.repeat(64),files:[],references:[],sheets:[],available_sha256:[]})}}};
 vm.runInNewContext(source,context);assert(registered);
 await assert.rejects(()=>registered.execute({action:'delete'}),/Invalid import/);assert.equal(calls.length,0);
 await assert.rejects(()=>registered.execute({action:'file',sha256:'a'.repeat(64),base64:'YWJj',packageHash:'b'.repeat(64)}),/SHA-256 mismatch/);assert.equal(calls.length,0);
 const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode('abc'))).toString('hex');
 await registered.execute({action:'file',sha256:hash,base64:'YWJj',packageHash:'b'.repeat(64)});assert.equal(calls.length,1);assert(calls[0].path.startsWith(mode==='private'?'/api/owner/private-import/file?':'/api/owner/reference-import/file?'));
 await registered.execute({action:'commit',packageHash:'b'.repeat(64)});assert.equal(calls.length,2);assert.match(status.textContent,/Импорт завершён/);
 assert(!calls.some(x=>/runs|plan|generate|archive/.test(x.path)));
}
console.log('PASS owner import tools: invalid/hash-mismatched bytes rejected before upload, exact owner routes, completed status, no generation or archive mutation.');
