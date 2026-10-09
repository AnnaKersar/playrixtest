/* Owner-only actions use the same guarded routes as the visible import UI. */
const registry=document.modelContext,status=document.getElementById('status');
const mode=location.pathname.includes('private-import')?'private':'references';
const endpoint=mode==='private'?'/api/owner/private-import/':'/api/owner/reference-import/';
const H=/^[a-f0-9]{64}$/;
async function api(op,body){const response=await fetch(endpoint+op,body===undefined?{}:{method:'POST',headers:{'Content-Type':body instanceof Uint8Array?'application/octet-stream':'application/json'},body:body instanceof Uint8Array?body:JSON.stringify(body)});const d=await response.json();if(!response.ok)throw Error(d.error||'Import failed');return d;}
async function transfer(input){
 if(!input||!['status','prepare','file','commit'].includes(input.action))throw Error('Invalid import action');
 let result;
 if(input.action==='status'){if(mode!=='references')throw Error('Prepare the private package to obtain its checkpoint');result=await api('contract');result={originals:result.references.length,sheets:result.sheets.length,available_sha256:result.available_sha256,files:result.files};}
 if(input.action==='prepare'){if(mode!=='private'||!input.manifest||input.manifest.version!=='private-import/v1')throw Error('Invalid private manifest');result=await api('prepare',input.manifest);}
 if(input.action==='file'){
  if(!H.test(input.sha256||'')||typeof input.base64!=='string'||input.base64.length>27000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))throw Error('Invalid file payload');
  if(mode==='private'&&!H.test(input.packageHash||''))throw Error('Prepare private package first');
  const raw=atob(input.base64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==input.sha256)throw Error('SHA-256 mismatch');
  result=await api('file?'+(mode==='private'?'package='+input.packageHash+'&':'')+'sha256='+input.sha256,bytes);
 }
 if(input.action==='commit'){if(mode==='private'&&!H.test(input.packageHash||''))throw Error('Invalid package');result=await api('commit'+(mode==='private'?'?package='+input.packageHash:''),{});}
 if(status)status.textContent=input.action==='commit'?'Импорт завершён. Файлы проверены; генерация выключена.':input.action==='file'?'Файл проверен и перенесён.':'Автоматический импорт готов.';
 return result;
}
if(typeof registry?.registerTool==='function'){try{Promise.resolve(registry.registerTool({name:mode==='private'?'transfer_private_study':'transfer_reference_pack',description:mode==='private'?'Import the owner private v9 study and editor using prepare, hash-verified file uploads, and commit. No paid generation.':'Import the exact original50/13 pack using status, hash-verified file uploads, and commit. Existing files can be skipped. No paid generation.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['status','prepare','file','commit']},sha256:{type:'string'},base64:{type:'string'},packageHash:{type:'string'},manifest:{type:'object'}},required:['action'],additionalProperties:false},execute:transfer})).catch(()=>{});}catch{}}
