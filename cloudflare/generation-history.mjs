// Public projection: never serialize a run, attempt, planner input or receipt.
import {budgetState,guestPaidEnabled,reservationFor} from './budget.mjs';
import {sha} from './provider.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const statuses=new Set(['queued','running','complete','failed','needs_review','blocked','cancelled','claimed','received','unknown','closed_reserved_unknown','cost_bound_exceeded']);
const status=value=>statuses.has(value)?value:'unknown';
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
export async function publicGuestBudget(request,env){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 if(!env.DB)return json({error:'Budget unavailable'},503);
 const b=await budgetState(env),n=Number(new URL(request.url).searchParams.get('cards')||10);
 if(!Number.isInteger(n)||n<1||n>30)return json({error:'Card count must be 1–30'},400);
 const blockers=[...b.live_blockers,...b.guest_live_blockers];if(!guestPaidEnabled(env)||env.LIVE_GENERATION_ENABLED!=='true'||env.LIVE_PLANNER_ENABLED!=='true')blockers.push('paid_guest_gate_closed');if(b.guest_remaining<=0)blockers.push('shared_guest_budget_exhausted');if(guestPaidEnabled(env)&&b.remaining<reservationFor(env,'image','guest:public'))blockers.push('project_budget_unavailable');
 return json({scope:'all-visitors-current-budget-period',ceiling_nanodollars:b.guest_ceiling,remaining_nanodollars:b.guest_remaining,committed_nanodollars:b.guest_committed,generation_enabled:blockers.length===0,card_count:n,quote_nanodollars:null,quote_basis:'unavailable',blockers,accounting:'Shared $10 allowance with atomic reservations. Unknown outcomes retain the original hold until confirmed or manually resolved. Historical charges are retained.'});
}
export async function generationHistory(request,env){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 if(!env.DB)return json({error:'History unavailable'},503);
 const url=new URL(request.url);
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS public_generation_images (public_id TEXT PRIMARY KEY,job_id TEXT UNIQUE NOT NULL)').run();
 if(url.pathname==='/api/generations/image'){
  const id=url.searchParams.get('job');if(!id||id.length>250)return json({error:'Image not found'},404);
  // Only the original final image; no raw sources, applied private edits or arbitrary keys.
  const row=await env.DB.prepare('SELECT r.final_key FROM public_generation_images p JOIN results r ON r.job_id=p.job_id JOIN jobs j ON j.id=r.job_id JOIN runs u ON u.id=j.run_id WHERE p.public_id=?').bind(id).first();
  if(!row||!env.ARTIFACTS)return json({error:'Image not found'},404);
  const object=await env.ARTIFACTS.get(row.final_key);if(!object)return json({error:'Image not found'},404);
  return new Response(object.body,{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
 }
 const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)return json({error:'Invalid page'},400);
 // Planner failures without a resulting image run remain visible as independent attempts.
 const rows=(await env.DB.prepare(`SELECT id,mode,created_at,CASE WHEN principal_id='owner' THEN 'admin' ELSE 'guest' END source,'images' kind FROM runs
 UNION ALL SELECT p.id,'live',a.created_at,CASE WHEN p.principal_id='owner' THEN 'admin' ELSE 'guest' END,'plan' FROM planner_requests p LEFT JOIN attempts a ON a.job_id=p.id
 ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?`).bind(offset).all()).results;
 const items=[];
 for(const row of rows.slice(0,20)){
  let cards=[],state='unknown';
  if(row.kind==='images'){
   const jobs=(await env.DB.prepare('SELECT j.id,j.status,CASE WHEN r.final_key IS NOT NULL THEN 1 ELSE 0 END has_image FROM jobs j LEFT JOIN results r ON r.job_id=j.id WHERE j.run_id=? ORDER BY j.id').bind(row.id).all()).results;
   const imageMappings=[];
   for(const [i,j] of jobs.entries()){
    const id=await sha('public-card/v1:'+j.id);
    if(j.has_image)imageMappings.push([id,j.id]);
    cards.push({id,label:'Карточка '+(i+1),status:status(j.status),image_url:j.has_image?'/api/generations/image?job='+id:null});
   }
   // Bounded D1 batches, including legacy runs larger than today's 30-card limit.
   for(let start=0;start<imageMappings.length;start+=40){const part=imageMappings.slice(start,start+40);await env.DB.prepare('INSERT OR IGNORE INTO public_generation_images VALUES '+part.map(()=>'(?,?)').join(',')).bind(...part.flat()).run();}
   state=cards.length&&cards.every(c=>c.status==='complete')?'complete':cards.some(c=>['queued','running'].includes(c.status))?'running':cards.some(c=>c.status==='failed')?'failed':cards.some(c=>c.status==='blocked')?'blocked':cards[0]?.status||'unknown';
  }else{const p=await env.DB.prepare('SELECT status FROM planner_requests WHERE id=?').bind(row.id).first();state=status(p?.status);}
  items.push({id:await sha('public-run/v1:'+row.id),kind:row.kind,mode:row.mode==='mock'?'mock':'live',source:row.source,created_at:date(row.created_at),status:state,cards});
 }
 return json({version:'public-generation-history/v1',items,next_offset:rows.length>20?offset+20:null});
}
