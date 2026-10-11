export function planRevisionBatch(globalInstruction,selected){
 const entries=[...selected],ids=entries.map(([id])=>id);
 const comments=entries.filter(([,v])=>String(v.feedback||'').trim()).map(([id,v])=>'Предмет '+id+' ('+v.name+'): '+String(v.feedback).trim());
 const instruction=[String(globalInstruction||'').trim(),...comments].filter(Boolean).join('\n');
 if(!ids.length&&!instruction)throw Error('Отметьте предметы или опишите изменение плана.');
 if(instruction.length>4000)throw Error('Общий текст изменений длиннее 4000 символов. Сократите пожелания; выбранные предметы сохранены.');
 return {instruction,rejectedObjectIds:ids};
}
