import assert from 'node:assert/strict';
import {planRevisionBatch} from '../cloudflare/visitor-public/plan-review-batch.mjs';
import {createPlanReview} from '../cloudflare/visitor-public/plan-review.mjs';
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.value='';this.textContent='';}
 focus(){}
 append(...children){this.children.push(...children);}
 setAttribute(k,v){this.attributes[k]=v;}
 replaceChildren(...children){this.children=children;}
 querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);}
}
globalThis.document={createElement:tag=>new Element(tag)};
const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const calls=[],pending={planId:'planner_fixture',planResult:{collections:[{name:'Кино',objects:[{object_id:'a',display_name:'Шлем',production_category:'C1'},{object_id:'b',display_name:'Рация',production_category:'C2'}]}]}};
const review=createPlanReview({storage,approve:()=>assert.fail('Do not approve staged changes'),revise:async(text,ids)=>calls.push({text,ids})});review.update(pending);
const buttons=review.panel.querySelectorAll('button'),first=buttons.find(b=>b.attributes['aria-label']==='Выбрать для замены: Шлем'),second=buttons.find(b=>b.attributes['aria-label']==='Выбрать для замены: Рация');
first.onclick();second.onclick();assert.equal(calls.length,0);assert.equal(first.attributes['aria-pressed'],'true');
const detail=buttons.find(b=>b.attributes['aria-label']==='Детали: Шлем');assert.equal(detail.hidden,false);detail.onclick();assert.equal(calls.length,0);
const field=review.panel.querySelectorAll('textarea').find(e=>e.id==='plan-item-feedback');field.value='Сделай защитный шлем';field.oninput();
assert.equal(buttons.find(b=>b.textContent==='Подтвердить и создать карточки').disabled,true);
const restored=createPlanReview({storage,approve:()=>{},revise:()=>{}});restored.update(pending);assert.equal(restored.panel.querySelectorAll('button').filter(b=>b.attributes['aria-pressed']==='true').length,2);
const send=buttons.find(b=>b.textContent.startsWith('Отправить изменения'));await send.onclick();assert.equal(calls.length,1);assert.deepEqual(calls[0].ids,['a','b']);assert(calls[0].text.includes('Сделай защитный шлем'));
const blank=planRevisionBatch('',new Map([['a',{name:'Шлем',feedback:''}],['b',{name:'Рация',feedback:''}]]));assert.equal(blank.instruction,'');assert.deepEqual(blank.rejectedObjectIds,['a','b']);
assert.throws(()=>planRevisionBatch('x'.repeat(4001),new Map()),/4000/);
console.log('PASS selecting multiple cards/details sends nothing; green selected state, reload persistence, one explicit batch send, blank optional comments; paid calls 0.');
const originalGrid=new Element('div'),pageCalls=[];
const pagination=createPlanReview({storage:{getItem:()=>null,setItem(){},removeItem(){}},approve(){},revise:async(text,ids)=>pageCalls.push(ids),grid:originalGrid});
const bigger={planId:'planner_pages',name:'Кино',planResult:{collections:[{name:'Боевик',objects:Array.from({length:12},(_,i)=>({object_id:'item-'+i,display_name:'Предмет '+i,production_category:'C1'}))}]}};
pagination.update(bigger);assert.equal(originalGrid.children.length,10);originalGrid.querySelectorAll('button').find(b=>b.attributes['aria-label']==='Выбрать для замены: Предмет 0').onclick();pagination.turnPage(1);assert.equal(originalGrid.children.length,2);originalGrid.querySelectorAll('button').find(b=>b.attributes['aria-label']==='Выбрать для замены: Предмет 10').onclick();pagination.turnPage(-1);assert.equal(originalGrid.querySelectorAll('button').find(b=>b.attributes['aria-label']==='Выбрать для замены: Предмет 0').attributes['aria-pressed'],'true');await pagination.panel.querySelectorAll('button').find(b=>b.textContent.startsWith('Отправить изменения')).onclick();assert.deepEqual(pageCalls,[['item-0','item-10']]);
assert.equal(pagination.active,true);assert.equal(pagination.panel.querySelectorAll('button').filter(b=>b.attributes['aria-pressed']).length,0,'Subject cards are in original grid, not the sidebar');
console.log('PASS plan uses supplied original grid and separate sidebar controls; page navigation available.');