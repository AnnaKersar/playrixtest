export const PRODUCTION_TYPES=['C1','C2','C3','C4'];
export function cardTypeMix(count){
 const weights=[.3,.1,.2,.4],counts=weights.map(w=>Math.floor(w*count));
 const fractions=weights.map((w,i)=>({i,remainder:w*count-counts[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
 for(let left=count-counts.reduce((a,b)=>a+b,0),i=0;left>0;left--,i++)counts[fractions[i%4].i]++;
 if(count>=4)for(let i=0;i<4;i++)if(!counts[i]){const donor=counts.indexOf(Math.max(...counts));counts[donor]--;counts[i]++;}
 return Object.fromEntries(PRODUCTION_TYPES.map((key,i)=>[key,counts[i]]));
}
export function productionQuotaIssues(plan,settings){
 if(!settings)return [];
 const categories=settings.categories;
 if(!Array.isArray(categories)||!categories.length)throw Error('Некорректные настройки категорий.');
 const collections=plan.collections||[];
 if(collections.length!==categories.length)throw Error('План должен содержать '+categories.length+' тематических категорий.');
 return categories.flatMap((category,i)=>{
  const objects=collections[i].objects||[],expected=category.production_type_mix||cardTypeMix(category.card_count);
  const actual=Object.fromEntries(PRODUCTION_TYPES.map(type=>[type,objects.filter(o=>o.production_category===type).length]));
  if(objects.length===category.card_count&&PRODUCTION_TYPES.every(type=>actual[type]===expected[type]))return [];
  return [{index:i+1,name:collections[i].name,expected,actual,card_count:category.card_count,actual_count:objects.length}];
 });
}
export function productionQuotaMessage(issues){
 const counts=mix=>PRODUCTION_TYPES.map(type=>type+'='+mix[type]).join(', ');
 return issues.map(issue=>'План не соблюдает распределение C1–C4 в категории '+issue.index+' («'+issue.name+'»). Нужно: '+counts(issue.expected)+'; в плане: '+counts(issue.actual)+'. Карточек: '+issue.actual_count+' из '+issue.card_count+'.').join(' ')+' Генерация карточек не отправлена.';
}
export function validateProductionQuotas(plan,settings){
 const issues=productionQuotaIssues(plan,settings);
 if(issues.length)throw Error(productionQuotaMessage(issues));
}
export function quotaRepairInstruction(issues){
 return 'Исправь распределение типов карточек в текстовом плане. '+productionQuotaMessage(issues)+' Сохрани названия категорий, предметы, их object_id и порядок, где возможно. Меняй только необходимые композиции: C1 — изолированный предмет, C2 — предмет на простой плоскости, C3 — предмет и содержательная поверхность (asset_stage=object_with_surface), C4 — полноценная незаселённая сцена (asset_stage=whole_card). Переработай описание и композицию под требуемый тип; простая смена метки недопустима. Сохрани 2–3 конкретные проверки конструкции для каждого предмета. Верни полный план и пересчитай типы в каждой категории перед ответом.';
}
