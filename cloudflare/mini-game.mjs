export const GAME_RUN='run_f73a3f8fda77497c541c8b29edcbce284bfab215e780a347';
export async function miniGame(request,env){
 const url=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'Read only'},{status:405});
 if(url.pathname==='/api/game/image'){
  const id=url.searchParams.get('job');
  if(typeof id!=='string'||!id.startsWith(GAME_RUN+'_')||!/^[a-zA-Z0-9_-]+$/.test(id))return Response.json({error:'Card outside game batch'},{status:404});
  const row=await env.DB.prepare("SELECT r.final_key FROM results r JOIN jobs j ON j.id=r.job_id WHERE j.id=? AND j.run_id=? AND j.status='complete'").bind(id,GAME_RUN).first();
  const image=row&&await env.ARTIFACTS.get(row.final_key);if(!image)return Response.json({error:'Image missing'},{status:404});
  return new Response(request.method==='HEAD'?null:image.body,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'}});
 }
 const run=await env.DB.prepare('SELECT frozen_key FROM runs WHERE id=?').bind(GAME_RUN).first();
 if(!run)return Response.json({error:'Game batch missing'},{status:503});
 const frozen=await (await env.ARTIFACTS.get(run.frozen_key)).json();
 const jobs=(await env.DB.prepare("SELECT id,object_id FROM jobs WHERE run_id=? AND status='complete'").bind(GAME_RUN).all()).results;
 if(jobs.length!==30)return Response.json({error:'Game batch requires all 30 cards'},{status:503});
 const cards=jobs.map(j=>({id:j.id,category:frozen.objects.find(o=>o.object_id===j.object_id)?.category,image:'/api/game/image?job='+encodeURIComponent(j.id)}));
 return Response.json({cards},{headers:{'Cache-Control':'no-store'}});
}
