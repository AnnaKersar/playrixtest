import {collectionSettings} from './generator-model.mjs?v=quality-v1';
const $=id=>document.getElementById(id),money=n=>'$'+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(n/1e9);
let serial=0;
async function refresh(){const current=++serial;let count=10;try{const saved=JSON.parse(localStorage.getItem('card-studio-generator/v2')||'{}');count=collectionSettings(saved.advanced||{}).total;}catch{}
 try{const r=await fetch('/api/guest/budget?cards='+count,{cache:'no-store'});if(!r.ok)throw Error();const b=await r.json();if(current!==serial)return;$('guest-budget-summary').textContent='Доступный бюджет — '+(Number.isSafeInteger(b.remaining_nanodollars)&&b.remaining_nanodollars>=0?money(b.remaining_nanodollars):'недоступен');$('guest-budget-quote').textContent='Примерная стоимость генерации — '+(Number.isSafeInteger(b.quote_nanodollars)&&b.quote_nanodollars>=0?money(b.quote_nanodollars):'недоступна');}
 catch{if(current===serial){$('guest-budget-summary').textContent='Доступный бюджет — недоступен';$('guest-budget-quote').textContent='Примерная стоимость генерации — недоступна';}}}
document.querySelector('#launch-form').addEventListener('input',()=>void refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});void refresh();
