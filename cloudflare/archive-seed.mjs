import {sha} from './provider.mjs';
import {validateArchive} from './experiment-archive.mjs';

// Only this reviewed package can be imported. No client URLs or filenames.
export const ARCHIVE_SEED_SHA='6402dd8b6e5cad7d7177322abb86d406c700f84d16f9931d89da7a83bd922bbd';
const prefix='/archive-seed/history-v1/';
const checkpointKey='experiment-archive/seed-progress/'+ARCHIVE_SEED_SHA+'.json';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const imageKey=h=>'experiment-archive/images/'+h;
async function packageManifest(request,env){
 const r=await env.ASSETS.fetch(new Request(new URL(prefix+'archive-manifest.json',request.url)));
 if(!r.ok)throw Error('Подготовленный архив недоступен');
 const bytes=new Uint8Array(await r.arrayBuffer());
 if(bytes.length>2000000||await sha(bytes)!==ARCHIVE_SEED_SHA)throw Error('Хеш подготовленного архива не совпал');
 return validateArchive(JSON.parse(new TextDecoder().decode(bytes)));
}
async function imageBytes(asset,request,env){
 const ext=asset.mime==='image/jpeg'?'jpg':asset.mime.split('/')[1];
 const r=await env.ASSETS.fetch(new Request(new URL(prefix+asset.sha256+'.'+ext,request.url)));
 if(!r.ok)throw Error('Файл подготовленного архива недоступен');
 const bytes=new Uint8Array(await r.arrayBuffer());
 if(bytes.length!==asset.bytes||await sha(bytes)!==asset.sha256)throw Error('Хеш или размер изображения не совпал');
 return bytes;
}
async function verifiedStored(asset,env){
 const obj=await env.ARTIFACTS.get(imageKey(asset.sha256));
 if(!obj)return false;
 const bytes=new Uint8Array(await obj.arrayBuffer());
 return bytes.length===asset.bytes&&await sha(bytes)===asset.sha256;
}
export async function importArchiveSeed(request,env){
 const url=new URL(request.url),statusOnly=url.pathname.endsWith('/seed-status');
 if(statusOnly?request.method!=='GET':request.method!=='POST')return response({error:'Method not allowed'},405);
 if(!statusOnly&&request.headers.get('Origin')!==url.origin)return response({error:'Same-origin POST required'},403);
 if(!env.ASSETS||!env.ARTIFACTS)return response({error:'Seed assets and storage required'},503);
 try{
  if(!statusOnly){const body=await request.text();if(body.length>100||body.trim()!=='{}')return response({error:'Fixed seed only; send {}'},400);}
  const manifest=await packageManifest(request,env),total=manifest.assets.length;
  const saved=await env.ARTIFACTS.get(checkpointKey);
  const state=saved?JSON.parse(await saved.text()):{copied:0,verified:0,published:false};
  if(!Number.isInteger(state.copied)||state.copied<0||state.copied>total||!Number.isInteger(state.verified)||state.verified<0||state.verified>state.copied)throw Error('Invalid seed checkpoint');
  if(!statusOnly&&!state.published){
   if(state.copied<total){
    for(const asset of manifest.assets.slice(state.copied,state.copied+5)){
     if(!await verifiedStored(asset,env))await env.ARTIFACTS.put(imageKey(asset.sha256),await imageBytes(asset,request,env),{httpMetadata:{contentType:asset.mime},customMetadata:{sha256:asset.sha256}});
     state.copied++;await env.ARTIFACTS.put(checkpointKey,JSON.stringify(state));
    }
   }else if(state.verified<total){
    for(const asset of manifest.assets.slice(state.verified,state.verified+5)){
     if(!await verifiedStored(asset,env)){
      state.copied=state.verified;state.verified=0;await env.ARTIFACTS.put(checkpointKey,JSON.stringify(state));
      throw Error('Проверка хранилища не прошла. Повторный запуск восстановит файл.');
     }
     state.verified++;await env.ARTIFACTS.put(checkpointKey,JSON.stringify(state));
    }
   }
   if(state.verified===total){
    const text=JSON.stringify(manifest);
    await env.ARTIFACTS.put('experiment-archive/versions/'+ARCHIVE_SEED_SHA+'.json',text);
    await env.ARTIFACTS.put('experiment-archive/active.json',text);
    state.published=true;await env.ARTIFACTS.put(checkpointKey,JSON.stringify(state));
   }
  }
  return response({version:ARCHIVE_SEED_SHA,total,...state});
 }catch(e){return response({error:e.message||'Seed import failed'},503);}
}
