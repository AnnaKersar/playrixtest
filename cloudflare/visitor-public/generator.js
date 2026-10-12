import {createCardSelection} from './card-selection.mjs';
import {queueCardChanges} from './card-batch-background.mjs';
import {createPlanReview} from './plan-review.mjs';
import {collectionPNG,fileName} from '/collection-download.mjs';
import {startGeneration,resumeStoppedCollection,restoreGenerationAccess,startCardReplacement,approveGenerationPlan,reviseGenerationPlan,stopCurrentGeneration,clearGenerationWaiting,readGeneration,generationProgress,recordRunRead} from './generation-background.mjs?v=quality-v1-20261010';
import {cardActions} from './card-actions.mjs';
import {plannerStopped,plannerProgress,imageProgress} from './generation-progress.mjs';
import {PAGE_SIZE,collectionSettings,collectionBrief,plannedCollection,plannerPayload,imagePayload,categoryFor,blindComparison} from './generator-model.mjs?v=quality-v1';
let downloading=false,generationAccess=false,stoppedCollection=false;
const $=id=>document.getElementById(id),key='card-studio-generator/v2';let saved=JSON.parse(localStorage.getItem(key)||'{}'),runId=null,jobs=[],refs=[],page=0,busy=false,ready=false,serial=0,selection=0;let selectedComparisonJob=null;const rendered=new Map(),persist=()=>localStorage.setItem(key,JSON.stringify(saved));
async function api(path,body){let r;try{r=await fetch(path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});}catch(e){throw Error('Не удалось получить ответ сайта · '+path.split('?')[0]+'. Попытка сохранена; повторное нажатие проверит тот же запрос.');}const raw=await r.text();let d;try{d=JSON.parse(raw);}catch{throw Error('Сайт вернул неожиданный ответ вместо JSON · HTTP '+r.status+' · '+path.split('?')[0]+'. Попытка сохранена; повторное нажатие проверит тот же запрос.');}if(!r.ok)throw Error(((r.status===401||r.status===403)?'Войдите как владелец для доступа к сохранённой попытке':d.error||String(r.status))+' · '+path.split('?')[0]+(d.diagnostic?' · '+d.diagnostic:''));return d;}

function text(id,value){$(id).textContent=value;}function node(tag,label){const el=document.createElement(tag);if(label)el.textContent=label;return el;}
$('collection-name').value=saved.name||'';$('producer-wishes').value=saved.wishes||'';
saved.advanced||={category_count:'',category_theme:'',categories:[]};
$('category-count').value=saved.advanced.category_count||'';
$('category-theme').value=saved.advanced.category_theme||'';
function advancedChanged(){persist();updateAdvancedTotal();}
function updateAdvancedTotal(){try{const s=collectionSettings(saved.advanced);text('advanced-total',s.category_count+' категорий · '+s.total+' карточек · цельная генерация');}catch(e){text('advanced-total',e.message);}}
function renderCategorySettings(){
 const count=Number(saved.advanced.category_count)||1;
 $('category-settings').replaceChildren(...Array.from({length:Math.min(30,Math.max(1,count))},(_,i)=>{
  const box=node('section');box.className='category-row';box.append(node('h3','Категория '+(i+1)));
  const row=saved.advanced.categories[i]||={name:'',theme:'',card_count:''};
  for(const [key,label,placeholder,type]of [['name','Название категории','Система придумает','text'],['theme','Тема этой категории','По общей теме категорий','text'],['card_count','Карточек в категории','10','number']]){
   const id='category-'+i+'-'+key,l=node('label',label),input=node('input');l.htmlFor=id;input.id=id;input.type=type;input.value=row[key]||'';input.placeholder=placeholder;
   if(type==='number'){input.min=1;input.max=15;}else input.maxLength=300;
   input.oninput=()=>{(saved.advanced.categories[i]||={})[key]=input.value;advancedChanged();};box.append(l,input);
  }return box;
 }));updateAdvancedTotal();
}
$('category-count').oninput=()=>{saved.advanced.category_count=$('category-count').value;renderCategorySettings();advancedChanged();};
$('category-theme').oninput=()=>{saved.advanced.category_theme=$('category-theme').value;advancedChanged();};
$('add-category').onclick=()=>{saved.advanced.category_count=Math.min(30,(Number(saved.advanced.category_count)||1)+1);$('category-count').value=saved.advanced.category_count;renderCategorySettings();advancedChanged();};
renderCategorySettings();persist();

