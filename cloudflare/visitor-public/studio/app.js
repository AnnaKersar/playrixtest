import {calibratedAlternatives,drawCalibrated} from './editor-bridge.js';
let privateEditorConfigured=false,currentRole='owner';
const $=id=>document.getElementById(id);
async function api(path,body){const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok)throw Error(data.error||r.status);return data;}
const report=e=>{$('status').textContent=e.message||String(e);};
const button=(text,action)=>{const b=document.createElement('button');b.textContent=text;b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){report(e);}finally{b.disabled=false;}};return b;};
const link=(text,href)=>{const a=document.createElement('a');a.textContent=text;a.href=href;a.target='_blank';a.rel='noopener';return a;};
let currentRun;
async function refresh(){const data=await api('/api/studies');$('studies').replaceChildren(...data.runs.map(r=>button(`${r.name} · ${r.complete}/${r.total} · ${r.mode}`,()=>showRun(r.id))));}
async function showRun(runId){currentRun=runId;const data=await api('/api/run?run='+encodeURIComponent(runId));$('jobs').replaceChildren(...(currentRole==='owner'?[link('Экспорт исследования JSON','/api/export?run='+encodeURIComponent(runId))]:[]));
 for(const job of data.jobs){const row=document.createElement('div');row.className='job';const title=document.createElement('p');title.textContent=`${job.object_id} · ${job.status}`;row.append(title);$('jobs').append(row);
 if(job.status!=='complete'){if(job.status==='needs_review'||job.status==='running')row.append(button('Восстановить только сохранённый ответ',async()=>{await api('/api/recover',{jobId:job.id});await showRun(runId);}));continue;}
 row.append(link('PNG 860×960',`/api/asset?job=${job.id}`),...(currentRole==='owner'?[link('Манифест',`/api/asset?job=${job.id}&kind=manifest`)]:[]));
 const image=new Image();image.src=`/api/asset?job=${job.id}`;await image.decode();const manifest=await api(`/api/image-info?job=${job.id}`);
 const alternatives=job.alternatives?JSON.parse(job.alternatives):privateEditorConfigured?await calibratedAlternatives(job,image,manifest.final_sha256):['#e9cc8b','#bcdcca','#bdccea'].map((color,i)=>({id:'candidate-'+i,config:{version:'bootstrap-flat/v1',background:color,dimensions:[860,960],layerOrder:['background','object']}}));
 if(!job.alternatives)await api('/api/candidates',{jobId:job.id,alternatives});
 const cards=document.createElement('div');cards.className='cards';row.append(cards);
 const save=async(action,selected)=>{await api('/api/choices',{jobId:job.id,eventId:crypto.randomUUID(),revision:(job.revision||0)+1,action,selected,diagnostics:{},material:{}});await showRun(runId);};
 for(const a of alternatives){const card=document.createElement('div'),canvas=document.createElement('canvas');canvas.width=860;canvas.height=960;const ctx=canvas.getContext('2d');if(a.config.version==='bootstrap-flat/v1'){ctx.fillStyle=a.config.background;ctx.fillRect(0,0,860,960);ctx.drawImage(image,0,0);}else await drawCalibrated(canvas,a,job,image,manifest.final_sha256);card.append(canvas,button('Выбрать '+a.id,()=>save('select',a.id)));cards.append(card);}
 row.append(button('Ничего не подходит',()=>save('none')),button('Пропустить',()=>save('skip')),button('Отменить выбор',()=>save('undo')));if(job.choice){const saved=document.createElement('p');saved.className='saved';saved.textContent='Сохранено: '+job.choice;row.append(saved);}
 }}
$('plan').onclick=async()=>{try{const p=await api('/api/plan-mock',{theme:$('theme').value});$('objects').value=JSON.stringify(p.objects,null,2);$('status').textContent=p.warning;}catch(e){report(e);}};
$('run').onclick=async()=>{const b=$('run');b.disabled=true;try{const result=await api('/api/runs',{mode:'mock',name:$('theme').value,objects:JSON.parse($('objects').value)});$('status').textContent=result.queue_pending?'Создано; очередь ожидает отправки.':'Создано. Очередь обрабатывает по одному изображению.';await refresh();await showRun(result.runId);}catch(e){report(e);}finally{b.disabled=false;}};
$('dispatch').onclick=async()=>{try{report('Отправлено: '+(await api('/api/dispatch',{})).sent);}catch(e){report(e);}};
$('refresh').onclick=async()=>{try{await refresh();if(currentRun)await showRun(currentRun);}catch(e){report(e);}};
try{const state=await api('/api/preflight');currentRole=state.role;$('dispatch').hidden=currentRole!=='owner';privateEditorConfigured=state.editor==='private-package-configured';$('preflight').textContent=JSON.stringify(state,null,2);if(privateEditorConfigured)$('editor-note').textContent='Подключён приватный калиброванный v9. Новые исследования используют его три варианта; ранее сохранённые варианты остаются неизменными.';$('run').disabled=!state.mock_ready;$('plan').disabled=!state.mock_ready;if(state.mock_ready)await refresh();}catch(e){$('preflight').textContent=e.message;$('run').disabled=true;}
