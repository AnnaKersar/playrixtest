import {isReferenceSeedPath,copyReferenceSeed} from './reference-seed.mjs';
import {ownerNavigationRedirect} from './owner-navigation.mjs';
import {referenceLibraryPublic,referenceLibraryImport} from './reference-library.mjs';
import {referenceImport} from './reference-import.mjs';
import {privateImport} from './private-import.mjs';
import {archivePublic,archiveImport} from './experiment-archive.mjs';
import {importArchiveSeed} from './archive-seed.mjs';
import {ownerIdentity,ownerLogin,ownerLogout} from './owner-session.mjs';
import {sha} from './provider.mjs';
import {budgetState} from './budget.mjs';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
async function throttle(env,ip,action,principal=''){
 const now=Math.floor(Date.now()/1000),minute=Math.floor(now/60),hour=Math.floor(now/3600),ipHash=(await sha(ip)).slice(0,32);
 const windows=[['global:'+minute,60,now+120],['ip:'+ipHash+':'+minute,20,now+120]];
 if(action==='session')windows.push(['sessions:'+ipHash+':'+hour,8,now+7200]);
 if(action==='run')windows.push(['runs:'+ipHash+':'+hour,12,now+7200],['principal:'+principal+':'+hour,6,now+7200]);
 // Each upsert is atomic. Partial consumption on denial is conservative.
 for(const[key,limit,expiry]of windows){const r=await env.DB.prepare('INSERT INTO guest_throttle VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 WHERE hits<?').bind(key,expiry,limit).run();if(!r.meta.changes)return false;}
 await env.DB.prepare('DELETE FROM guest_throttle WHERE expires_at<?').bind(now-3600).run();return true;
}
export async function anonymousIdentity(request,env){
 const match=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-card_guest=([a-f0-9]{64})(?:;|$)/);if(!match)return null;
 const row=await env.DB.prepare('SELECT principal_id FROM anonymous_sessions WHERE token_hash=? AND expires_at>?').bind(await sha(match[1]),Math.floor(Date.now()/1000)).first();return row?{role:'generator',principalId:row.principal_id,anonymous:true}:null;
}
export async function sessionEndpoint(request,env){
 if(!env.DB)return json({error:'Guest storage not configured'},503);const url=new URL(request.url);
 if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return json({error:'Same-origin POST required'},403);
 const ip=request.headers.get('CF-Connecting-IP');if(!ip)return json({error:'Trusted edge client address unavailable'},503);
 const existing=await anonymousIdentity(request,env);if(existing)return json({principalId:existing.principalId,role:'anonymous-guest'});
 if(!await throttle(env,ip,'session'))return json({error:'Please wait before creating another guest session'},429,{'Retry-After':'60'});
 const bytes=crypto.getRandomValues(new Uint8Array(32)),token=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join(''),principalId='anon-'+crypto.randomUUID(),expires=Math.floor(Date.now()/1000)+30*86400;
 await env.DB.prepare('INSERT INTO anonymous_sessions VALUES (?,?,?)').bind(await sha(token),principalId,expires).run();
 return json({principalId,role:'anonymous-guest'},201,{'Set-Cookie':`__Host-card_guest=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`});
}
const publicPaths=new Set(['/generation-background.mjs','/generation-background.css','/generator.js','/card-actions.mjs','/generation-progress.mjs','/generator-model.mjs','/generator.css','/studio/workspace.js','/studio/editor-bridge.js','/studio/flow-model.mjs','/studio/style.css','/studio/workspace.css','/ui.css','/home.css','/demo.html','/owner-navigation.mjs','/references','/references/','/references.html','/references.js','/references.css','/','/index','/index/','/index.html','/demo.js','/demo.css','/owner','/owner/','/owner.html','/owner.js','/archive','/archive/','/archive.html','/archive.js','/archive.css']);
const readPaths=new Set(['/api/studies','/api/run','/api/asset','/api/image-info']);
for(const file of ['', '/', '/index.html', '/style.css', '/test.json', ...['ref','gpt-latest','flux-lora','flux-base'].flatMap(group=>['cup','basket'].map(object=>'/'+group+'-'+object+'.png'))])publicPaths.add('/archive/latest-lora-test'+file);
for(const file of ['archive-manifest.json','missing-media.json','recovery-candidates.json'])publicPaths.add('/archive-seed/history-v1/'+file);
const writePaths=new Set(['/api/runs','/api/candidates','/api/choices']);
// Caller supplies the existing role-aware backend. This module grants no owner role.
export function createPublicGuestWorker(backend){return {
 async fetch(request,env){const url=new URL(request.url);
  try{
   if(['GET','HEAD'].includes(request.method)&&(isReferenceSeedPath(url.pathname)||['/game-art/garden-background.png','/game-art/cards-emblem.png'].includes(url.pathname)))return await env.PUBLIC_ASSETS.fetch(request);
   if(['GET','HEAD'].includes(request.method)&&publicPaths.has(url.pathname)){
    if(!env.PUBLIC_ASSETS)return json({error:'Public-safe editor not configured'},503);const r=await env.PUBLIC_ASSETS.fetch(request),headers=new Headers(r.headers);headers.set('Cache-Control','no-store');headers.set('Content-Security-Policy',"frame-src 'self'; default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");headers.set('X-Content-Type-Options','nosniff');return new Response(request.method==='HEAD'?null:r.body,{status:r.status,headers});
   }
   if(url.pathname==='/api/generation-status'&&request.method==='GET'){
 if(!env.DB||!env.ARTIFACTS)return json({error:'Диагностика временно недоступна'},503);
 const run=await env.DB.prepare("SELECT id FROM runs WHERE mode='live' ORDER BY created_at DESC LIMIT 1").first();if(!run)return json({version:'public-generation-status/v1',cards:[]});
 const jobs=(await env.DB.prepare('SELECT id,status FROM jobs WHERE run_id=? ORDER BY id').bind(run.id).all()).results;
 const stages=new Set(['decoding_png','resizing_png','encoding_png','writing_artifacts','updating_records','recovery_queued','recovery_failed','requeue_requested','requeued','worker_received','checking_frozen_input','checking_references','references_checked','provider_starting','saving_result','complete','needs_review','failed_before_provider','diagnostic_unavailable']);
 const cards=await Promise.all(jobs.map(async(j,i)=>{let d=null;try{const o=await env.ARTIFACTS.get('queue-diagnostics/'+j.id+'.json');if(o)d=await o.json();}catch{}let reason=null;if(d?.error){const e=String(d.error).toLowerCase();reason=e.includes('reference')||e.includes('sheet')?'Ошибка проверки референсов':e.includes('png')||e.includes('dimension')?'Ошибка формата изображения':e.includes('budget')?'Ограничение бюджета':e.includes('disabled')?'Обработка отключена':e.includes('timeout')?'Превышено время ожидания':'Ошибка обработки; подробности доступны владельцу';}return {number:i+1,status:['queued','running','complete','failed','needs_review','blocked'].includes(j.status)?j.status:'unknown',stage:stages.has(d?.stage)?d.stage:'no_worker_receipt',at:d?.at&&Number.isFinite(Date.parse(d.at))?d.at:null,reason};}));
 return json({version:'public-generation-status/v1',cards});
 }
 if(url.pathname==='/api/references'||url.pathname==='/api/references/image')return await referenceLibraryPublic(request,env);if(url.pathname==='/api/archive'||url.pathname.startsWith('/api/archive/image/'))return await archivePublic(request,env);
   if(url.pathname==='/api/owner/login')return await ownerLogin(request,env);
   if(url.pathname==='/api/owner/logout')return await ownerLogout(request,env);
   const owner=await ownerIdentity(request,env);if(url.pathname==='/api/owner/library-import/seed')return owner?await copyReferenceSeed(request,env):json({error:'Owner login required'},401);if(url.pathname.startsWith('/api/owner/library-import/'))return owner?await referenceLibraryImport(request,env):json({error:'Owner login required'},401);if(url.pathname.startsWith('/api/owner/reference-import/'))return owner?await referenceImport(request,env):json({error:'Owner login required'},401);if(url.pathname.startsWith('/api/owner/private-import/'))return owner?await privateImport(request,env):json({error:'Owner login required'},401);if(['/api/owner/archive/seed','/api/owner/archive/seed-status'].includes(url.pathname))return owner?await importArchiveSeed(request,env):json({error:'Owner login required'},401);if(url.pathname.startsWith('/api/owner/archive/'))return owner?await archiveImport(request,env):json({error:'Owner login required'},401);if(owner)return await backend(request,env,owner);const redirect=ownerNavigationRedirect(request);if(redirect)return redirect;
   if(url.pathname==='/api/guest/session')return await sessionEndpoint(request,env);
   if(!env.DB)return json({error:'Guest backend unavailable'},503);
   const identity=await anonymousIdentity(request,env);if(!identity)return json({error:'Start an anonymous guest session; no account or login required'},401);
   if(url.pathname==='/api/guest/budget'&&request.method==='GET'){const b=await budgetState(env);return json({scope:'all-visitors-lifetime',ceiling_nanodollars:b.guest_ceiling,remaining_nanodollars:b.guest_remaining,generation_enabled:false,blockers:b.live_blockers.length?['billing_reconciliation_or_configuration_required']:['public_safe_live_assets_not_approved']});}
   const allowed=request.method==='GET'?readPaths.has(url.pathname):request.method==='POST'&&writePaths.has(url.pathname);if(!allowed)return json({error:'Private/owner operation unavailable to public visitors'},403);
   if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'Same-origin request required'},403);
   if(url.pathname==='/api/asset'&&(url.searchParams.get('kind')||'final')!=='final')return json({error:'Private source artifact unavailable'},403);
   const ip=request.headers.get('CF-Connecting-IP');if(!ip)return json({error:'Trusted edge client address unavailable'},503);
   if(!await throttle(env,ip,url.pathname==='/api/runs'?'run':'api',identity.principalId))return json({error:'Guest request limit reached'},429,{'Retry-After':'60'});
   if(url.pathname==='/api/runs'){
    const length=Number(request.headers.get('Content-Length')||0);if(length>2000000)return json({error:'Body too large'},413);
    // Bounded read before parsing; no request can enable live or select private reference packs.
    const reader=request.clone().body.getReader();let count=0;const chunks=[];while(true){const{value,done}=await reader.read();if(done)break;count+=value.length;if(count>2000000){await reader.cancel();return json({error:'Body too large'},413);}chunks.push(value);}const body=JSON.parse(await new Blob(chunks).text());
    if(body.mode&&body.mode!=='mock')return json({error:'Public paid generation is disabled until public asset sharing and cost bounds are approved'},403);
    if(!Array.isArray(body.objects)||body.objects.length!==1)return json({error:'Public test allows one synthetic mock object per run'},400);
   }
   return await backend(request,{...env,LIVE_GENERATION_ENABLED:'false',LIVE_PLANNER_ENABLED:'false'},identity);
  }catch{return json({error:'Guest storage/configuration unavailable'},503);}
 },
 async queue(){throw Error('Public entry cannot execute a paid queue; use separately guarded worker job processing.');}
};}
