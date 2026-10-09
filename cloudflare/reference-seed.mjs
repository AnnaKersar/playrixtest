import {libraryReferences as refs} from './reference-library-data.mjs';import {sha} from './provider.mjs';
export const SEED_VERSION='original160-v1';const prefix='/reference-seed/'+SEED_VERSION+'/';
export function isReferenceSeedPath(path){return path===prefix+'manifest.json'||path===prefix+'ATTRIBUTION.txt'||refs.some(r=>path===prefix+r.id+'.png');}
export async function copyReferenceSeed(request,env){
 if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin)return Response.json({error:'Same-origin POST required'},{status:403});
 if(!env.ASSETS||!env.ARTIFACTS)return Response.json({error:'Seed assets and private storage required'},{status:503});
 let body;try{const text=await request.text();if(text.length>1000)throw Error();body=JSON.parse(text);if(Object.keys(body).some(k=>k!=='cursor')||!Number.isInteger(body.cursor)||body.cursor<0||body.cursor>=160)throw Error();}catch{return Response.json({error:'Invalid seed cursor'},{status:400});}
 let copied=0,skipped=0;const batch=refs.slice(body.cursor,body.cursor+10);
 for(const r of batch){const key='reference-library160/'+r.sha256+'.png',old=await env.ARTIFACTS.get(key);if(old&&await sha(new Uint8Array(await old.arrayBuffer()))===r.sha256){skipped++;continue;}
 const response=await env.ASSETS.fetch(new Request('https://seed.invalid'+prefix+r.id+'.png'));if(!response.ok)throw Error('Approved seed missing: '+r.id);const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>20000000||await sha(bytes)!==r.sha256)throw Error('Approved seed hash mismatch: '+r.id);await env.ARTIFACTS.put(key,bytes,{customMetadata:{sha256:r.sha256,seed_version:SEED_VERSION},httpMetadata:{contentType:'image/png'}});copied++;}
 return Response.json({version:SEED_VERSION,next:body.cursor+batch.length,total:160,copied,skipped,ready_to_activate:body.cursor+batch.length===160},{headers:{'Cache-Control':'no-store'}});
}
