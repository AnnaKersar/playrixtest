import {startGeneration,clearGenerationWaiting,readGeneration,generationProgress} from './generation-background.mjs?v=quality-v1-20261010';
import {cardActions} from './card-actions.mjs';
import {plannerStopped,plannerProgress,imageProgress} from './generation-progress.mjs';
import {PAGE_SIZE,collectionSettings,collectionBrief,plannedCollection,plannerPayload,imagePayload,categoryFor,blindComparison} from './generator-model.mjs?v=quality-v1';
const $=id=>document.getElementById(id),key='card-studio-generator/v2';let saved=JSON.parse(localStorage.getItem(key)||'{}'),runId=null,jobs=[],refs=[],page=0,busy=false,ready=false,serial=0,selection=0;let selectedComparisonJob=null;const rendered=new Map(),persist=()=>localStorage.setItem(key,JSON.stringify(saved));
async function api(path,body){let r;try{r=await fetch(path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});}catch(e){throw Error('Не удалось получить ответ сайта · '+path.split('?')[0]+'. Попытка сохранена; повторное нажатие проверит тот же запрос.');}const raw=await r.text();let d;try{d=JSON.parse(raw);}catch{throw Error('Сайт вернул неожиданный ответ вместо JSON · HTTP '+r.status+' · '+path.split('?')[0]+'. Попытка сохранена; повторное нажатие проверит тот же запрос.');}if(!r.ok)throw Error((d.error||String(r.status))+' · '+path.split('?')[0]+(d.diagnostic?' · '+d.diagnostic:''));return d;}

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
async function fullCard(job){if(rendered.has(job.id))return rendered.get(job.id);const image=new Image();image.src='/api/asset?job='+encodeURIComponent(job.id);image.alt=job.name||job.object_id;await image.decode();const card={image,type:categoryFor(job,null)};rendered.set(job.id,card);return card;}
async function showPage(){const ticket=++serial,start=page*PAGE_SIZE,visible=jobs.slice(start,start+PAGE_SIZE);$('card-grid').replaceChildren(...Array.from({length:PAGE_SIZE},(_,i)=>placeholder(start+i,visible[i])));$('previous').disabled=page===0;$('next').disabled=start+PAGE_SIZE>=jobs.length;for(const [i,job] of visible.entries()){if(job.status!=='complete')continue;try{const card=await fullCard(job);if(ticket!==serial)return;const b=node('button');b.type='button';b.className='collection-card';b.setAttribute('aria-label',job.name||job.object_id);b.setAttribute('aria-pressed',String(job.id===selectedComparisonJob));const art=node('span');art.className='card-art';art.append(card.image);const label=node('span',job.name||job.object_id);label.className='card-label';b.append(art,label);b.onclick=()=>selectCard(job,card,b);const slot=node('div');slot.className='card-slot';const actions=node('div');actions.className='card-actions';const urls=cardActions(runId,job),save=node('a','Сохранить PNG');save.href=urls.download;save.download=urls.filename;save.setAttribute('aria-label','Сохранить '+(job.name||job.object_id)+' в PNG');const test=node('a','Исправить');test.href='/card-editor.html?job='+encodeURIComponent(job.id);test.dataset.cardEdit=job.id;test.hidden=job.id!==selectedComparisonJob;test.setAttribute('aria-label','Открыть '+(job.name||job.object_id)+' в редакторе');actions.append(save,test);slot.append(b,actions);$('card-grid').children[i].replaceWith(slot);}catch(e){if(ticket!==serial)return;text('collection-status','Карточка '+job.object_id+': изображение недоступно. '+e.message);}}}
async function selectCard(job,card,button){selectedComparisonJob=job.id;const ticket=++selection;$('collection-advanced').open=false;if(!refs.length){try{refs=(await api('/api/references')).references;}catch{refs=[];}}if(ticket!==selection)return;for(const link of $('card-grid').querySelectorAll('[data-card-edit]'))link.hidden=link.dataset.cardEdit!==job.id;for(const b of $('card-grid').querySelectorAll('button.collection-card'))b.setAttribute('aria-pressed',String(b===button));$('comparison-hint').hidden=true;$('selected-card-info').hidden=false;text('selected-name','Случайный тест с референсами');if(job.thematic_category)text('collection-category','Категория: '+job.thematic_category);text('selected-type',card.type.category||'Тип уточняется');const items=blindComparison(refs,card.type.category);$('original-cards').replaceChildren(...items.map((item,i)=>{const f=node('figure'),img=node('img');img.src=item.generated?card.image.src:'/api/references/image?id='+encodeURIComponent(item.reference.id);img.alt='Карточка '+(i+1);f.append(img,node('figcaption',String(i+1)));return f;}));text('comparison-status',items.length?'Среди оригиналов этой категории — одна наша карточка. Повторный клик перемешает набор.':'Подходящие оригиналы не найдены. Проверка типа — во вкладке «Тест».');$('automatic-comparison').scrollIntoView({block:'nearest',behavior:'smooth'});}

