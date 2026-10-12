import {trackCardEdit} from '/card-edit-background.mjs';
import {createCardBatchRunner} from '/card-batch-runner.mjs';
const key='playrix-card-batch/v1';
export const cardBatchState=()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}};
const save=s=>{const text=JSON.stringify(s);if(localStorage.getItem(key)===text)return;localStorage.setItem(key,text);window.dispatchEvent(new Event('card-batch-progress'));};
export function queueCardChanges(tasks){const previous=cardBatchState();if(previous.tasks?.some(t=>!['complete','failed','needs_review','cancelled'].includes(t.status)))throw Error('Предыдущие правки ещё выполняются.');if(!tasks.length||tasks.length>30)throw Error('Выберите от 1 до 30 готовых карточек.');save({tasks:tasks.map(t=>({...t,requestId:crypto.randomUUID(),status:'queued'})),at:Date.now()});void check();}
async function api(url,body){const response=await fetch(url,body?{signal:AbortSignal.timeout(30000),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{signal:AbortSignal.timeout(30000)});const text=await response.text();let data;try{data=JSON.parse(text)}catch{throw Object.assign(Error('Сайт временно недоступен. Очередь правок сохранена.'),{status:503})}if(!response.ok)throw Object.assign(Error(data.error||'HTTP '+response.status),{status:response.status});return data;}
const check=createCardBatchRunner({read:cardBatchState,save,api,track:trackCardEdit,canStart:()=>{try{const p=JSON.parse(localStorage.getItem('card-studio-generator/v2')||'{}').pending;return !p||p.paused||!!p.planResult&&!p.planApproved;}catch{return true}}});
setInterval(()=>void check(),10000);document.addEventListener('visibilitychange',()=>void check());void check();
