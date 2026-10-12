import {queueCardChanges} from '/card-batch-background.mjs';
import '/card-edit-background.mjs';
import {collectionBrief,plannedCollection,plannerPayload,imagePayload} from '/generator-model.mjs?v=quality-v1';
import {plannerStopped,plannerProgress,imageProgress} from '/generation-progress.mjs';
export const generationKey='card-studio-generator/v2';
const progressKey='card-studio-generation-progress/v1';
export const readGeneration=()=>{try{return JSON.parse(localStorage.getItem(generationKey)||'{}');}catch{return {};}};
const readProgress=()=>{try{return JSON.parse(localStorage.getItem(progressKey)||'{}');}catch{return {};}};
function save(state){const value=JSON.stringify(state);if(localStorage.getItem(generationKey)!==value)localStorage.setItem(generationKey,value);}
function progressIdentity(progress){const {at,...rest}=progress;return JSON.stringify({...rest,message:(rest.message||'').replace(/ · \d+:\d+/g,'')});}
function publish(progress){if(progressIdentity(readProgress())===progressIdentity(progress))return;localStorage.setItem(progressKey,JSON.stringify({...progress,at:Date.now()}));window.dispatchEvent(new Event('generation-progress'));}
const pollGateKey='card-studio-generation-poll/v1',POLL_MS=10000;
async function api(path,body){
  const response=await fetch(path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{throw Object.assign(Error('Сайт вернул не JSON · HTTP '+response.status),{status:response.status||503});}
  if(!response.ok)throw Object.assign(Error(response.status===401||data.error==='Not authorized for this resource'?'Сохранённая попытка относится к другой сессии. Гость может запустить свою новую коллекцию кнопкой «ЗАПУСТИТЬ». Для просмотра прежней попытки владельца нужен вход владельца.':data.error||'HTTP '+response.status),{status:response.status,authRequired:response.status===401||data.error==='Not authorized for this resource'});
  return data;
}
export async function stopCurrentGeneration(){
 const initial=readGeneration();if(initial.pending){initial.pending.paused=true;save(initial);}
 const stop=async()=>{
  const state=readGeneration(),p=state.pending;
  const runId=p?(p.runId||p.expectedRunId):state.runId,planId=p?.planId||p?.expectedPlanId;
  await api('/api/stop-generation',{...(runId?{runId}:{}),...(planId?{planId}:{})});
  if(p)state.detached_attempts=[...(state.detached_attempts||[]),{...p,detachedAt:Date.now(),reason:'user-stopped'}];
  state.pending=null;save(state);publish({phase:'idle',runId:runId||null,message:'Генерация остановлена. Готовые карточки сохранены. Можно запустить новую коллекцию.'});
 };
 if(navigator.locks)await navigator.locks.request('playrix-generation-step',stop);else await stop();
}
export function generationProgress(){return readProgress();}
export async function clearGenerationWaiting(){
 const clear=()=>{
  const state=readGeneration(),pending=state.pending;
  if(!pending)return;
  state.detached_attempts=[...(state.detached_attempts||[]),{...pending,detachedAt:Date.now()}];
  if(pending.runId)state.runId=pending.runId;
  state.pending=null;save(state);
  publish({phase:'idle',runId:state.runId||null,message:'Ожидание снято. Карточки и история сохранены. Можно настроить новую коллекцию.'});
 };
 if(navigator.locks)await navigator.locks.request('playrix-generation-step',clear);else clear();
}
function commitPending(patch,plannerKey){
  const state=readGeneration();
  if(state.pending?.plannerKey!==plannerKey)return null;
  Object.assign(state.pending,patch);save(state);return state;
}
export async function startGeneration(name,wishes,advanced={}){
  const draft=collectionBrief(name,wishes,advanced);plannerPayload(draft);
  const identity=await api('/api/preflight');const existingPending=readGeneration().pending;const expected=existingPending?await stableId('planner_',identity.principalId,existingPending.plannerKey):null;
  let rejectedPending=!!existingPending?.providerRejected;if(existingPending?.paused&&existingPending.planId&&(existingPending.principalId===identity.principalId||existingPending.expectedPlanId===expected)){const prior=await api('/api/planner?id='+encodeURIComponent(existingPending.planId));rejectedPending=!!prior.result?.provider_error;}
  const changedSession=!!existingPending&&((existingPending.principalId&&existingPending.principalId!==identity.principalId)||(existingPending.expectedPlanId&&existingPending.expectedPlanId!==expected));
  const start=()=>{
    const state=readGeneration();
    if((changedSession||rejectedPending)&&state.pending?.plannerKey===existingPending.plannerKey){state.detached_attempts=[...(state.detached_attempts||[]),{...state.pending,detachedAt:Date.now(),reason:'different-session'}];state.pending=null;state.runId=null;}
    if(!state.pending)state.pending={plannerKey:crypto.randomUUID(),runKey:crypto.randomUUID(),name:draft.collection_name,wishes:draft.producer_comment,draft:rejectedPending&&existingPending.revision?existingPending.draft:draft,...(rejectedPending&&existingPending.revision?{revision:existingPending.revision}:{}),principalId:identity.principalId,startedAt:Date.now()};
    state.pending.authRequired=false;state.pending.paused=false;state.name=name;state.wishes=wishes;state.advanced=advanced;save(state);
    publish({phase:'running',message:'Продолжаем генерацию…',runId:state.pending.runId||null});
  };
  if(navigator.locks)await navigator.locks.request('playrix-generation-step',start);else start();
  tick();
}

export async function approveGenerationPlan(){
 const approve=()=>{const s=readGeneration(),p=s.pending;if(!p?.planResult||p.runId||p.paused)throw Error('Нет готового плана для подтверждения.');if(p.planValidationError)throw Error(p.planValidationError+' Сначала уточните текстовый план.');plannedCollection(p.draft,p.planResult);if(p.replacement){const objects=p.planResult.collections.flatMap(c=>c.objects);for(const id of p.replacement.objectIds){if(!p.replacement.sourceJobs[id]||!objects.some(o=>o.object_id===id))throw Error('У выбранного предмета нет готовой исходной карточки.');}queueCardChanges(p.replacement.objectIds.map(id=>({kind:'replace',sourceJobId:p.replacement.sourceJobs[id],planId:p.planId,name:objects.find(o=>o.object_id===id)?.display_name})));s.pending=null;save(s);publish({phase:'idle',runId:s.runId,message:'Замены отправлены. Новые версии появятся в редакторе; примените их после проверки.'});return;}p.planApproved=true;save(s);localStorage.removeItem(pollGateKey);publish({phase:'running',message:'План подтверждён. Начинаем создание карточек.'});};
 if(navigator.locks)await navigator.locks.request('playrix-generation-step',approve);else approve();tick();
}
export async function reviseGenerationPlan(instruction,rejectedObjectIds=[]){
 instruction=String(instruction||'').trim();if((!instruction&&!rejectedObjectIds.length)||instruction.length>4000)throw Error('Опишите изменения: до 4000 символов.');
 const revise=()=>{const s=readGeneration(),p=s.pending;if(!p?.planResult||!p.planId||p.runId||p.planApproved)throw Error('Изменить план можно до запуска карточек.');
 const draft=structuredClone(p.draft);draft.collection_settings.categories.forEach(c=>{c.name='';});
 const presets=JSON.parse(draft.preset_collections);presets.categories.forEach(c=>{c.name='Use the revised category name from the prior plan, unless the user requests a change';});draft.preset_collections=JSON.stringify(presets);
 s.plan_history=[...(s.plan_history||[]),{planId:p.planId,plan:p.planResult,instruction,at:Date.now()}].slice(-10);
 s.pending={plannerKey:crypto.randomUUID(),runKey:crypto.randomUUID(),name:p.name,wishes:p.wishes,draft,principalId:p.principalId,startedAt:Date.now(),revision:{plan_id:p.planId,instruction,rejected_object_ids:rejectedObjectIds},...(p.replacement?{replacement:{...p.replacement,objectIds:[...new Set([...p.replacement.objectIds,...rejectedObjectIds])]}}:{}),planApproved:false};
 save(s);localStorage.removeItem(pollGateKey);publish({phase:'running',message:'Уточняем текстовый план. Изображения ещё не создаются.'});};
 if(navigator.locks)await navigator.locks.request('playrix-generation-step',revise);else revise();tick();
}


export async function startCardReplacement(runId,selected){
 if(readGeneration().pending&&!readGeneration().pending.paused)throw Error('Сначала завершите или остановите текущую генерацию. Ваш выбор сохранён.');
 const context=await api('/api/card-replacement-context?run='+encodeURIComponent(runId));
 const sourceJobs=Object.fromEntries(context.jobs.map(j=>[j.object_id,j.id])),ids=selected.map(t=>context.jobs.find(j=>j.id===t.sourceJobId)?.object_id);
 if(ids.some(id=>!id)||!ids.length)throw Error('Выберите готовые карточки исходной коллекции.');
 const comments=selected.map((t,i)=>t.note?.trim()?'Предмет '+ids[i]+': '+t.note.trim():'').filter(Boolean).join('\n');
 const instruction='Замените только отмеченные предметы. Все object_id, типы C1–C4 и неотмеченные предметы должны остаться неизменными.\n'+comments;
 if(instruction.length>4000)throw Error('Общий комментарий длиннее 4000 символов.');
 const advanced={category_count:context.plan.collections.length,categories:context.plan.collections.map(c=>({name:c.name,card_count:c.objects.length}))},draft=collectionBrief(context.name,context.producer_comment,advanced),identity=await api('/api/preflight');
 const start=()=>{const state=readGeneration();if(state.pending&&!state.pending.paused)throw Error('Дождитесь текущей генерации.');state.pending={plannerKey:crypto.randomUUID(),runKey:crypto.randomUUID(),name:context.name,wishes:context.producer_comment,draft,principalId:identity.principalId,startedAt:Date.now(),revision:{plan_id:context.plannerId,instruction,rejected_object_ids:ids},replacement:{runId,sourceJobs,objectIds:ids},planApproved:false};save(state);localStorage.removeItem(pollGateKey);publish({phase:'running',message:'Планировщик подбирает замену выбранным предметам. Остальные карточки сохраняются.'});};
 if(navigator.locks)await navigator.locks.request('playrix-generation-step',start);else start();tick();
}

async function existing(path){try{return await api(path);}catch(error){if(error.status===404)return null;throw error;}}
async function stableId(prefix,principal,key){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(principal+'|'+key));
  return prefix+[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,48);
}
async function step(){
  const state=readGeneration(),p=state.pending;
  if(!p||p.paused)return;
  const draft=p.draft||collectionBrief(p.name,p.wishes);
  try{
    if(!p.expectedPlanId||!p.expectedRunId){const identity=await api('/api/preflight');p.expectedPlanId=await stableId('planner_',identity.principalId,p.plannerKey);p.expectedRunId=await stableId('run_',identity.principalId,p.runKey);commitPending({expectedPlanId:p.expectedPlanId,expectedRunId:p.expectedRunId},p.plannerKey);}
    if(!p.planId){
      publish({phase:'running',message:plannerProgress({stage:'queued'},Date.now()-p.startedAt)});
      const response=await api('/api/plan-live',{...plannerPayload(draft),requestId:p.plannerKey,...(p.revision?{revision:p.revision}:{}),approval:'I approve one paid planner attempt'});
      commitPending({planId:response.requestId},p.plannerKey);return;
    }
    if(!p.runId){
      const plan=p.planResult?{status:'complete',stage:'complete',result:{plan:p.planResult}}:await api('/api/planner?id='+encodeURIComponent(p.planId));
      publish({phase:'running',message:plannerProgress(plan,Date.now()-p.startedAt)});
      if(plan.result?.validation_error&&!plan.result?.plan)throw Object.assign(Error('План не прошёл проверку: '+plan.result.validation_error),{terminal:true});
      if(plan.result?.plan){
        if(!p.planResult){commitPending({planResult:plan.result.plan,planApproved:false,planValidationError:plan.result.validation_error||null},p.plannerKey);publish({phase:'review',message:'План готов. Проверьте темы и предметы перед созданием карточек.'});return;}
        if(!p.planApproved){publish({phase:'review',message:'План готов. Можно изменить его текстом или подтвердить генерацию карточек.'});return;}
        let approved;try{approved=plannedCollection(draft,plan.result.plan);}catch(error){throw Object.assign(error,{terminal:true});}
        publish({phase:'running',message:'План готов · '+plan.result.plan.collections.map(c=>c.name).join(' / ')+' · передаём карточки в очередь'});
        const response=await api('/api/runs',{...imagePayload(approved),requestId:p.runKey,planner_request_id:p.planId,mode:'live',approval:'I approve one paid attempt per object'});
        const fresh=commitPending({runId:response.runId},p.plannerKey);
        if(fresh){fresh.runId=response.runId;save(fresh);}return;
      }
      if(plan.error?.startsWith('Invalid redirect value, must be one of')){
        const recovery=await api('/api/planner-recover',{requestId:p.planId});
        if(recovery.not_sent)throw Object.assign(Error('Запрос не отправлен. Откройте генератор для новой попытки.'),{terminal:true});
      }
      if(plannerStopped.has(plan.status)||plannerStopped.has(plan.stage))throw Object.assign(Error('План остановлен: '+(plan.result?.provider_error?.message||plan.error||plan.stage||plan.status)),{terminal:true,providerRejected:!!plan.result?.provider_error});
      return;
    }
    const result=await api('/api/run?compact=1&run='+encodeURIComponent(p.runId));
    const jobs=result.jobs||[];
    if(jobs.length&&jobs.every(job=>job.status==='complete')){
      const fresh=readGeneration();if(fresh.pending?.plannerKey!==p.plannerKey)return;
      fresh.runId=p.runId;fresh.pending=null;
      fresh.completed={runId:p.runId,name:result.run.name||p.name,count:jobs.length,at:Date.now()};
      save(fresh);publish({phase:'complete',runId:p.runId,message:'Все '+jobs.length+' карточек готовы. Коллекция сохранена в истории.'});showNotification();return;
    }
    publish({phase:'running',runId:p.runId,message:imageProgress(jobs,draft.card_count)});
    if(jobs.length&&jobs.every(job=>job.status==='complete'||plannerStopped.has(job.status)))throw Object.assign(Error('Создание карточек остановилось. Причина доступна в «Диагностике карточек» и в истории генераций. Сохранённая попытка не отправляется повторно.'),{terminal:true});
  }catch(error){
    if(readGeneration().pending?.plannerKey!==p.plannerKey)return;
    if(error.status>=400&&error.status<500&&![408,429].includes(error.status))error.terminal=true;
    if(error.terminal)commitPending({paused:true,...(error.providerRejected?{providerRejected:true}:{}),...(error.authRequired?{authRequired:true}:{})},p.plannerKey);
    publish({phase:error.terminal?'paused':'running',runId:p.runId||null,message:error.terminal?error.message:'Проверка временно недоступна: '+error.message+'. Сохранённая попытка не отправляется повторно.'});
  }
}
let ticking=false;
async function tick(){
  if(ticking)return;ticking=true;
  try{
    const check=async()=>{
      const state=readGeneration();if(!state.pending||state.pending.paused||state.pending.planResult&&!state.pending.planApproved&&!state.pending.runId)return;
      let gate={};try{gate=JSON.parse(localStorage.getItem(pollGateKey)||'{}');}catch{}
      const now=Date.now();if(gate.key===state.pending.plannerKey&&now-gate.at<POLL_MS)return;
      localStorage.setItem(pollGateKey,JSON.stringify({key:state.pending.plannerKey,at:now}));
      await step();
    };
    if(navigator.locks)await navigator.locks.request('playrix-generation-step',{ifAvailable:true},lock=>lock?check():undefined);else await check();
  }
  finally{ticking=false;}
}
function onGenerator(){return !!document.getElementById('launch-form')&&!document.hidden;}
function showNotification(){
  const completed=readGeneration().completed;
  if(!completed)return;
  if(onGenerator()){localStorage.setItem('playrix-notification-dismissed',completed.runId);document.getElementById('generation-toast')?.remove();return;}
  if(localStorage.getItem('playrix-notification-dismissed')===completed.runId)return;
  if(document.getElementById('generation-toast'))return;
  const toast=document.createElement('aside');toast.id='generation-toast';toast.className='generation-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
  const title=document.createElement('strong');title.textContent='✦ Коллекция готова!';
  const message=document.createElement('p');message.textContent='«'+completed.name+'» · '+completed.count+' карточек';
  const link=document.createElement('a');link.href='/?run='+encodeURIComponent(completed.runId);link.textContent='Открыть коллекцию';
  const close=document.createElement('button');close.type='button';close.className='generation-toast-close';close.setAttribute('aria-label','Закрыть уведомление');close.textContent='×';
  close.onclick=()=>{localStorage.setItem('playrix-notification-dismissed',completed.runId);toast.remove();};
  link.onclick=()=>localStorage.setItem('playrix-notification-dismissed',completed.runId);
  toast.append(title,message,link,close);document.body.append(toast);
}
window.addEventListener('storage',event=>{if([generationKey,progressKey].includes(event.key)){window.dispatchEvent(new Event('generation-progress'));showNotification();}});
document.addEventListener('visibilitychange',()=>{showNotification();tick();});
window.addEventListener('pageshow',()=>{showNotification();tick();});
showNotification();tick();setInterval(tick,POLL_MS);