const planDownload=node('a','Скачать состояние текущего плана');planDownload.download='planner-status.json';planDownload.hidden=true;
const diagnosticBox=node('details'),diagnosticTitle=node('summary','Диагностика карточек'),diagnosticList=node('div');diagnosticList.style.maxHeight='160px';diagnosticList.style.overflow='auto';diagnosticBox.append(diagnosticTitle,planDownload,diagnosticList);$('launch-form').append(diagnosticBox);
const diagnosticLabels={decoding_png:'Декодируем PNG',resizing_png:'Масштабируем PNG',encoding_png:'Кодируем итоговый PNG',writing_artifacts:'Записываем PNG в хранилище',updating_records:'Завершаем запись карточки',recovery_queued:'Восстановление ответа в очереди',recovery_failed:'Ошибка восстановления сохранённого ответа',requeue_requested:'Отправляем в очередь',requeued:'Очередь приняла задание',worker_received:'Worker получил задание',checking_frozen_input:'Проверяем сохранённый объект',checking_references:'Проверяем референсы',references_checked:'Референсы проверены',provider_starting:'Обращение к API',saving_result:'Сохраняем результат',complete:'Готово',needs_review:'Нужна проверка',failed_before_provider:'Ошибка до API',diagnostic_unavailable:'Диагностика недоступна'};
function showQueueDiagnostics(){diagnosticList.replaceChildren(...jobs.map(j=>{const d=j.queue_diagnostic;return node('p',(j.name||j.object_id)+': '+(d?diagnosticLabels[d.stage]||d.stage:'Нет отметки получения Worker')+(d?.error?' · '+d.error:'')+(d?.at?' · '+new Date(d.at).toLocaleTimeString():''));}));}
async function loadRun(id){if(runId!==id){selectedComparisonJob=null;++selection;$('comparison-hint').hidden=false;$('selected-card-info').hidden=true;}runId=id;const d=await api('/api/run?compact=1&run='+encodeURIComponent(id));jobs=d.jobs;const signature=id+'|'+jobs.map(j=>j.id+':'+j.status).join('|');const changed=signature!==lastRunSignature;lastRunSignature=signature;showQueueDiagnostics();page=Math.min(page,Math.max(0,Math.ceil(jobs.length/PAGE_SIZE)-1));text('collection-title',d.run.name);text('collection-category','Категория: '+((d.run.category_names||[]).join(' / ')||'не сохранена в старой попытке'));text('collection-status','Готово '+jobs.filter(j=>j.status==='complete').length+' / '+jobs.length+' · страницы по 10 карточек');if(changed)await showPage();}
$('previous').onclick=()=>{page--;showPage();};$('next').onclick=()=>{page++;showPage();};
const wait=()=>new Promise(resolve=>setTimeout(resolve,5000));
function updateGenerationUI(){
  saved=readGeneration();const progress=generationProgress();
  busy=!!saved.pending&&!saved.pending.paused;
  planDownload.hidden=!saved.pending?.planId;planDownload.style.display=saved.pending?.planId?'':'none';if(saved.pending?.planId)planDownload.href='/api/planner?id='+encodeURIComponent(saved.pending.planId);
  clearWaiting.hidden=!saved.pending;clearWaiting.style.display=saved.pending?'':'none';
  $('launch').disabled=busy;$('collection-name').disabled=busy;$('producer-wishes').disabled=busy;
  if(progress.message)text('launch-status',progress.message);
  const id=saved.pending?.runId||saved.runId;
  if(id&&!refreshingRun){refreshingRun=true;loadRun(id).catch(e=>text('collection-status',e.message)).finally(()=>refreshingRun=false);}
}
const clearWaiting=node('button','Снять зависшее ожидание');clearWaiting.type='button';clearWaiting.id='clear-generation-waiting';
$('launch-form').insertBefore(clearWaiting,$('launch'));
clearWaiting.onclick=async()=>{clearWaiting.disabled=true;try{await clearGenerationWaiting();updateGenerationUI();}catch(e){text('launch-status',e.message);}finally{clearWaiting.disabled=false;}};
let refreshingRun=false,lastRunSignature='';
window.addEventListener('generation-progress',updateGenerationUI);
async function launch(){
  if(busy)return;
  $('launch').disabled=true;
  try{const gate=await api('/api/preflight');if(gate.role==='owner'&&gate.budget?.live_blockers?.includes('attempt_billing_reconciliation_required')){text('launch-status','Завершаем учёт предыдущих попыток…');await api('/api/budget/reconcile',{});}await refreshReadiness({resume:!!readGeneration().pending?.planId});await startGeneration($('collection-name').value,$('producer-wishes').value,saved.advanced);updateGenerationUI();}
  catch(e){text('launch-status',e.message);$('launch').disabled=false;}
}
$('launch-form').onsubmit=e=>{e.preventDefault();launch();};
async function refreshReadiness({resume=false}={}){const state=await api('/api/preflight');const reasons=[...(state.missing||[]),...(state.live_missing||[]),...(state.planner?.missing||[]),...(state.budget?.live_blockers||[]).filter(reason=>!resume||reason!=='attempt_billing_reconciliation_required')];if(!state.live_enabled)reasons.push('Генерация отключена');if(!state.planner?.live)reasons.push('Планировщик отключён');if(state.planner?.ready===false&&!state.planner.missing?.length)reasons.push('Планировщик не готов');ready=reasons.length===0;if(!ready)throw Error(reasons.length===1&&reasons[0]==='attempt_billing_reconciliation_required'?'Новая генерация приостановлена: незавершён учёт предыдущего ответа. Диагностика доступна в истории и во вкладке «Тест».':'Запуск недоступен: '+[...new Set(reasons)].join(', '));return state;}
const requestedRun=new URLSearchParams(location.search).get('run');if(requestedRun){saved.runId=requestedRun;persist();}updateGenerationUI();
await showPage();text('launch-status','Проверяем подключение…');try{await refreshReadiness();text('launch-status','API готов. Укажите коллекцию и нажмите ЗАПУСТИТЬ.');}catch(e){text('launch-status',e.message);}
try{refs=(await api('/api/references')).references;}catch{refs=[];}
try{}catch(e){text('collection-status','Не удалось загрузить сохранённые коллекции: '+e.message);}



