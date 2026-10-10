import {collectionBrief,plannedCollection,plannerPayload,imagePayload} from '/generator-model.mjs';
import {plannerStopped,plannerProgress,imageProgress} from '/generation-progress.mjs';
export const generationKey='card-studio-generator/v2';
const progressKey='card-studio-generation-progress/v1';
export const readGeneration=()=>{try{return JSON.parse(localStorage.getItem(generationKey)||'{}');}catch{return {};}};
const readProgress=()=>{try{return JSON.parse(localStorage.getItem(progressKey)||'{}');}catch{return {};}};
function save(state){localStorage.setItem(generationKey,JSON.stringify(state));}
function publish(progress){localStorage.setItem(progressKey,JSON.stringify({...progress,at:Date.now()}));window.dispatchEvent(new Event('generation-progress'));}
async function api(path,body){
  const response=await fetch(path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();
  if(!response.ok)throw Object.assign(Error(data.error||'HTTP '+response.status),{status:response.status});
  return data;
}
export function generationProgress(){return readProgress();}
function commitPending(patch,plannerKey){
  const state=readGeneration();
  if(state.pending?.plannerKey!==plannerKey)return null;
  Object.assign(state.pending,patch);save(state);return state;
}
export async function startGeneration(name,wishes,advanced={}){
  const draft=collectionBrief(name,wishes,advanced);plannerPayload(draft);
  const start=()=>{
    const state=readGeneration();
    if(!state.pending)state.pending={plannerKey:crypto.randomUUID(),runKey:crypto.randomUUID(),name:draft.collection_name,wishes:draft.producer_comment,draft,startedAt:Date.now()};
    state.pending.paused=false;state.name=name;state.wishes=wishes;state.advanced=advanced;save(state);
    publish({phase:'running',message:'Продолжаем генерацию…',runId:state.pending.runId||null});
  };
  if(navigator.locks)await navigator.locks.request('playrix-generation-step',start);else start();
  tick();
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
      if(await existing('/api/planner?id='+encodeURIComponent(p.expectedPlanId))){commitPending({planId:p.expectedPlanId},p.plannerKey);return;}
      const response=await api('/api/plan-live',{...plannerPayload(draft),requestId:p.plannerKey,approval:'I approve one paid planner attempt'});
      commitPending({planId:response.requestId},p.plannerKey);return;
    }
    if(!p.runId){
      const plan=await api('/api/planner?id='+encodeURIComponent(p.planId));
      publish({phase:'running',message:plannerProgress(plan,Date.now()-p.startedAt)});
      if(plan.result?.validation_error)throw Object.assign(Error('План не прошёл проверку: '+plan.result.validation_error),{terminal:true});
      if(plan.result?.plan){
        if(await existing('/api/run?run='+encodeURIComponent(p.expectedRunId))){const fresh=commitPending({runId:p.expectedRunId},p.plannerKey);if(fresh){fresh.runId=p.expectedRunId;save(fresh);}return;}
        let approved;try{approved=plannedCollection(draft,plan.result.plan);}catch(error){throw Object.assign(error,{terminal:true});}
        const response=await api('/api/runs',{...imagePayload(approved),requestId:p.runKey,planner_request_id:p.planId,mode:'live',approval:'I approve one paid attempt per object'});
        const fresh=commitPending({runId:response.runId},p.plannerKey);
        if(fresh){fresh.runId=response.runId;save(fresh);}return;
      }
      if(plan.error?.startsWith('Invalid redirect value, must be one of')){
        const recovery=await api('/api/planner-recover',{requestId:p.planId});
        if(recovery.not_sent)throw Object.assign(Error('Запрос не отправлен. Откройте генератор для новой попытки.'),{terminal:true});
      }
      if(plannerStopped.has(plan.status)||plannerStopped.has(plan.stage))throw Object.assign(Error('План остановлен: '+(plan.error||plan.stage||plan.status)),{terminal:true});
      return;
    }
    const result=await api('/api/run?run='+encodeURIComponent(p.runId));
    const jobs=result.jobs||[];
    if(jobs.length&&jobs.every(job=>job.status==='complete')){
      const fresh=readGeneration();if(fresh.pending?.plannerKey!==p.plannerKey)return;
      fresh.runId=p.runId;fresh.pending=null;
      fresh.completed={runId:p.runId,name:result.run.name||p.name,count:jobs.length,at:Date.now()};
      save(fresh);publish({phase:'complete',runId:p.runId,message:'Все '+jobs.length+' карточек готовы. Коллекция сохранена в истории.'});showNotification();return;
    }
    publish({phase:'running',runId:p.runId,message:imageProgress(jobs,draft.card_count)});
    if(jobs.length&&jobs.every(job=>job.status==='complete'||plannerStopped.has(job.status)))throw Object.assign(Error('Часть карточек требует проверки. Откройте «Тест».'),{terminal:true});
  }catch(error){
    if(error.terminal)commitPending({paused:true},p.plannerKey);
    publish({phase:error.terminal?'paused':'running',runId:p.runId||null,message:error.terminal?error.message:'Попытка сохранена. Продолжаем проверять ответ сайта…'});
  }
}
let ticking=false;
async function tick(){
  if(ticking)return;ticking=true;
  try{if(navigator.locks)await navigator.locks.request('playrix-generation-step',{ifAvailable:true},lock=>lock?step():undefined);else await step();}
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
window.addEventListener('storage',event=>{if([generationKey,progressKey].includes(event.key)){window.dispatchEvent(new Event('generation-progress'));showNotification();tick();}});
document.addEventListener('visibilitychange',()=>{showNotification();tick();});
window.addEventListener('pageshow',()=>{showNotification();tick();});
showNotification();tick();setInterval(tick,5000);
