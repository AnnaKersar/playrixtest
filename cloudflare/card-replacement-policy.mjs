export function replacementTarget(sourceObjects,plan,objectId,selectedIds){
 const target=plan.collections.flatMap(c=>c.objects.map(o=>({...o,thematic_category:c.name}))).find(o=>o.object_id===objectId);
 if(!target||!selectedIds.includes(objectId))throw Object.assign(Error('Предмет не отмечен для замены в этом плане.'),{status:409});
 for(const source of sourceObjects){const next=plan.collections.flatMap(c=>c.objects).find(o=>o.object_id===source.object_id);if(!next)throw Object.assign(Error('План изменил ID карточек.'),{status:409});if(next.production_category!==source.category)throw Object.assign(Error('При замене сохраните исходные типы C1–C4.'),{status:409});if(!selectedIds.includes(source.object_id)&&source.subject_semantic_key&&next.subject_semantic_key!==source.subject_semantic_key)throw Object.assign(Error('План изменил невыбранный предмет. Отметьте его для замены или восстановите исходный.'),{status:409});}
 return target;
}
export function automaticEditNote(note){
 if(note!==undefined&&(typeof note!=='string'||note.length>2000))throw Object.assign(Error('Комментарий: до 2000 символов.'),{status:400});
 return note?.trim()||'Create a fresh, improved illustrated version of this same subject. Keep its identity, category and requested contents; use all approved current composition, soft-light, color-separation and Art Direction rules. Do not add unrelated objects.';
}