const publicDiagnosticBox=node('details'),publicDiagnosticTitle=node('summary','Диагностика обработки — доступна всем'),publicDiagnosticList=node('div');publicDiagnosticList.style.maxHeight='160px';publicDiagnosticList.style.overflow='auto';publicDiagnosticBox.append(publicDiagnosticTitle,publicDiagnosticList);$('launch-form').append(publicDiagnosticBox);
async function updatePublicDiagnostics(){try{const d=await api('/api/generation-status');publicDiagnosticList.replaceChildren(...(d.cards||[]).map(c=>node('p','Карточка '+c.number+': '+(c.stage==='no_worker_receipt'?'Нет отметки получения Worker':diagnosticLabels[c.stage]||c.stage)+(c.reason?' · '+c.reason:'')+(c.at?' · '+new Date(c.at).toLocaleTimeString():''))));if(!d.cards?.length)publicDiagnosticList.textContent='Пока нет попыток генерации.';}catch(e){publicDiagnosticList.textContent='Диагностика недоступна: '+e.message;}}
publicDiagnosticBox.addEventListener('toggle',()=>{if(publicDiagnosticBox.open)updatePublicDiagnostics();});await updatePublicDiagnostics();setInterval(()=>{if(publicDiagnosticBox.open)updatePublicDiagnostics();},10000);

updateGenerationUI();setInterval(()=>{if(readGeneration().pending?.runId)updateGenerationUI();},5000);

let appliedVersion=localStorage.getItem('card-collection-update');function refreshAppliedCards(){const next=localStorage.getItem('card-collection-update');if(next!==appliedVersion){appliedVersion=next;rendered.clear();lastRunSignature='';if(runId)void loadRun(runId);}}window.addEventListener('storage',refreshAppliedCards);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAppliedCards()});
