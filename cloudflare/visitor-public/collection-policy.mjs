export const COLLECTION_POLICY_VERSION='collection-quality/v1';
export const semanticFamilies=['instrument','audio_equipment','clothing_accessory','printed_material','recorded_media','furniture','container','tool','lighting','architecture','decoration','food','game','transport','other'];
export const collectionRules=`NON-NEGOTIABLE USER RULES FOR C1, C2, C3 AND C4:
No living creatures anywhere: no living plants or flowers, no people, musicians, performers, audience, animals, birds, fish, insects, pets, imaginary creatures, body parts, faces, silhouettes, portraits, photos, statues or motifs depicting them. Use inanimate objects and unoccupied environments only. Never invent occupants to make C4 a scene. Do not remove the scene category; make an empty, object-led environment.
C3 AND C4 ARE DISTINCT COMPOSITIONS: C3 is an inanimate subject on its developed meaningful surface against a BASIC colored gradient/pattern background, with no detailed surroundings, room, landscape or architectural location. C4 embeds the focal inanimate subject INTO A DETAILED RECOGNIZABLE ENVIRONMENT OR DETAILED SCENE-FILLING SURFACE with depth and meaningful spatial context, never a subject/small platform against the same basic backdrop. Plan C3 receiving surfaces without enclosing architecture; plan C4 environment layout or a continuous elaborated surface that forms the full scene. A football on a developed football pitch with coherent field markings qualifies as C4 without architecture or occupants. NO STANDARD BACKGROUND IN C4: no basic gradient backdrop, rings, generic decorative pattern, solid-color backing or white margin. The environment or detailed surface itself fills the background. Both remain whole opaque cards. No living beings in either.
A thematic category is NOT one product family. For ten cards use at least FOUR distinct semantic families, no family more than THREE times. Different musical instruments all count as instrument; changing scene, camera or accessories does not change the main subject family. Jazz may combine instruments, a microphone, a fedora, a vinyl record, sheet music, a club sign, audio equipment, empty club furniture; these are examples, not a fixed inventory. C4 scenes must have distinct inanimate focal identities too.
Choose the primary semantic_family from the schema and living_creatures='none'. Provide factual_checks: two or three concrete, object-specific construction requirements, not generic claims of correctness. For drums, bass-drum beater and pedal attach on the rear batter-head side facing the drummer position; the audience-facing resonant head has no pedal. Hi-hat pedal also faces the drummer position. Position the stool behind the bass drum, even if occluded; do not expose pedals on the front just to show details.
For perspective, specify one camera elevation and shared ground plane; horizontal coplanar lines use compatible vanishing directions, circular drumheads use ellipses consistent with their individual real tilts, stands contact one receiving plane, hardware attaches physically. No twisted stage or incompatible edge directions.
Focal object/group including handles and attachments, excluding receiving surface/background/shadow: at most 78% canvas width and 76% height in C1-C3; target 60-72% width or height on the limiting dimension, never enlarge a narrow object just to fill both. C4 focal cluster also stays within 78% width and 76% height; environment may fill canvas. The approved illustration style, material saturation and reference treatment remain unchanged.
`;
export function validateCategoryInventory(objects){
 if(!Array.isArray(objects)||!objects.length)throw Error('Empty thematic category');
 const counts=new Map();
 for(const o of objects){
  if(o.living_creatures!=='none')throw Error('Живые существа запрещены во всех C1–C4. Генерация не отправлена.');
  if(!semanticFamilies.includes(o.semantic_family))throw Error('Нужен тип предмета для проверки разнообразия.');
  if(!Array.isArray(o.factual_checks)||o.factual_checks.length<2||o.factual_checks.some(s=>typeof s!=='string'||s.trim().length<12))throw Error('Нужны конкретные проверки конструкции предмета.');
  counts.set(o.semantic_family,(counts.get(o.semantic_family)||0)+1);
 }
 const max=Math.max(1,Math.ceil(objects.length*.3)),min=Math.min(4,objects.length);
 if(counts.size<min||[...counts.values()].some(n=>n>max))throw Error('Категория однообразна: нужны разные типы предметов, не только разные модели одного типа. Генерация не отправлена.');
}
const palettes=['gold','purple','cyan','pink','green'];
const patterns=['concentric-rings','stripes','polka-dots','checkerboard','honeycomb','triangles','chevrons','waves','scallops','crosses','stars','grid','herringbone','spirals','plain-gradient'];
function randomFor(seed){let n=2166136261;for(const c of seed)n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function shuffled(a,random){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function categoryVisualSchedule(count,seed){
 const random=randomFor(String(seed)),limits=Object.fromEntries(palettes.map(p=>[p,2+Math.floor(random()*2)]));
 for(const hue of shuffled(palettes,random)){if(Object.values(limits).reduce((a,b)=>a+b,0)>=count)break;limits[hue]=3;}
 if(count>Object.values(limits).reduce((a,b)=>a+b,0)||count>patterns.length)throw Error('Не хватает цветов без повторов: уменьшите категорию до 10 карточек или разделите её.');
 // Balanced first two passes, then optional third appearances; no independent per-card lottery.
 const deck=shuffled(palettes.flatMap(hue=>Array(limits[hue]).fill(hue)),random);
 const patternDeck=shuffled(patterns,random);
 return Array.from({length:count},(_,i)=>({version:COLLECTION_POLICY_VERSION,background_palette:deck[i],background_pattern:patternDeck[i],palette_repeat_limit:limits[deck[i]],pattern_repeat_limit:1}));
}
export function visualInstructions(v,category){
 if(category==='C4')return 'FROZEN CATEGORY VARIATION: Dominant environment/surface palette family '+v.background_palette+'. Keep subject material colors and clear contrast. C4 MUST use a detailed environment OR detailed scene-filling surface; no standard background, abstract gradient backdrop, rings, generic decorative pattern or solid backing. Do not render the assigned basic-background pattern in C4. Meaningful natural/architectural/field details form the context instead; preserve the approved clean illustrated style.';
 return 'FROZEN CATEGORY VARIATION: For C1-C3 the basic background dominant hue family MUST be '+v.background_palette+'; for C4 this is the dominant environment palette, while its detailed spatial environment remains mandatory. Use ONLY background pattern type '+v.background_pattern+' (plain-gradient means no pattern). Do not add musical-note motifs, rings or a second pattern type. This assignment is scheduled across the category: hue at most '+v.palette_repeat_limit+' appearances, each pattern type at most once. Keep the existing subtle pattern contrast and gradient. In C4 any assigned motif is subordinate and integrated into an appropriate environmental surface, not a flat decorative backing that replaces the location. For C2 choose a similar or contrasting surface hue compatible with this fixed background and subject readability; do not override the assigned background hue.';
}
