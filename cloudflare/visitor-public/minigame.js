const $=id=>document.getElementById(id);
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
let deck=[],references=[],round=0,score=0,answered=false;
async function read(url){const r=await fetch(url);const d=await r.json();if(!r.ok)throw Error(d.error||'Карточки пока недоступны');return d;}
function play(){
 answered=false;$('next').hidden=true;$('restart').hidden=true;
 $('round').textContent='Карточка '+(round+1)+' / 30';$('score').textContent='Угадано: '+score;
 $('status').textContent='Выбери нашу генерацию.';
 const card=deck[round],pool=references.filter(r=>r.category===card.category);
 if(pool.length<5)throw Error('Недостаточно референсов для этой категории');
 const options=shuffle([{image:card.image,ours:true},...shuffle(pool).slice(0,5).map(r=>({image:'/api/references/image?id='+encodeURIComponent(r.id),ours:false}))]);
 let loaded=0;$('game-grid').replaceChildren(...options.map((o,i)=>{
 const b=document.createElement('button');b.className='guess';b.disabled=true;b.setAttribute('aria-label','Выбрать карточку '+(i+1));
 const img=document.createElement('img');img.alt='Карточка '+(i+1);img.src=o.image;
 img.onload=()=>{loaded++;if(loaded===6)for(const n of $('game-grid').children)n.disabled=false;};
 img.onerror=()=>{$('status').textContent='Изображение не загрузилось. Обнови страницу, чтобы продолжить.';};
 const label=document.createElement('span');label.textContent=String(i+1);b.append(img,label);
 b.onclick=()=>{if(answered)return;answered=true;if(o.ours)score++;$('score').textContent='Угадано: '+score;
 for(const [k,n]of [...$('game-grid').children].entries()){n.disabled=true;if(options[k].ours){n.classList.add('correct');n.lastChild.textContent='Наша генерация';}else if(n===b)n.classList.add('wrong');}
 $('status').textContent=o.ours?'Верно! Это наша карточка.':'Это референс. Наша карточка выделена зелёным.';
 if(round===29){$('status').textContent+=' Результат: '+score+' из 30.';$('restart').hidden=false;}else $('next').hidden=false;};return b;}));
}
$('next').onclick=()=>{round++;play();};$('restart').onclick=()=>{deck=shuffle(deck);round=score=0;play();};
try{const [batch,refs]=await Promise.all([read('/api/game'),read('/api/references')]);deck=shuffle(batch.cards);references=refs.references;if(deck.length!==30)throw Error('В игре должно быть ровно 30 карточек');play();}catch(e){$('status').textContent=e.message;}
