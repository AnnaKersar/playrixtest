import {collectionSettings} from './generator-model.mjs?v=quality-v1';
const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'USD',maximumFractionDigits:3}).format(n/1e9);
let serial=0;
async function refresh(){const current=++serial;let count=10;try{const saved=JSON.parse(localStorage.getItem('card-studio-generator/v2')||'{}');count=collectionSettings(saved.advanced||{}).total;}catch{}
 try{const r=await fetch('/api/guest/budget?cards='+count,{cache:'no-store'});if(!r.ok)throw Error();const b=await r.json();if(current!==serial)return;$('guest-budget-summary').textContent='Общий остаток: '+money(b.remaining_nanodollars)+' из '+money(b.ceiling_nanodollars)+'. Учтено и зарезервировано: '+money(b.committed_nanodollars)+'.';$('guest-budget-quote').textContent='Оценка для '+b.card_count+' карточек: пока недоступна. Не подтверждена верхняя стоимость полного запроса и подготовки плана. Платный гостевой запуск выключен.';}
 catch{if(current===serial){$('guest-budget-summary').textContent='Остаток бюджета сейчас неизвестен.';$('guest-budget-quote').textContent='Платный гостевой запуск недоступен до проверки бюджета и стоимости.';}}}
document.querySelector('#launch-form').addEventListener('input',()=>void refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});void refresh();
