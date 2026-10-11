export const TARGETS=[10,30,100,300,1000,10000];
export const CASH=140;
export const PRODUCER_LABOR=40*(140000/2080);
export const FIXED=CASH+PRODUCER_LABOR;
export const artistRate=salary=>salary*1.1206/2080;
// Round only at presentation; compensate binary drift at exact half-cent values.
export const roundCents=value=>Math.sign(value)*Math.round((Math.abs(value)+Number.EPSILON*Math.abs(value))*100)/100;
export const GRADES=[{label:'Junior',salary:17535},{label:'Middle',salary:30000},{label:'Senior',salary:43500}];
export const DEFAULTS={cost:.1,yieldPercent:80,briefMinutes:2,designerRate:16.1625,artistHours:[6,3,2]};
export function scenario(n,input=DEFAULTS){
 const {cost,yieldPercent,briefMinutes,designerRate,artistHours}=input;
 if(!Array.isArray(artistHours)||artistHours.length!==3||!artistHours.every(h=>Number.isFinite(h)&&h>0)||![n,cost,yieldPercent,briefMinutes,designerRate].every(Number.isFinite)||n<=0||cost<0||yieldPercent<=0||yieldPercent>100||briefMinutes<0||designerRate<0)return null;
 const attempts=n/(yieldPercent/100),briefHours=Math.ceil(n/10)*briefMinutes/60;
 const variable=attempts*cost+briefHours*designerRate,total=FIXED+variable;
 return {attempts,briefHours,variable,total,perCard:total/n,grades:GRADES.map((g,i)=>({...g,hoursPerCard:artistHours[i],manualHours:n*artistHours[i],cost:n*artistHours[i]*artistRate(g.salary),difference:n*artistHours[i]*artistRate(g.salary)-total}))};
}
export function breakEven(salary,input=DEFAULTS,fixed=FIXED){
 const s=scenario(10,input);if(!s)return null;
 const grade=s.grades.find(g=>g.salary===salary);if(!grade)return null;
 const margin=grade.cost-s.variable;
 if(margin<=0)return {cards:null,collections:null};
 const collections=Math.ceil(fixed/margin)*10;
 for(let n=Math.max(1,collections-9);n<=collections;n++){const cost=scenario(n,input);if(n*grade.hoursPerCard*artistRate(salary)>=fixed+cost.variable)return {cards:n,collections};}
 return {cards:collections,collections};
}
if(typeof document!=='undefined'){
 const el=id=>document.getElementById(id),num=id=>el(id).value.trim()===''?null:Number(el(id).value);
 const fmt=(v,d=2)=>v.toLocaleString('ru-RU',{maximumFractionDigits:d,minimumFractionDigits:d});
 const money=v=>'$'+fmt(roundCents(v)),signed=v=>(v>=0?'+':'−')+money(Math.abs(v));
 function render(){
  const input={cost:num('attempt-cost'),yieldPercent:num('yield'),briefMinutes:num('brief-minutes'),designerRate:num('designer-rate'),artistHours:['junior-hours','middle-hours','senior-hours'].map(num)};
  const sample=scenario(10,input);
  if(!sample){el('scenario-status').textContent='Заполните поля: приёмка 1–100%, время каждого художника больше нуля, остальные значения неотрицательные.';el('comparison-table').replaceChildren();el('break-even').replaceChildren();el('collection-cost').textContent='—';el('running-card-cost').textContent='—';return;}
  el('scenario-status').textContent='Допущения применены. После прототипа труд продюсера и отдельный QA: 0 часов.';
  el('collection-cost').textContent=money(sample.variable);
  el('running-card-cost').textContent=money(sample.variable/10);
  el('scenario-summary').textContent='Сценарий: '+money(input.cost)+' за API-попытку, '+fmt(input.yieldPercent,0)+'% приёмки и '+fmt(input.briefMinutes,1)+' мин на бриф коллекции. Junior / Middle / Senior: '+input.artistHours.map(h=>fmt(h,1)).join(' / ')+' ч на карту при готовом арт-стиле и референсах. Это допущения, не нормы отрасли; равное принятое качество не подтверждено.';
  const headers=['Новых карт','AI: новые расходы','AI: с прототипом','Художник Junior','Художник Middle','Художник Senior'];
  const table=document.createElement('table'),head=table.createTHead().insertRow();
  const gradeBasis=g=>'€'+fmt(g.salary,0)+' gross/год · $'+fmt(artistRate(g.salary),6)+'/ч · '+fmt(g.hoursPerCard,1)+' ч/карта';
  headers.forEach((h,i)=>{const th=document.createElement('th');th.scope='col';th.textContent=h;if(i>=3){const g=sample.grades[i-3];for(const text of ['€'+fmt(g.salary,0)+' gross/год','$'+fmt(artistRate(g.salary),6)+'/ч',fmt(g.hoursPerCard,1)+' ч/карта — допущение']){const small=document.createElement('small');small.textContent=text;th.append(small);}}head.append(th);});
  const body=table.createTBody();
  for(const n of TARGETS){
   const s=scenario(n,input),tr=body.insertRow(),th=document.createElement('th');th.scope='row';th.textContent=fmt(n,0);tr.append(th);
   const cells=[{value:money(s.variable),time:'GD: '+fmt(s.briefHours,2)+' ч'},{value:money(s.total),sub:money(s.perCard)+' / карта'},...s.grades.map(g=>({value:money(g.cost),sub:signed(g.difference)+' для AI',difference:g.difference,time:fmt(g.manualHours,0)+' ч на объём',basis:gradeBasis(g)}))];
   cells.forEach((c,i)=>{const td=tr.insertCell();td.dataset.label=headers[i+1]+(c.basis?' · '+c.basis:'');const strong=document.createElement('strong');strong.textContent=c.value;td.append(strong);if(c.sub){const small=document.createElement('small');small.textContent=c.sub;if(c.difference!==undefined)small.className=c.difference>=0?'positive':'negative';td.append(small);}if(c.time){const time=document.createElement('small');time.textContent=c.time;td.append(time);}});
  }
  el('comparison-table').replaceChildren(table);
  el('break-even').replaceChildren(...GRADES.map(g=>{const b=breakEven(g.salary,input),cash=breakEven(g.salary,input,CASH),p=document.createElement('p'),strong=document.createElement('strong');p.append('Против '+g.label);strong.textContent=b.collections===null?'Не окупается':fmt(b.collections,0)+' карточек';p.append(strong);const small=document.createElement('small');small.textContent=b.cards===null?'Новые расходы не ниже ручных.':'С оценкой труда; точный порог — '+fmt(b.cards,0)+'.';p.append(small);const cashLine=document.createElement('small');cashLine.className='economics-cash-break-even';cashLine.textContent=cash.cards===null?'Только $140 сервисов: не окупается.':'Только $140 сервисов: '+fmt(cash.collections,0)+' карт (точно '+fmt(cash.cards,0)+').';p.append(cashLine);return p;}));
 }
 document.querySelectorAll('#attempt-cost,#yield,#brief-minutes,#designer-rate,#junior-hours,#middle-hours,#senior-hours').forEach(input=>input.addEventListener('input',render));render();
}
