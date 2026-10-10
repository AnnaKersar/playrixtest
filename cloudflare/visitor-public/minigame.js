const $=id=>document.getElementById(id);
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
let deck=[],references=[],round=0,score=0,answered=false,attempt=null,answers=[];
let participant=localStorage.getItem('minigame-participant');if(!participant){participant=crypto.randomUUID();localStorage.setItem('minigame-participant',participant);}
async function send(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Не удалось сохранить ответ');return d;}
function table(headers,rows){const t=document.createElement('table'),head=t.createTHead().insertRow();for(const h of headers){const c=document.createElement('th');c.textContent=h;head.append(c);}const body=t.createTBody();for(const row of rows){const tr=body.insertRow();for(const v of row){const td=tr.insertCell();if(v instanceof Node)td.append(v);else td.textContent=String(v);}}return t;}
function picture(src){const i=document.createElement('img');i.src=src;i.alt='Карточка';i.loading='lazy';i.className='stat-thumb';return i;}
async function showStats(options){const data=await read('/api/game/stats'),counts=new Map(data.votes.map(v=>[v.card,v]));const panel=$('vote-stats');panel.replaceChildren(table(['Карточка','Выбрали генерацией','Участников увидели','Доля'],options.map((o,i)=>{const c=counts.get(o.id)||{votes:0,shown:0};return ['№ '+(i+1),c.votes,c.shown,c.shown?Math.round(c.votes/c.shown*100)+'%':'—'];})));if(round===29){const result=$('results');result.hidden=false;result.replaceChildren();const title=document.createElement('h2');title.textContent='Итоги: '+score+' из 30';result.append(title,table(['Раунд','Наша карточка','Твой ответ','Выбрали генерацией','Увидели','Доля'],answers.map((a,i)=>{const c=counts.get(a.generated)||{votes:0,shown:0};return [i+1,picture(a.image),a.correct?'Угадано':'Референс',c.votes,c.shown,c.shown?Math.round(c.votes/c.shown*100)+'%':'—'];})));const distribution=document.createElement('h2');distribution.textContent='Какие карточки считают генеративными';result.append(distribution,table(['Карточка','Источник','Выбрали генерацией','Увидели','Доля'],[...data.votes].sort((a,b)=>b.votes-a.votes).map(c=>{const ours=c.card.startsWith('run_');return [picture(ours?'/api/game/image?job='+encodeURIComponent(c.card):'/api/references/image?id='+encodeURIComponent(c.card)),ours?'Наша':'Референс',c.votes,c.shown,Math.round(c.votes/c.shown*100)+'%'];})));const history=document.createElement('h2');history.textContent='Завершённые игры';result.append(history,table(['Завершена','Правильных ответов'],data.attempts.map(a=>[new Date(a.finished_at).toLocaleString('ru-RU'),a.score+' / 30'])));result.scrollIntoView({behavior:'smooth',block:'start'});}}

async function read(url){const r=await fetch(url);const d=await r.json();if(!r.ok)throw Error(d.error||'Карточки пока недоступны');return d;}
function play(){
 answered=false;$('next').hidden=true;$('restart').hidden=true;$('vote-stats').replaceChildren();
 $('round').textContent='Карточка '+(round+1)+' / 30';$('score').textContent='Угадано: '+score;
 $('status').textContent='Выбери нашу генерацию.';
 const card=deck[round],pool=references.filter(r=>r.category===card.category);
 if(pool.length<5)throw Error('Недостаточно референсов для этой категории');
 const options=shuffle([{id:card.id,image:card.image,ours:true},...shuffle(pool).slice(0,5).map(r=>({id:r.id,image:'/api/references/image?id='+encodeURIComponent(r.id),ours:false}))]);
 let loaded=0;$('game-grid').replaceChildren(...options.map((o,i)=>{
 const b=document.createElement('button');b.className='guess';b.disabled=true;b.setAttribute('aria-label','Выбрать карточку '+(i+1));
 const img=document.createElement('img');img.alt='Карточка '+(i+1);img.src=o.image;
 img.onload=()=>{loaded++;if(loaded===6)for(const n of $('game-grid').children)n.disabled=false;};
 img.onerror=()=>{$('status').textContent='Изображение не загрузилось. Обнови страницу, чтобы продолжить.';};
 const label=document.createElement('span');label.textContent=String(i+1);b.append(img,label);
 b.onclick=async()=>{if(answered)return;answered=true;if(o.ours)score++;$('score').textContent='Угадано: '+score;
 for(const [k,n]of [...$('game-grid').children].entries()){n.disabled=true;if(options[k].ours){n.classList.add('correct');n.lastChild.textContent='Наша генерация';}else if(n===b)n.classList.add('wrong');}
 $('status').textContent=o.ours?'Верно! Это наша карточка.':'Это референс. Наша карточка выделена зелёным.';
 answers.push({generated:card.id,image:card.image,correct:o.ours});
 const save=async()=>{await send('/api/game/answer',{attempt,round:round+1,options:options.map(x=>x.id),selected:o.id});$('save-retry').hidden=true;if(round===29){$('status').textContent+=' Результат: '+score+' из 30.';$('restart').hidden=false;}else $('next').hidden=false;try{await showStats(options);}catch{$('vote-stats').textContent='Ответ сохранён. Общая статистика временно недоступна.';}};
 try{await save();}catch{$('status').textContent+=' Ответ ещё не сохранён. Нажми «Сохранить ответ».';$('save-retry').hidden=false;$('save-retry').onclick=async()=>{try{await save();}catch{$('status').textContent='Не удалось сохранить. Попробуй ещё раз.';}};}};return b;}));
}
$('next').onclick=()=>{round++;play();};$('restart').onclick=async()=>{try{attempt=(await send('/api/game/start',{participant,preview:new URLSearchParams(location.search).get('preview')==='1'})).id;deck=shuffle(deck);round=score=0;answers=[];$('results').hidden=true;play();}catch(e){$('status').textContent=e.message;}};
try{const [batch,refs]=await Promise.all([read('/api/game'),read('/api/references')]);deck=shuffle(batch.cards);references=refs.references;attempt=(await send('/api/game/start',{participant,preview:new URLSearchParams(location.search).get('preview')==='1'})).id;if(deck.length!==30)throw Error('В игре должно быть ровно 30 карточек');play();}catch(e){$('status').textContent=e.message;}
