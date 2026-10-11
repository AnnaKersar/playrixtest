import {planRevisionBatch} from './plan-review-batch.mjs';
export function createPlanReview({approve,revise,storage=localStorage}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const panel=el('section');panel.id='plan-review';panel.className='plan-review';panel.hidden=true;
 panel.append(el('h2','План коллекции'),el('p','Сначала отметьте все предметы для замены и добавьте пожелания, если нужно. Затем отправьте изменения одной кнопкой. Изображения начнут создаваться после подтверждения готового плана.'));
 const warning=el('p'),repair=el('button','Уточнить проверки плана');repair.type='button';repair.className='plan-change';warning.setAttribute('role','alert');panel.append(warning,repair);
 const list=el('div');list.className='plan-review-list';panel.append(list);
 const label=el('label','Изменить тему или весь план'),input=el('textarea');input.id='plan-feedback';input.maxLength=4000;input.placeholder='Необязательно: пожелания ко всему плану';label.htmlFor=input.id;
 const count=el('p');count.id='plan-selection-count';count.setAttribute('aria-live','polite');
 const change=el('button','Отправить изменения'),confirm=el('button','Подтвердить и создать карточки');change.type=confirm.type='button';confirm.className='primary';change.className='plan-change';
 const note=el('p','Один текстовый запрос на все выбранные замены. Отклонённые предметы попадут в стоп-лист коллекции. Изображения при этом не генерируются.'),status=el('p');status.setAttribute('role','status');panel.append(label,input,count,change,note,confirm,status);
 let key='',working=false,blocked=false,selected=new Map();
 const storeKey=()=> 'playrix-plan-review-draft/v1:'+key;
 const persist=()=>{try{storage.setItem(storeKey(),JSON.stringify({instruction:input.value,selected:[...selected]}));}catch{}};
 const controls=()=>{const hasChanges=!!selected.size||!!input.value.trim();count.textContent=selected.size?'Выбрано для замены: '+selected.size+'. Запрос ещё не отправлен.':'Предметы для замены не выбраны.';change.textContent=selected.size?'Отправить изменения · '+selected.size+' предметов':'Отправить изменения';change.disabled=working||!hasChanges;confirm.disabled=working||blocked||hasChanges;};
 const act=async(fn)=>{if(working)return;working=true;for(const b of panel.querySelectorAll('button'))b.disabled=true;status.textContent='Отправляем весь список изменений…';try{await fn();try{storage.removeItem(storeKey());}catch{}}catch(e){status.textContent=e.message;}finally{working=false;for(const b of panel.querySelectorAll('button'))b.disabled=false;controls();}};
 input.oninput=()=>{persist();controls();};
 repair.onclick=()=>{input.value='Исправь ошибку проверки плана. Для каждого предмета укажи 2–3 конкретные проверки конструкции: число деталей, их соединения или рабочее расположение. Сохрани предметы, категории и порядок.';persist();controls();};
 change.onclick=()=>act(()=>{const batch=planRevisionBatch(input.value,selected);return revise(batch.instruction,batch.rejectedObjectIds);});confirm.onclick=()=>act(approve);
 return {panel,update(pending){
 const review=!!pending?.planResult&&!pending.runId&&!pending.planApproved;panel.hidden=!review;if(!review)return;blocked=!!pending.planValidationError;warning.hidden=repair.hidden=!blocked;warning.textContent=pending.planValidationError||'';
 const signature=pending.planId;if(signature===key){controls();return;}key=signature;input.value='';selected=new Map();status.textContent='';list.replaceChildren();
 let draft={};try{draft=JSON.parse(storage.getItem(storeKey())||'{}');}catch{}
 const allowed=new Set(pending.planResult.collections.flatMap(c=>c.objects||[]).map(o=>o.object_id));selected=new Map((draft.selected||[]).filter(([id])=>allowed.has(id)));input.value=draft.instruction||'';
 for(const c of pending.planResult.collections||[]){
 const group=el('section');group.className='plan-review-category';group.append(el('h3',c.name),el('p',c.coherence_rationale||''));const items=el('ol');
 for(const o of c.objects||[]){
 const name=o.display_name||o.main_identity,item=el('li');item.className='plan-card-slot';
 const edit=el('button');edit.type='button';edit.className='collection-card plan-subject-card';edit.setAttribute('aria-label','Выбрать для замены: '+name);
 const title=el('strong',name),type=el('span',o.production_category),descriptionText=el('span',o.theme_role||o.main_identity);title.className='plan-subject-label';type.className='plan-subject-type';descriptionText.className='plan-subject-note';edit.append(type,title,descriptionText);
 const details=el('button','Детали');details.type='button';details.className='plan-change';details.setAttribute('aria-label','Детали: '+name);let detailsOpen=false;
 const form=el('div');form.className='plan-item-change';form.hidden=true;const description=el('label','Пожелание к замене (необязательно)'),feedback=el('textarea');feedback.id='replace-'+o.object_id;feedback.maxLength=4000;feedback.placeholder='Можно оставить пустым';description.htmlFor=feedback.id;feedback.value=selected.get(o.object_id)?.feedback||'';
 form.append(description,feedback,el('p','Замена добавлена в список. Она отправится вместе с остальными выбранными предметами.'));
 const renderSelection=()=>{const active=selected.has(o.object_id);form.hidden=!active||!detailsOpen;details.hidden=!active;item.dataset.replacementSelected=String(active);edit.setAttribute('aria-pressed',String(active));controls();};
 edit.onclick=()=>{if(selected.has(o.object_id))selected.delete(o.object_id);else selected.set(o.object_id,{name,feedback:feedback.value});renderSelection();persist();};
 details.onclick=()=>{detailsOpen=!detailsOpen;renderSelection();};
 feedback.oninput=()=>{selected.set(o.object_id,{name,feedback:feedback.value});persist();controls();};
 item.append(edit,details,form);items.append(item);renderSelection();
 }group.append(items);list.append(group);
 }controls();
 }};
}
