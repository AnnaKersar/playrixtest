const $=id=>document.getElementById(id),money=n=>'$'+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(n/1e9);
let serial=0;
async function refresh(){const current=++serial;
 try{const r=await fetch('/api/guest/budget',{cache:'no-store'});if(!r.ok)throw Error();const b=await r.json();if(current!==serial)return;$('guest-budget-summary').textContent='Доступный бюджет — '+(Number.isSafeInteger(b.remaining_nanodollars)&&b.remaining_nanodollars>=0?money(b.remaining_nanodollars):'недоступен');}
 catch{if(current===serial)$('guest-budget-summary').textContent='Доступный бюджет — недоступен';}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});void refresh();
