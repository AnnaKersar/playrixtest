export function createPlanReview({approve,revise}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const panel=el('section');panel.id='plan-review';panel.className='plan-review';panel.hidden=true;
 panel.append(el('h2','План коллекции'),el('p','Проверьте темы и предметы. Изображения начнут создаваться только после вашего подтверждения.'));
 const list=el('div');list.className='plan-review-list';panel.append(list);
 const label=el('label','Изменить тему или весь план'),input=el('textarea');input.id='plan-feedback';input.maxLength=4000;input.placeholder='Например: замени тему второй категории на приключения';label.htmlFor=input.id;
 const change=el('button','Обновить план'),confirm=el('button','Подтвердить и создать карточки');change.type=confirm.type='button';confirm.className='primary';change.className='plan-change';
 const note=el('p','Коррекция — отдельный текстовый запрос планировщика. Изображения при этом не генерируются.'),status=el('p');status.setAttribute('role','status');panel.append(label,input,change,note,confirm,status);
 let key='',working=false;
 const act=async(fn)=>{if(working)return;working=true;for(const b of panel.querySelectorAll('button'))b.disabled=true;status.textContent='Сохраняем изменения…';try{await fn();}catch(e){status.textContent=e.message;}finally{working=false;for(const b of panel.querySelectorAll('button'))b.disabled=false;}};
 change.onclick=()=>act(()=>revise(input.value));confirm.onclick=()=>act(approve);
 return {panel,update(pending){
 const review=!!pending?.planResult&&!pending.runId&&!pending.planApproved;panel.hidden=!review;if(!review)return;
 const signature=pending.planId;if(signature===key)return;key=signature;input.value='';status.textContent='';list.replaceChildren();
 for(const c of pending.planResult.collections||[]){
 const group=el('section');group.className='plan-review-category';group.append(el('h3',c.name),el('p',c.coherence_rationale||''));const items=el('ol');
 for(const o of c.objects||[]){
 const item=el('li'),title=el('strong',o.display_name||o.main_identity);item.append(title,el('span',o.production_category),el('p',o.theme_role||o.main_identity));
 const edit=el('button','Изменить предмет');edit.type='button';edit.className='plan-change';edit.setAttribute('aria-label','Изменить предмет: '+(o.display_name||o.main_identity));
 const form=el('div');form.className='plan-item-change';form.hidden=true;const description=el('label','Пожелание к замене (необязательно)'),feedback=el('textarea');feedback.id='replace-'+o.object_id;feedback.maxLength=4000;feedback.placeholder='Оставьте пустым — система предложит новый предмет';description.htmlFor=feedback.id;
 const replace=el('button','Заменить предмет'),cancel=el('button','Отмена');replace.type=cancel.type='button';replace.className='primary';
 form.append(description,feedback,el('p','Этот предмет попадёт в стоп-лист коллекции, включая похожие варианты.'),replace,cancel);
 edit.onclick=()=>{form.hidden=false;feedback.focus();};cancel.onclick=()=>{form.hidden=true;};replace.onclick=()=>act(()=>revise(feedback.value,[o.object_id]));
 item.append(edit,form);items.append(item);
 }group.append(items);list.append(group);
 }
 }};
}
