export const TARGETS=[10,30,100,300,1000,10000];
export const PRODUCER_RATE=140000/2080;
export const FIXED=140+40*PRODUCER_RATE;
export const artistRate=salary=>salary*1.1206/2080;
export function scenario(n,{yieldPercent,cost,qaMinutes,seconds,planner,infra,concurrency=1}){
 const values=[n,yieldPercent,qaMinutes,seconds,concurrency];
 if(values.some(v=>!Number.isFinite(v))||n<=0||yieldPercent<=0||yieldPercent>100||qaMinutes<0||seconds<0||concurrency<1)return null;
 const attempts=n/(yieldPercent/100),laborHours=attempts*qaMinutes/60,serviceHours=attempts*seconds/3600;
 const known=[cost,planner,infra].every(v=>Number.isFinite(v)&&v>=0);
 const variable=known?attempts*cost+planner+infra+laborHours*PRODUCER_RATE:null;
 return {attempts,laborHours,serviceHours,capacityHours:serviceHours/concurrency,fixedPerCard:FIXED/n,variable,perCard:variable===null?null:variable/n,total:variable===null?null:FIXED+variable};
}
if(typeof document!=='undefined'){
 const el=id=>document.getElementById(id),num=id=>el(id).value.trim()===''?null:Number(el(id).value);
 const fmt=(v,d=2)=>v===null?'не задано':v.toLocaleString('ru-RU',{maximumFractionDigits:d,minimumFractionDigits:d});
 const money=v=>v===null?'не задано':'$'+fmt(v);
 function table(id,headers,rows){const t=document.createElement('table'),head=t.createTHead().insertRow();for(const text of headers){const th=document.createElement('th');th.scope='col';th.textContent=text;head.append(th);}const body=t.createTBody();for(const row of rows){const tr=body.insertRow();row.forEach((text,i)=>{const td=document.createElement(i?'td':'th');if(!i)td.scope='row';td.textContent=text;tr.append(td);});}el(id).replaceChildren(t);}
 function render(){
  const input={yieldPercent:num('yield'),cost:num('attempt-cost'),qaMinutes:num('qa-minutes'),seconds:num('provider-seconds'),planner:num('planner-cost'),infra:num('infra-cost'),concurrency:num('concurrency')};
  const rows=TARGETS.map(n=>[n,scenario(n,input)]);
  if(rows.some(([,s])=>!s)){el('scenario-status').textContent='Укажите долю приёмки от 1 до 100%, неотрицательные время/QA и параллелизм от 1.';el('production-table').replaceChildren();return;}
  el('scenario-status').textContent=rows[0][1].variable===null?'Стоимость не рассчитана: задайте API, planner и инфраструктуру. Пустое поле не означает ноль.':'Плановый сценарий для НОВЫХ принятых карточек. Предположения выше редактируются; это не замер текущей партии.';
  table('production-table',['Новых принятых N','Попыток, ожидание','Новый труд QA, ч','Сервис последовательно / при параллелизме, ч','Новые расходы V','V / карточка','F / карточка','R&D + новые расходы'],rows.map(([n,s])=>[fmt(n,0),fmt(s.attempts,1),fmt(s.laborHours,1),fmt(s.serviceHours,1)+' / '+fmt(s.capacityHours,1),money(s.variable),money(s.perCard),money(s.fixedPerCard),money(s.total)]));
  const rate=artistRate(num('artist-salary'));
  el('artist-rate').textContent='Salary-only ставка: '+money(rate)+'/ч (точно '+fmt(rate,6)+'). Для продюсера: '+money(PRODUCER_RATE)+'/ч. Работодательские начисления не включены.';
  table('manual-table',['Принятых N','2 ч/карту: часы / зарплата','8 ч/карту: часы / зарплата','16 ч/карту: часы / зарплата'],TARGETS.map(n=>[fmt(n,0),...[2,8,16].map(h=>fmt(n*h,0)+' ч / '+money(n*h*rate))]));
  const amounts=[['Прототип: всё R&D, 30 демо-карт',FIXED],...[2,8,16].map(h=>['Вручную: 30 карт × '+h+' ч (сценарий)',30*h*rate])];
  el('economics-chart').replaceChildren(...amounts.map(([label,value])=>{const p=document.createElement('p'),meter=document.createElement('meter');p.textContent=label+' — '+money(value);meter.min=0;meter.max=Math.max(...amounts.map(x=>x[1]));meter.value=value;meter.setAttribute('aria-label',label);meter.textContent=money(value);p.append(meter);return p;}));
 }
 document.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',render));render();
}