for(const id of ['collection-name','producer-wishes'])$(id).oninput=()=>{saved.name=$('collection-name').value;saved.wishes=$('producer-wishes').value;persist();};
function placeholder(index,job){const b=node('button');b.type='button';b.className='collection-card placeholder';b.disabled=true;b.append(node('span',String(index+1)),node('span',job?.object_id||'Карточка'));b.firstChild.className='slot-number';b.lastChild.className='card-label';return b;}
async function fullCard(job){const cacheKey=job.id+'|'+(job.applied_version||'original');if(rendered.has(cacheKey))return rendered.get(cacheKey);const image=new Image();image.src='/api/asset?job='+encodeURIComponent(job.id);image.alt=job.name||job.object_id;await image.decode();const card={image,type:categoryFor(job,null)};rendered.set(cacheKey,card);return card;}
async function showPage(){if(planReview.active){++serial;planReview.render();return;}const ticket=++serial,start=page*PAGE_SIZE,visible=jobs.slice(start,start+PAGE_SIZE);$('card-grid').replaceChildren(...Array.from({length:PAGE_SIZE},(_,i)=>placeholder(start+i,visible[i])));$('previous').disabled=page===0;$('next').disabled=start+PAGE_SIZE>=jobs.length;for(const [i,job] of visible.entries()){if(job.status!=='complete')continue;try{const card=await fullCard(job);if(ticket!==serial)return;const b=node('button');b.type='button';b.className='collection-card';b.setAttribute('aria-label',job.name||job.object_id);b.setAttribute('aria-pressed',String(job.id===selectedComparisonJob));const art=node('span');art.className='card-art';art.append(card.image);const label=node('span',job.name||job.object_id);label.className='card-label';b.append(art,label);b.onclick=()=>selectCard(job,card,b);const slot=node('div');slot.className='card-slot';const actions=node('div');actions.className='card-actions';const urls=cardActions(runId,job),save=node('a','Сохранить PNG');save.href=urls.download;save.download=urls.filename;save.setAttribute('aria-label','Сохранить '+(job.name||job.object_id)+' в PNG');const test=node('a','Исправить');test.href='/card-editor.html?job='+encodeURIComponent(job.id);test.dataset.cardEdit=job.id;test.hidden=job.id!==selectedComparisonJob;test.setAttribute('aria-label','Открыть '+(job.name||job.object_id)+' в редакторе');actions.append(save,test);cardSelection.decorate(job,b,actions);slot.append(b,actions);$('card-grid').children[i].replaceWith(slot);}catch(e){if(ticket!==serial)return;text('collection-status','Карточка '+job.object_id+': изображение недоступно. '+e.message);}}}
async function selectCard(job,card,button){selectedComparisonJob=job.id;const ticket=++selection;$('collection-advanced').open=false;if(!refs.length){try{refs=(await api('/api/references')).references;}catch{refs=[];}}if(ticket!==selection)return;for(const link of $('card-grid').querySelectorAll('[data-card-edit]'))link.hidden=link.dataset.cardEdit!==job.id;for(const b of $('card-grid').querySelectorAll('button.collection-card'))b.setAttribute('aria-pressed',String(b===button));$('comparison-hint').hidden=true;$('selected-card-info').hidden=false;text('selected-name','Случайный тест с референсами');if(job.thematic_category)text('collection-category','Категория: '+job.thematic_category);text('selected-type',card.type.category||'Тип уточняется');const items=blindComparison(refs,card.type.category);$('original-cards').replaceChildren(...items.map((item,i)=>{const f=node('figure'),img=node('img');img.src=item.generated?card.image.src:'/api/references/image?id='+encodeURIComponent(item.reference.id);img.alt='Карточка '+(i+1);f.append(img,node('figcaption',String(i+1)));return f;}));text('comparison-status',items.length?'Среди оригиналов этой категории — одна наша карточка. Повторный клик перемешает набор.':'Подходящие оригиналы не найдены. Проверка типа — во вкладке «Тест».');$('automatic-comparison').scrollIntoView({block:'nearest',behavior:'smooth'});}

