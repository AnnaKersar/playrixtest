export const GENERATION_MODE_VERSION='image-background-contract/v1';
export function generationContract(category,mode){
  if(!['C1','C2','C3','C4'].includes(category))throw Error('Generation category C1–C4 required');
  mode ||= category==='C4'?'whole_card':'modular';
  if(!['modular','whole_card'].includes(mode)||category==='C4'&&mode!=='whole_card')throw Error('C4 requires whole_card; invalid generation mode');
  return {version:GENERATION_MODE_VERSION,mode,category,background:mode==='whole_card'?'opaque':'transparent'};
}
export function generationInstructions(contract){
  if(contract.mode==='whole_card')return 'OUTPUT CONTRACT — WHOLE CARD: Render a complete opaque card. The background fully fills the entire canvas through all four edges and corners. No transparent margins, cutout boundary, cloudy boundary, soft external vignette, halo or isolated color patch. Preserve the approved art direction and object identity.';
  const surface=contract.category==='C3'
    ? 'C3: Generate the subject and its explicitly requested complex meaningful surface together as one transparent assembly. The surface may span the full width where specified. All other space stays truly transparent.'
    : contract.category==='C2'
      ? 'C2: Generate ONLY the subject and its specified contents. Do NOT generate a floor, ground plane, pedestal or full-width gradient plane: our procedural editor adds the simple horizontal full-width surface separately.'
      : 'C1: Generate ONLY the isolated subject and its specified contents. No ground plane, platform or surrounding scenery.';
  return 'OUTPUT CONTRACT — MODULAR FOREGROUND: True transparent alpha outside the subject and category-permitted surface. '+surface+' No decorative background, colored backing, color patches, rings, halo, glow, feathered vignette or cloudy/ragged outer matte. Keep the actual silhouette crisp and naturally antialiased; do not blur, trim or mask the subject. The reference cards teach style only; do not copy their backgrounds. Background and pattern are created separately by our procedural editor.';
}
export function validateAlpha(image,contract){
  const {width,height,rgba}=image;let opaque=0,nonzero=0,nonopaque=0;
  for(let i=3;i<rgba.length;i+=4){opaque+=rgba[i]===255;nonzero+=rgba[i]>0;nonopaque+=rgba[i]!==255;}
  if(contract.mode==='whole_card'&&nonopaque)throw Error('Whole card must be opaque across every pixel; source retained for review');
  if(contract.mode==='modular'){
    if(nonzero===0)throw Error('Empty foreground; source retained for review');
    const corners=contract.category==='C3'?[0,width-1]:[0,width-1,(height-1)*width,width*height-1];
    if(nonzero/(width*height)>.98||corners.some(p=>rgba[p*4+3]>0))throw Error('Foreground includes a canvas-wide matte/background; source retained for review');
  }
  return {opaque,nonzero,nonopaque,pixels:width*height};
}

