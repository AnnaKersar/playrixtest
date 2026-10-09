import {libraryOriginal} from './reference-library.mjs';
import {referenceContract as contract} from './reference-contract.mjs';
import {sha} from './provider.mjs';
import {decodePNG} from './png.mjs';
const key='references/original50/manifest.json';
const manifestText=JSON.stringify(contract.manifest);
export async function referenceEnvironment(env){
 if(env.REFERENCE_MANIFEST_KEY||!env.ARTIFACTS)return env;
 const pointer=await env.ARTIFACTS.get('references/active.json');if(!pointer)return env;
 const p=JSON.parse(await pointer.text()),hash=await sha(manifestText);
 if(p.key!==key||p.sha256!==hash)throw Error('Reference activation pin mismatch');
 return {...env,REFERENCE_MANIFEST_KEY:key,APPROVED_REFERENCE_MANIFEST_SHA256:hash,APPROVED_ART_DIRECTION_SHA256:contract.manifest.art_direction_sha256};
}
const files=[...contract.references.map(r=>({...r,key:'references/original50/originals/'+r.id+'.png'})),...contract.sheets.map(s=>({...s,key:'references/original50/'+s.filename}))];
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
async function bounded(req,max){const rd=req.body?.getReader();if(!rd)throw Error('Body required');const parts=[];let size=0;for(;;){const {value,done}=await rd.read();if(done)break;size+=value.length;if(size>max){await rd.cancel();throw Error('File too large');}parts.push(value);}return new Uint8Array(await new Blob(parts).arrayBuffer());}
export async function referenceImport(req,env){try{
 const u=new URL(req.url),op=u.pathname.split('/').at(-1);
 if(req.method==='GET'&&op==='image'){const f=files.find(f=>f.id===u.searchParams.get('id'));if(!f)return json({error:'Unknown original reference'},404);const o=await env.ARTIFACTS?.get(f.key);if(!o)return json({error:'Reference not imported'},404);return new Response(o.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 if(req.method==='GET'&&op==='contract'){const available=[],hashes=[];for(const f of files){const h=await env.ARTIFACTS?.head(f.key),original=f.id?await libraryOriginal(env,f.id):null;if(h?.customMetadata?.sha256===f.sha256||original){hashes.push(f.sha256);if(f.id)available.push(f.id);}}return json({...contract,files,available_reference_ids:available,available_sha256:hashes});}
 if(req.method!=='POST'||req.headers.get('Origin')!==u.origin)return json({error:'Same-origin POST required'},403);
 if(!env.ARTIFACTS)return json({error:'Private R2 required'},503);
 if(op==='file'){
 const f=files.find(f=>f.sha256===u.searchParams.get('sha256'));if(!f)return json({error:'File not allowed'},403);
 const bytes=await bounded(req,f.bytes||20000000);if(f.bytes&&bytes.length!==f.bytes||await sha(bytes)!==f.sha256)throw Error('Reference SHA-256 mismatch');
 // Fixed, approved hashes are the authority; filenames supplied by the browser are ignored.
 if(f.filename){const p=await decodePNG(bytes);if(p.width!==896||p.height!==1040)throw Error('Reference sheet dimensions');}
 await env.ARTIFACTS.put(f.key,bytes,{customMetadata:{sha256:f.sha256},httpMetadata:{contentType:'image/png'}});return json({stored:true});
 }
 if(op==='commit'){
 for(const f of files){const o=await env.ARTIFACTS.get(f.key)||(f.id?await libraryOriginal(env,f.id):null),bytes=o?new Uint8Array(await o.arrayBuffer()):null;if(!bytes||await sha(bytes)!==f.sha256)return json({error:'All 50 originals and 13 exact sheets are required'},409);if(f.id)await env.ARTIFACTS.put(f.key,bytes,{customMetadata:{sha256:f.sha256}});}
 await env.ARTIFACTS.put(key,manifestText,{httpMetadata:{contentType:'application/json'}});
 const h=await sha(manifestText);await env.ARTIFACTS.put('references/active.json',JSON.stringify({key,sha256:h}));
 return json({imported:true,originals:50,sheets:13,manifest_sha256:h,art_direction_sha256:contract.manifest.art_direction_sha256,live_enabled:false,public:false});
 }return json({error:'Not found'},404);
 }catch(e){return json({error:e.message},400);}}