const planDownload=node('a','Скачать состояние текущего плана');planDownload.download='planner-status.json';planDownload.hidden=true;
const diagnosticBox=node('details'),diagnosticTitle=node('summary','Диагностика карточек'),diagnosticList=node('div');diagnosticList.style.maxHeight='160px';diagnosticList.style.overflow='auto';diagnosticBox.append(diagnosticTitle,planDownload,diagnosticList);$('launch-form').append(diagnosticBox);
const diagnosticLabels={decoding_png:'Декодируем PNG',resizing_png:'Масштабируем PNG',encoding_png:'Кодируем итоговый PNG',writing_artifacts:'Записываем PNG в хранилище',updating_records:'Завершаем запись карточки',recovery_queued:'Восстановление ответа в очереди',recovery_failed:'Ошибка восстановления сохранённого ответа',requeue_requested:'Отправляем в очередь',requeued:'Очередь приняла задание',worker_received:'Worker получил задание',checking_frozen_input:'Проверяем сохранённый объект',checking_references:'Проверяем референсы',references_checked:'Референсы проверены',provider_starting:'Обращение к API',saving_result:'Сохраняем результат',complete:'Готово',needs_review:'Нужна проверка',failed_before_provider:'Ошибка до API',diagnostic_unavailable:'Диагностика недоступна'};
function showQueueDiagnostics(){diagnosticList.replaceChildren(...jobs.map(j=>{const d=j.queue_diagnostic;return node('p',(j.name||j.object_id)+': '+(d?diagnosticLabels[d.stage]||d.stage:j.status==='needs_review'?'Создание остановлено':j.status==='complete'?'Готово':({running:'Генерация выполняется',queued:'Ожидает своей очереди',blocked:'Ожидает допуска к генерации',cancelled:'Остановлено',failed:'Создание остановлено'})[j.status]||'Проверяем состояние')+((d?.error||j.attempt_error)?' · '+(d?.error||j.attempt_error):'')+(d?.at?' · '+new Date(d.at).toLocaleTimeString():''));}));}
async function loadRun(id){if(runId!==id){selectedComparisonJob=null;++selection;$('comparison-hint').hidden=false;$('selected-card-info').hidden=true;}runId=id;const d=await api('/api/run?compact=1&run='+encodeURIComponent(id));if(planReview.active)return;jobs=d.jobs;stoppedCollection=!!d.run.cancelled;resumeButton.hidden=!stoppedCollection||jobs.every(j=>j.status==='complete');resumeButton.disabled=busy;recordRunRead(d);cardSelection.bind(id,jobs,planReview.active);$('download-collection').disabled=downloading||!jobs.length||jobs.some(j=>j.status!=='complete');const signature=id+'|'+jobs.map(j=>j.id+':'+j.status+':'+(j.applied_version||'original')).join('|');const changed=signature!==lastRunSignature;lastRunSignature=signature;showQueueDiagnostics();page=Math.min(page,Math.max(0,Math.ceil(jobs.length/PAGE_SIZE)-1));text('collection-title',d.run.name);text('collection-category','Категория: '+((d.run.category_names||[]).join(' / ')||'не сохранена в старой попытке'));text('collection-status','Готово '+jobs.filter(j=>j.status==='complete').length+' / '+jobs.length+' · страницы по 10 карточек');if(changed)await showPage();}
$('previous').onclick=()=>{if(planReview.active){planReview.turnPage(-1);return;}page--;showPage();};$('next').onclick=()=>{if(planReview.active){planReview.turnPage(1);return;}page++;showPage();};
const wait=()=>new Promise(resolve=>setTimeout(resolve,5000));
const planReview=createPlanReview({grid:$('card-grid'),onPage:d=>{text('collection-title',d.name);text('collection-category','Категория: '+d.categories.join(' / '));text('collection-status','План · '+d.count+' карточек · страница '+(d.index+1)+' / '+d.pages);$('previous').disabled=d.index===0;$('next').disabled=d.index+1>=d.pages;$('download-collection').disabled=true;},approve:async()=>{await approveGenerationPlan();updateGenerationUI();},revise:async(text,ids)=>{await reviseGenerationPlan(text,ids);updateGenerationUI();}});$('launch-form').after(planReview.panel);
const cardSelection=createCardSelection({onEdit:async actions=>queueCardChanges(actions.map(t=>({...t,kind:'edit'}))),onReplace:startCardReplacement,refresh:()=>{$('automatic-comparison').hidden=planReview.active||cardSelection.active;void showPage()}});document.querySelector('.board-controls').prepend(cardSelection.button);$('launch-form').after(cardSelection.panel);
const resumeButton=node('button','Продолжить коллекцию');resumeButton.type='button';resumeButton.id='resume-collection';resumeButton.hidden=true;resumeButton.disabled=true;document.querySelector('.board-controls').prepend(resumeButton);resumeButton.onclick=async()=>{resumeButton.disabled=true;try{await resumeStoppedCollection(runId,jobs.length);updateGenerationUI();}catch(e){text('launch-status',e.message);}finally{resumeButton.disabled=busy;}};
function updateGenerationUI(){
  saved=readGeneration();const progress=generationProgress(),wasReview=planReview.active;if(saved.pending?.planResult&&!saved.pending.runId)++serial;planReview.update(saved.pending);if(wasReview&&!planReview.active){lastRunSignature='';void showPage();}$('card-grid').hidden=false;cardSelection.bind(runId,jobs,planReview.active);$('automatic-comparison').hidden=planReview.active||cardSelection.active;
  busy=!!saved.pending&&!saved.pending.paused;resumeButton.hidden=!stoppedCollection||jobs.every(j=>j.status==='complete')||planReview.active;resumeButton.disabled=busy;
  planDownload.hidden=!saved.pending?.planId;planDownload.style.display=saved.pending?.planId?'':'none';if(saved.pending?.planId)planDownload.href='/api/planner?id='+encodeURIComponent(saved.pending.planId);
  stopButton.hidden=!(saved.pending||jobs.some(j=>!['complete','cancelled'].includes(j.status)));clearWaiting.hidden=!saved.pending;clearWaiting.style.display=saved.pending?'':'none';
  $('launch').disabled=busy||!generationAccess;$('collection-name').disabled=busy;$('producer-wishes').disabled=busy;
  if(progress.message)text('launch-status',/^(?:Planner(?: revision| origin)? access denied)$/i.test(progress.message)?'Сессия владельца истекла. Войдите, чтобы продолжить сохранённый план. Гость может создать свою новую коллекцию.':progress.message==='Часть карточек требует проверки. Откройте «Тест».'?'Создание карточек остановилось. Подробности — в диагностике и истории генераций.':progress.message==='Not authorized for this resource'?'Сохранённая попытка относится к другой сессии. Нажмите «ЗАПУСТИТЬ», чтобы создать новую коллекцию в текущей сессии. Прежняя попытка сохранится в истории.':progress.message);
 const ownerLink=document.querySelector('.owner-link');if(ownerLink){const needsLogin=!!saved.pending?.authRequired||/^(?:Planner(?: revision| origin)? access denied|Not authorized for this resource)$/i.test(progress.message||'');ownerLink.textContent=needsLogin?'Войти и продолжить сохранённую попытку':'Вход владельца';ownerLink.classList.toggle('action',needsLogin);}
  const id=saved.pending?.runId||saved.runId;
  if(id&&!refreshingRun&&!planReview.active){refreshingRun=true;loadRun(id).catch(e=>text('collection-status',e.message)).finally(()=>refreshingRun=false);}
}
const stopButton=node('button','СТОП');stopButton.type='button';stopButton.id='stop-generation';stopButton.hidden=true;
$('launch-form').insertBefore(stopButton,$('launch'));
stopButton.onclick=async()=>{stopButton.disabled=true;try{await stopCurrentGeneration();await refreshReadiness();updateGenerationUI();}catch(e){text('launch-status',e.message);}finally{stopButton.disabled=false;}};
const clearWaiting=node('button','Снять зависшее ожидание');clearWaiting.type='button';clearWaiting.id='clear-generation-waiting';
$('launch-form').insertBefore(clearWaiting,$('launch'));
clearWaiting.onclick=async()=>{clearWaiting.disabled=true;try{await clearGenerationWaiting();updateGenerationUI();}catch(e){text('launch-status',e.message);}finally{clearWaiting.disabled=false;}};
let refreshingRun=false,lastRunSignature='';
window.addEventListener('generation-progress',updateGenerationUI);
async function launch(){
  if(busy||!generationAccess)return;
  $('launch').disabled=true;
  try{const gate=await api('/api/preflight');if(gate.role==='owner'&&gate.budget?.live_blockers?.includes('attempt_billing_reconciliation_required')){text('launch-status','Завершаем учёт предыдущих попыток…');await api('/api/budget/reconcile',{});}await refreshReadiness({resume:!!readGeneration().pending?.planId});await startGeneration($('collection-name').value,$('producer-wishes').value,saved.advanced);updateGenerationUI();}
  catch(e){text('launch-status',e.message);$('launch').disabled=!generationAccess;}
}
$('launch-form').onsubmit=e=>{e.preventDefault();launch();};
async function refreshReadiness({resume=false}={}){
 let response=await fetch('/api/preflight');
 if(response.status===401){await api('/api/guest/session',{});response=await fetch('/api/preflight');}
 if(!response.ok){generationAccess=false;$('launch').disabled=true;throw Error('Не удалось подключить генератор. Попробуйте обновить страницу.');}
 const state=await response.json();if(await restoreGenerationAccess(state))updateGenerationUI();document.getElementById('guest-budget').hidden=state.role==='owner';
 const reasons=[...(state.missing||[]),...(state.live_missing||[]),...(state.planner?.missing||[]),...(state.budget?.live_blockers||[]).filter(reason=>!resume||reason!=='attempt_billing_reconciliation_required')];
 if(!state.live_enabled)reasons.push('Генерация недоступна');if(!state.planner?.live||state.planner?.ready===false)reasons.push('Подготовка коллекции недоступна');
 ready=reasons.length===0;generationAccess=state.role==='owner'||ready;$('launch').disabled=busy||!generationAccess;
 if(!ready)throw Error(state.role==='owner'?'Запуск недоступен: '+[...new Set(reasons)].join(', '):state.budget?.guest_remaining<=0?'Общий гостевой бюджет исчерпан.':'Генерация временно недоступна.');return state;
}
const requestedRun=new URLSearchParams(location.search).get('run');if(requestedRun){saved.runId=requestedRun;persist();}updateGenerationUI();
setInterval(()=>{if(!document.hidden&&!busy)void refreshReadiness().catch(()=>{});},15000);
await showPage();text('launch-status','Проверяем подключение…');try{await refreshReadiness();text('launch-status','API готов. Укажите коллекцию и нажмите ЗАПУСТИТЬ.');}catch(e){text('launch-status',e.message);}
try{refs=(await api('/api/references')).references;}catch{refs=[];}
try{}catch(e){text('collection-status','Не удалось загрузить сохранённые коллекции: '+e.message);}



