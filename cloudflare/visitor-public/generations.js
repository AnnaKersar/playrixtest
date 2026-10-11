const $=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const labels={queued:'В очереди',running:'В работе',complete:'Завершено',failed:'Ошибка',needs_review:'Нужна проверка',blocked:'Заблокировано',cancelled:'Отменено',claimed:'Зарезервировано',received:'Ответ получен',unknown:'Неизвестно',closed_reserved_unknown:'Стоимость не подтверждена',cost_bound_exceeded:'Превышен резерв'};
let offset=0,busy=false;
function render(run){
 const section=node('section');section.className='generation-run';section.append(node('h2',run.kind==='plan'?'Подготовка коллекции':'Генерация карточек'));
 const meta=node('p');meta.className='history-meta';
 for(const label of [run.source==='admin'?'Владелец':'Гость',run.mode==='mock'?'Макет без оплаты':'API',labels[run.status]||labels.unknown,run.created_at?new Date(run.created_at).toLocaleString('ru-RU',{timeZone:'UTC'})+' UTC':'Время неизвестно'])meta.append(node('span',label));section.append(meta);
 if(run.cards.length){const details=node('details'),summary=node('summary',run.cards.length+' карточек · посмотреть результаты'),grid=node('div');grid.className='history-cards';details.append(summary,grid);details.open=true;
  for(const card of run.cards){const figure=node('figure');figure.className='history-card';if(card.image_url){const a=node('a'),img=node('img');a.href=card.image_url;a.target='_blank';a.rel='noopener';img.src=card.image_url;img.alt=card.label;img.loading='lazy';img.width=864;img.height=960;img.onerror=()=>{a.replaceWith(node('p','Изображение недоступно'));};a.append(img);figure.append(a);}else{const empty=node('div','Изображение пока отсутствует');empty.className='history-empty';figure.append(empty);}figure.append(node('figcaption',card.label+' · '+(labels[card.status]||labels.unknown)));grid.append(figure);}section.append(details);
 }else section.append(node('p',run.kind==='plan'?'Подготовка плана — отдельная попытка без изображения.':'В этом запуске нет записанных карточек.'));
 return section;
}
async function load(reset=false){if(busy)return;busy=true;$('refresh-history').disabled=true;$('more-history').disabled=true;if(reset)offset=0;
 try{const response=await fetch('/api/generations?offset='+offset,{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(reset)$('history-list').replaceChildren();for(const run of data.items)$('history-list').append(render(run));offset=data.next_offset;$('more-history').hidden=offset===null;$('history-status').textContent=$('history-list').children.length?'Показано запусков и планов: '+$('history-list').children.length+'. Новые записи появятся после обновления.':'Пока нет записанных запусков.';}
 catch{$('history-status').textContent='Не удалось загрузить историю. Попробуйте обновить ещё раз.';}finally{busy=false;$('refresh-history').disabled=false;$('more-history').disabled=false;}}
$('refresh-history').onclick=()=>load(true);$('more-history').onclick=()=>load();void load(true);
