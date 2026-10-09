export const plannerStopped=new Set(['failed','unknown','rejected','invalid','blocked','cost_bound_exceeded','needs_review']);
export function plannerProgress(info,elapsed){
 const stage=info.stage||info.status,seconds=Math.max(0,Math.floor(elapsed/1000)),clock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
 const label=stage==='queued'?'1/3 · Планировщик: ожидаем очередь':stage==='received'?'1/3 · Ответ получен: проверяем план':stage==='claimed'?'1/3 · Планировщик создаёт 10 объектов':'1/3 · Проверяем состояние плана';
 return label+' · '+clock+(seconds>=60&&stage==='queued'?' · Обработка ещё не началась; проверь очередь IMAGE_JOBS':seconds>=180&&stage==='claimed'?' · Ответ задерживается; повторный платный запрос не отправляется':'');
}
export function imageProgress(jobs,total=10){const count=status=>jobs.filter(j=>j.status===status).length,done=count('complete'),working=count('running')+count('processing')+count('claimed'),stopped=jobs.filter(j=>plannerStopped.has(j.status)).length;return `2/3 · Карточки: ${done}/${total} готовы · ${working} в работе · ${count('queued')} в очереди`+(stopped?` · ${stopped} требуют проверки`:'');}
