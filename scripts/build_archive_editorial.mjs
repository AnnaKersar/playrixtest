import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='docs/archive',publicDir='cloudflare/visitor-public';
const readJSON=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const [caseStudy,frameworks,visuals,manifest,lora,technical,art]=await Promise.all([
  readJSON(dir+'/case-ui.ru.json'),readJSON(dir+'/frameworks.ru.json'),readJSON(dir+'/editorial-visuals.json'),
  readJSON(publicDir+'/archive-seed/history-v1/archive-manifest.json'),readJSON(publicDir+'/archive/latest-lora-test/test.json'),
  fs.readFile(dir+'/technical-audit.md','utf8'),fs.readFile(dir+'/art-pipeline.md','utf8')
]);
delete caseStudy.primary_today_source.message_id;
const byID=new Map(manifest.entries.map(e=>[e.id,e]));
const selection={
  'phase-02':[{record:'I01',file:'C1_A_seed1729.png',title:'SDXL · первый контроль'},{record:'I03',file:'C1_A_foreground_raw_seed1729.png',title:'FLUX · передний план'}],
  'phase-03':[{record:'I10',file:'Hat_Comparison_Same_Background.png',title:'GPT · шляпа на одинаковом фоне'}],
  'phase-05':[{record:'I15',file:'whole_collection.png',title:'Western V1 · цельные карточки'},{record:'I15',file:'modular_collection.png',title:'Western V1 · модульные карточки'}],
  'phase-06':[{record:'I30',file:'Mug_Reference_V9_V10_Details.png',title:'Кружка · накопительные правки'},{record:'I32',file:'Teacup_Original_and_Fresh.png',title:'Новая чашка · чистый старт'}],
  'phase-07':[{record:'I33',file:'contact_partial_or_complete.png',title:'20 предметов · контактный лист'}],
  'phase-08':[{record:'I12',file:'background_plus_pattern.png',title:'Исторический фон и узор · I12'},{record:'I12',file:'assembled_existing_hat.png',title:'Ранняя сборка с сохранённым предметом · I12'}]
};
const phases=caseStudy.phases.map(p=>({...p,summary:p.decision,records:p.archive_ids,media:selection[p.id]||[]}));
for(const phase of phases){
  for(const id of phase.records)if(!byID.has(id))throw Error('Unknown history ID '+id);
  for(const media of phase.media){
    const matches=byID.get(media.record)?.images.filter(a=>a.caption.split(' · ')[0]===media.file);
    if(matches?.length!==1)throw Error('Media mapping must be exact: '+JSON.stringify(media));
    media.sha256=matches[0].sha256;
  }
}
const names={'ref':'Playrix · исходный референс','gpt-latest':'GPT · модульная реконструкция','flux-lora':'FLUX · с LoRA','flux-base':'FLUX · без LoRA'};
phases[8].static_media=[];
for(const object of ['cup','basket'])for(const group of Object.keys(names)){
  const file=group+'-'+object+'.png',asset=lora.assets.find(a=>a.file===file);
  if(!asset)throw Error('Missing reviewed LoRA asset '+file);
  const bytes=await fs.readFile(publicDir+'/archive/latest-lora-test/'+file);
  if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('LoRA hash mismatch');
  phases[8].static_media.push({title:(object==='cup'?'Чашка':'Корзинка')+' · '+names[group],url:'/archive/latest-lora-test/'+file,sha256:asset.sha256,caption:'Сравнение 09.10.2026, итерация 1. GPT — сохранённая модульная реконструкция, FLUX — цельное изображение. Условия и содержимое брифов различались.'});
}
phases[8].limits='На сайте подтверждены восемь изображений первой итерации. Вторая попытка упомянута в авторском материале; её файлы здесь не подменяются первой серией. Стоимость и время этого сравнения не подтверждены.';
phases[9].limits='30/30 и восстановление трёх результатов — сведения из очищенного фрагмента рабочего чата. Это не независимая проверка runtime. Завершение проверки экспорта 30 PNG в последнем фрагменте не подтверждено.';
visuals.schemes[0].nodes[1]={title:'План и проверки',text:'Планировщик составляет набор. После автоматических проверок начинается создание карточек.'};
visuals.schemes[0].note='Схема различает автоматические переходы и явный Apply версии. Код подтверждает функции; приёмка художественного качества остаётся отдельным решением.';
visuals.schemes[1]={id:'production',title:'02 · Производственная схема',summary:'Этапы исследования и критерии выхода. Исторические часы работы не фиксировались; оценки будущих усилий приведены отдельно как предложения.',nodes:[
{title:'Контракт',text:'Бриф, формат, категории и рубрика. Неизвестные отмечены.'},{title:'Базовый процесс',text:'Воспроизводимые текстовый и графический запуски с сохранёнными запросами.'},{title:'Модель и стиль',text:'Практический выбор модели; калибровка на разных формах и материалах.'},{title:'Композиции и набор',text:'Проверка C1–C4, затем целой коллекции и разнообразия предметов.'},{title:'Надёжность',text:'Журнал, сохранение исходников, восстановление без повторной отправки.'},{title:'Сдача и следующий цикл',text:'Проверенная демоверсия, история решений и явно названные ограничения.'}],note:'Критерии выхода — план приёмки, не заявление о прохождении всех проверок. Бюджетный лимит не равен расходу.'};
visuals.schemes[3]={id:'architecture',title:'04 · Техническая архитектура',summary:'Поток новых whole-card запусков по аудиту кода. Хранилища D1 и R2 не образуют единую транзакцию.',nodes:[
{title:'Бриф → planner',text:'Stable request IDs, восстановление наблюдения, schema и смысловые проверки.'},
{title:'Compiler → frozen input',text:'Детерминированный prompt; frozen run в R2, jobs/outbox в D1.'},
{title:'IMAGE_JOBS → reference proofs',text:'SHA + R2 etag; максимум один непроверенный sheet за invocation.'},
{title:'Claim → provider → raw',text:'Atomic paid claim, одна отправка; raw PNG и receipt сохраняются до финализации.'},
{title:'FINAL_JOBS → final',text:'PNG/размер/alpha проверки; native 864 × 960 без resize. Final/manifest в R2, complete в D1.'},
{title:'Просмотр → edit → Apply',text:'Отдельная версия правки; явный выбор версии. Экспорт PNG bytes в ZIP.'}],note:'Исторический transparent foreground → procedural compositor — отдельная сохранённая ветка. Technical complete не означает художественную приёмку. Runtime parity и причина прежних зависаний этим аудитом не установлены.'};
visuals.schemes[4].nodes[2]={title:'Выбрать ветку',text:'Новые live-карточки всех C1–C4 создаются whole_card; modular сохранён для исторических foreground и пересборки.'};
const prompts=await Promise.all(['v1.1','v1.2'].map(async version=>({title:'Narrative collection designer '+version,filename:'narrative-collection-designer-'+version+'.md',text:await fs.readFile('prompts/narrative-collection-designer-'+version+'.md','utf8')})));
const editorial={caseStudy,phases,schemes:visuals.schemes.map((s,i)=>({...s,body_markdown:frameworks.sections[i].body_markdown})),decisions:visuals.decisions,technical,art,game:frameworks.sections[5],frameworks,prompts};
const path=publicDir+'/archive.js',source=await fs.readFile(path,'utf8');
const updated=source.replace(/const archiveEditorial = [\s\S]*?\nfunction recordLink/,()=> 'const archiveEditorial = '+JSON.stringify(editorial,null,2)+';\nfunction recordLink');
if(updated===source&&!source.includes(JSON.stringify(editorial,null,2)))throw Error('Editorial marker not found');
await fs.writeFile(path,updated);
console.log('Built 10 author-reviewed phases, 5 diagrams, exact media mapping and full source documents.');
