import {planRevisionBatch} from './plan-review-batch.mjs';
export function createPlanReview({approve,revise,storage=localStorage,grid=null,onPage=()=>{},pageSize=10}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const panel=el('section');panel.id='plan-review';panel.className='plan-review plan-review-sidebar';panel.hidden=true;
 panel.append(el('h2','Изменения плана'),el('p','Отметьте предметы зелёным. Комментарии — в «Деталях». Отправьте все замены одной кнопкой.'));
 const warning=el('p'),repair=el('button','Уточнить проверки плана');repair.type='button';repair.className='plan-change';warning.setAttribute('role','alert');panel.append(warning,repair);
 const detailsBox=el('div');detailsBox.className='plan-item-change';detailsBox.hidden=true;
 const detailsLabel=el('label'),feedback=el('textarea');feedback.id='plan-item-feedback';feedback.maxLength=4000;feedback.placeholder='Необязательно: как заменить предмет';detailsLabel.htmlFor=feedback.id;detailsBox.append(detailsLabel,feedback);panel.append(detailsBox);
 const label=el('label','Общее пожелание (необязательно)'),input=el('textarea');input.id='plan-feedback';input.maxLength=4000;input.placeholder='Изменить тему или весь план';label.htmlFor=input.id;
 const count=el('p');count.id='plan-selection-count';count.setAttribute('aria-live','polite');
 const change=el('button','Отправить изменения'),confirm=el('button','Подтвердить и создать карточки');change.type=confirm.type='button';confirm.className='primary';change.className='plan-change';
 const note=el('p','Один текстовый запрос на все замены. Отклонённые предметы попадут в стоп-лист. Изображения начнут создаваться после подтверждения плана.'),status=el('p');status.setAttribute('role','status');panel.append(label,input,count,change,note,confirm,status);
 const cards=grid||el('div');if(!grid)panel.append(cards);
 let key='',working=false,blocked=false,selected=new Map(),objects=[],index=0,name='',active=false,detailId=null;
 const storeKey=()=> 'playrix-plan-review-draft/v1:'+key;
 const persist=()=>{try{storage.setItem(storeKey(),JSON.stringify({instruction:input.value,selected:[...selected],page:index}));}catch{}};
 const pageInfo=()=>onPage({index,pages:Math.ceil(objects.length/pageSize),count:objects.length,selected:selected.size,name,categories:[...new Set(objects.slice(index*pageSize,(index+1)*pageSize).map(o=>o.thematicCategory))]});
 const details=()=>{const value=selected.get(detailId);detailsBox.hidden=!value;if(value){detailsLabel.textContent='Детали: '+value.name;feedback.value=value.feedback||'';}};
 const controls=()=>{const hasChanges=!!selected.size||!!input.value.trim();count.textContent=selected.size?'Выбрано для замены: '+selected.size+'. Запрос ещё не отправлен.':'Предметы для замены не выбраны.';change.textContent=selected.size?'Отправить изменения · '+selected.size+' предметов':'Отправить изменения';change.disabled=working||!hasChanges;confirm.disabled=working||blocked||hasChanges;pageInfo();};
 const allButtons=()=>[...panel.querySelectorAll('button'),...cards.querySelectorAll('button')];
 const act=async(fn)=>{if(working)return;working=true;for(const b of allButtons())b.disabled=true;status.textContent='Отправляем весь список изменений…';try{await fn();try{storage.removeItem(storeKey());}catch{}}catch(e){status.textContent=e.message;}finally{working=false;for(const b of allButtons())b.disabled=false;controls();}};
 input.oninput=()=>{persist();controls();};
 feedback.oninput=()=>{const value=selected.get(detailId);if(value){value.feedback=feedback.value;persist();}};
 repair.onclick=()=>{input.value='Исправь ошибку проверки плана. Для каждого предмета укажи 2–3 конкретные проверки конструкции: число деталей, их соединения или рабочее расположение. Сохрани предметы, категории и порядок.';persist();controls();};
 change.onclick=()=>act(()=>{const batch=planRevisionBatch(input.value,selected);return revise(batch.instruction,batch.rejectedObjectIds);});confirm.onclick=()=>act(approve);
 const render=()=>{
 if(!active)return;
 cards.replaceChildren();
 for(const o of objects.slice(index*pageSize,(index+1)*pageSize)){
 const subject=o.display_name||o.main_identity,slot=el('div');slot.className='card-slot plan-card-slot';
 const card=el('button');card.type='button';card.className='collection-card plan-subject-card';card.setAttribute('aria-label','Выбрать для замены: '+subject);
 const art=el('span');art.className='card-art';const title=el('strong',subject),type=el('span',o.production_category);title.className='plan-subject-label';type.className='plan-subject-type';art.append(type,title);const caption=el('span',subject);caption.className='card-label';card.append(art,caption);
 const actions=el('div');actions.className='card-actions';const detail=el('button','Детали');detail.type='button';detail.setAttribute('aria-label','Детали: '+subject);actions.append(detail);
 const mark=()=>{const chosen=selected.has(o.object_id);card.setAttribute('aria-pressed',String(chosen));detail.hidden=!chosen;};
 card.onclick=()=>{if(working)return;if(selected.has(o.object_id))selected.delete(o.object_id);else selected.set(o.object_id,{name:subject,feedback:''});if(!selected.has(detailId))detailId=null;mark();details();persist();controls();};
 detail.onclick=()=>{detailId=o.object_id;details();feedback.focus();};
 mark();slot.append(card,actions);cards.append(slot);
 }controls();
 };
 return {panel,get active(){return active;},render,turnPage(delta){if(!active||working)return;index=Math.max(0,Math.min(Math.ceil(objects.length/pageSize)-1,index+delta));render();persist();},update(pending){
 active=!!pending?.planResult&&!pending.runId&&!pending.planApproved;panel.hidden=!active;if(!active)return;
 blocked=!!pending.planValidationError;warning.hidden=repair.hidden=!blocked;warning.textContent=pending.planValidationError||'';
 if(pending.planId===key){controls();return;}
 key=pending.planId;name=pending.name||'План коллекции';objects=pending.planResult.collections.flatMap(c=>(c.objects||[]).map(o=>({...o,thematicCategory:c.name})));selected=new Map();detailId=null;index=0;input.value='';status.textContent='';
 let draft={};try{draft=JSON.parse(storage.getItem(storeKey())||'{}');}catch{}
 const allowed=new Set(objects.map(o=>o.object_id));selected=new Map((draft.selected||[]).filter(([id])=>allowed.has(id)));input.value=draft.instruction||'';index=Math.max(0,Math.min(Math.ceil(objects.length/pageSize)-1,Number(draft.page)||0));details();render();
 }};
}