const publicDiagnosticBox=node('details'),publicDiagnosticTitle=node('summary','Диагностика обработки — доступна всем'),publicDiagnosticList=node('div');publicDiagnosticList.style.maxHeight='160px';publicDiagnosticList.style.overflow='auto';publicDiagnosticBox.append(publicDiagnosticTitle,publicDiagnosticList);$('launch-form').append(publicDiagnosticBox);
async function updatePublicDiagnostics(){try{const d=await api('/api/generation-status');publicDiagnosticList.replaceChildren(...(d.cards||[]).map(c=>node('p','Карточка '+c.number+': '+(c.stage==='no_worker_receipt'?'Нет отметки получения Worker':diagnosticLabels[c.stage]||c.stage)+(c.reason?' · '+c.reason:'')+(c.at?' · '+new Date(c.at).toLocaleTimeString():''))));if(!d.cards?.length)publicDiagnosticList.textContent='Пока нет попыток генерации.';}catch(e){publicDiagnosticList.textContent='Диагностика недоступна: '+e.message;}}
publicDiagnosticBox.addEventListener('toggle',()=>{if(publicDiagnosticBox.open)updatePublicDiagnostics();});await updatePublicDiagnostics();setInterval(()=>{if(publicDiagnosticBox.open)updatePublicDiagnostics();},10000);

updateGenerationUI();setInterval(()=>{if(readGeneration().pending?.runId)updateGenerationUI();},5000);

let appliedVersion=localStorage.getItem('card-collection-update');function refreshAppliedCards(){const next=localStorage.getItem('card-collection-update');if(next!==appliedVersion){appliedVersion=next;rendered.clear();lastRunSignature='';if(runId)void loadRun(runId);}}window.addEventListener('storage',refreshAppliedCards);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAppliedCards()});

$('download-collection').onclick=async()=>{if(downloading)return;const snapshot=jobs.map(j=>({...j})),name=$('collection-title').textContent;downloading=true;$('download-collection').disabled=true;text('download-status','Собираем PNG всей коллекции…');try{const blob=await collectionPNG(snapshot,fetch,(n,total)=>text('download-status','Скачиваем карточки '+n+' / '+total)),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName(name)+'.zip';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);text('download-status','Готово: '+snapshot.length+' PNG в ZIP-архиве.');}catch(e){text('download-status',e.message);}finally{downloading=false;$('download-collection').disabled=!jobs.length||jobs.some(j=>j.status!=='complete');}};
