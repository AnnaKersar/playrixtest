// Resolve model-authored environment choices against the user's current C2 rule.
export function resolveCardBrief(brief,contract){
 let text=String(brief);
 if(contract?.category!=='C2')return text;
 const hue=contract.variation?.background_palette||'the single shared environment color';
 const colors='(?:(?:light|pale|bright|warm|soft|fresh|dark)[ -])?(?:cyan|blue|green|pink|purple|violet|lavender|yellow|gold|orange|red|teal|mint|turquoise)';
 text=text.replace(new RegExp('\\b'+colors+'\\s+(C2\\s+)?(plane|surface|tabletop|table|background|backdrop)\\b','gi'),(_,category,noun)=>hue+' '+(category||'')+noun);
 text=text.replace(new RegExp('\\b(plane|surface|tabletop|table|background|backdrop)\\s+(?:is|in|colored|coloured)\\s+'+colors+'\\b','gi'),(_,noun)=>noun+' in '+hue);
 text=text.replace(new RegExp('\\bagainst\\s+(?:a\\s+)?(?:basic\\s+)?'+colors+'\\b','gi'),'against the same '+hue+' background');
 return text;
}
export function finalCardConstraints(contract){
 const c=contract?.category||'C1',hue=contract?.variation?.background_palette||'one chosen reference-bright hue';
 return 'FINAL RENDER LAYOUT CHECKLIST (full 864x960 canvas; prioritize over reference framing): Complete focal SUBJECT including every attached part: max 70% width, max 70% height, normally 55–65% of its limiting dimension. Horizontal center x=432px. Lowest actual SUBJECT pixel y=826–845px, excluding shadow/reflection/receiving plane. Do not fill the frame. Main body of a tall supported subject around y=499px; do not put a camera body above long empty tripod legs. For short wide subjects, preserve size and low contact even when their visual mass must lie lower than mid-image. '+(c==='C2'?'C2: BOTH backdrop and full-width plane use '+hue+' with the SAME base hue/saturation/brightness. NO green table with cyan backdrop or any second environment hue. Only subdued shading separates them. Horizon exactly y=768px; plane occupies last 192px. ':'')+'Check these concrete values before output; text compliance alone is not rendered acceptance.';
}
