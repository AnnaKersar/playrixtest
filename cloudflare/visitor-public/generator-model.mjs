import {defaults,plannerPayload,imagePayload} from './studio/flow-model.mjs';
export const PAGE_SIZE=10;

export function cardTypeMix(count){
 const keys=['C1','C2','C3','C4'],weights=[.4,.3,.2,.1],counts=weights.map(w=>Math.floor(w*count));
 const fractions=weights.map((w,i)=>({i,remainder:w*count-counts[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
 for(let left=count-counts.reduce((a,b)=>a+b,0),i=0;left>0;left--,i++)counts[fractions[i%4].i]++;
 if(count>=4)for(let i=0;i<4;i++)if(!counts[i]){const donor=counts.indexOf(Math.max(...counts));counts[donor]--;counts[i]++;}
 return Object.fromEntries(keys.map((key,i)=>[key,counts[i]]));
}
export function collectionSettings(advanced={}){
 const count=advanced.category_count===''||advanced.category_count==null?1:Number(advanced.category_count);
 if(!Number.isInteger(count)||count<1||count>20)throw Error('Количество категорий: от 1 до 20.');
 const categories=Array.from({length:count},(_,i)=>{
  const row=advanced.categories?.[i]||{},cards=row.card_count===''||row.card_count==null?10:Number(row.card_count);
  if(!Number.isInteger(cards)||cards<1||cards>20)throw Error('Карточек в категории '+(i+1)+': от 1 до 20.');
  return {name:String(row.name||'').trim(),theme:String(row.theme||'').trim(),card_count:cards,production_type_mix:cardTypeMix(cards)};
 });
 const total=categories.reduce((n,c)=>n+c.card_count,0);
 if(total>20)throw Error('За один запуск доступно до 20 карточек. Уменьшите число категорий или карточек в них.');
 return {category_count:count,category_theme:String(advanced.category_theme||'').trim(),categories,total};
}
export function collectionBrief(name,wishes,advanced={}){
 const settings=collectionSettings(advanced);
 return {...defaults(),theme:name.trim(),collection_name:name.trim(),producer_comment:wishes.trim(),card_count:settings.total,
 collection_settings:settings,
 constraints:'COLLECTION HIERARCHY: The outer collection is the user collection_name/theme. Infer the meaningful category dimension from this outer theme when category_theme is blank: for example collection Films -> category dimension film genres -> each category has a specific genre name such as Comedy or Adventure -> ten coherent cards belonging to that genre. Do not name every category Films or Film genres. A category is a thematic subcollection, NOT production composition types C1-C4. Generate exactly the requested number of thematic categories as plan.collections, in request order. Each collection entry is one thematic category and its name must describe that category. Honor any provided category name, theme and exact card count. For blank names/themes infer coherent, distinct category names and themes from the category dimension and outer collection. All cards must belong to their category. Do not replace thematic categories with a random mixed inventory. Each thematic category must follow its production_type_mix exactly; design suitable isolated subjects, subjects on a simple plane, developed meaningful surfaces and whole scenes instead of merely relabeling identical objects. These are whole-card image outputs; defer the designed background to the whole-card image prompt, not to a procedural assembly.',
 preset_collections:JSON.stringify({outer_collection:name.trim(),category_dimension:settings.category_theme||'Infer from the outer collection',category_count:settings.category_count,categories:settings.categories.map((c,i)=>({category_index:i+1,name:c.name||'Infer a specific category name',theme:c.theme||'Infer from category dimension',card_count:c.card_count,production_type_mix:c.production_type_mix}))})};
}
export function plannedCollection(draft,plan){
 const settings=draft.collection_settings||collectionSettings(),collections=plan.collections||[];
 if(collections.length!==settings.category_count)throw Error('План должен содержать '+settings.category_count+' тематических категорий.');
 collections.forEach((c,i)=>{
  if(c.objects?.length!==settings.categories[i].card_count)throw Error('В категории '+(i+1)+' должно быть '+settings.categories[i].card_count+' карточек.');
  const actual=Object.fromEntries(['C1','C2','C3','C4'].map(t=>[t,c.objects.filter(o=>o.production_category===t).length]));if(Object.keys(actual).some(t=>actual[t]!==settings.categories[i].production_type_mix[t]))throw Error('План не соблюдает распределение C1–C4 в категории '+(i+1)+'. Генерация карточек не отправлена.');
  if(!c.name?.trim())throw Error('У категории нет названия.');
  if(settings.categories[i].name&&c.name.trim()!==settings.categories[i].name)throw Error('План изменил заданное название категории '+(i+1)+'.');
 });
 const objects=collections.flatMap(c=>c.objects);
 if(objects.length!==draft.card_count)throw Error('Количество карточек не соответствует настройкам коллекции.');
 if(objects.some(o=>o.production_category==='C3'&&o.asset_stage!=='object_with_surface'))throw Error('Для C3 нужна единая сборка предмета и поверхности.');
 const d={...draft,category_names:collections.map(c=>c.name),generation_mode:'whole_card',objects:collections.flatMap((c,i)=>c.objects.map(o=>({object_id:o.object_id,thematic_category:c.name,name:c.name+' · '+o.main_identity,category:o.production_category,generation_mode:'whole_card',brief:[o.object_brief,'Thematic category: '+c.name+'; category theme: '+(settings.categories[i].theme||settings.category_theme||c.coherence_rationale),...[['Contents',o.contents],['Surface decoration',o.decoration]].filter(([,a])=>a?.length).map(([label,a])=>label+': '+a.map(x=>x.description).join('; '))].join('\n')}))),approved:true};
 imagePayload(d);return d;
}
export function categoryFor(job,alpha){if(['C1','C2','C3','C4'].includes(job.category))return {category:job.category,evidence:'Из плана коллекции'};if(!alpha)return {category:null,evidence:'Тип не определён'};const {data,width,height}=alpha;let opaque=0,left=0,right=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const a=data[(y*width+x)*4+3];if(a>245)opaque++;if(a>30&&y>height*.65){if(x<width*.02)left++;if(x>width*.98)right++;}}if(opaque/(width*height)>.98)return {category:'C4',evidence:'Предварительно: цельная сцена по геометрии изображения'};if(left>height*.1&&right>height*.1)return {category:null,evidence:'Поверхность требует проверки C2 / C3 во вкладке «Тест»'};return {category:'C1',evidence:'Предварительно: изолированный предмет по альфа-маске'};}
function shuffle(items,random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function sameCategoryReferences(refs,category,random=Math.random){return category?shuffle([...new Map(refs.filter(r=>r.category===category&&!r.categoryEvidence?.alternatives?.length).map(r=>[r.id,r])).values()],random).slice(0,5):[];}
export function blindComparison(refs,category,random=Math.random){const originals=sameCategoryReferences(refs,category,random);return originals.length?shuffle([...originals.map(reference=>({reference})),{generated:true}],random):[];}
export {plannerPayload,imagePayload};
