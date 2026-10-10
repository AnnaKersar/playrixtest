export const GENERATION_MODE_VERSION='image-background-contract/v5-generated-c2-surface';
export function generationContract(category,mode,seed='default'){
  if(!['C1','C2','C3','C4'].includes(category))throw Error('Generation category C1–C4 required');
  mode ||= category==='C4'?'whole_card':'modular';
  if(!['modular','whole_card'].includes(mode)||category==='C4'&&mode!=='whole_card')throw Error('C4 requires whole_card; invalid generation mode');
  return {version:GENERATION_MODE_VERSION,mode,category,background:mode==='whole_card'?'opaque':'transparent',...(mode==='modular'&&category==='C2'?{shadow_mode:'generated-surface-alpha',surface_mode:'generated',surface_finish:selectSurfaceFinish(seed)}:{})};
}
export function generationInstructions(contract){
  if(contract.mode==='whole_card')return 'OUTPUT CONTRACT — WHOLE CARD: Render a complete opaque card. The background fully fills the entire canvas through all four edges and corners. No transparent margins, cutout boundary, cloudy boundary, soft external vignette, halo or isolated color patch. Preserve the approved art direction and object identity.';
  const surface=contract.category==='C3'
    ? 'C3: Generate the subject and its explicitly requested complex meaningful surface together as one transparent assembly. The surface may span the full width where specified. All other space stays truly transparent.'
    : contract.category==='C2'
      ? `C2: Generate the subject standing directly on a simple horizontal surface, together with its contact shading, cast shadow and any selected reflection in ONE RGBA PNG. The surface fills the full canvas width from exactly 70% canvas height down through the bottom edge (30% height), including both bottom corners. Its upper edge is straight and horizontal; no pedestal, isolated patch or cloudy perimeter. The subject bottom contacts the surface at 88% canvas height; subject including handle stays within 78% width and 76% height, excluding the surface. Above the surface, every pixel outside the subject is truly transparent alpha zero. The subject and surface themselves are opaque, with naturally antialiased subject edges. Surface color follows reference-bright-palette/v1: HSV S 42-100%, V 86-100% in clean unobstructed base-color regions; contact shadows and reflections may be darker. Use the approved bright palette families gold, purple, cyan, pink or green, harmonized with the object. A smooth colored gradient uses up to 8.5 percentage points less saturation and up to 11 percentage points more value at the lighter end, bounded by those ranges; never mix a broad white wash. Finish selected and frozen for this attempt: ${contract.surface_finish==='reflective'?'REFLECTIVE: a clean stylized glossy plane with a restrained, perspective-consistent reflection of the subject, strongest at contact and fading with distance; not a photographic mirror, metallic glare or glitter.':'NON-REFLECTIVE: a clean matte plane with no reflected duplicate or gloss glare.'} Shadows follow the same illustrated reference Art Direction, start at actual contact without a gap and extend away from the actual light; they belong to this opaque surface, not a separate diffuse alpha cloud. Preserve characteristic flattened silhouette contours, compact darker contact and a lighter slightly softer far end. Keep shadows and reflections on the surface. Simplify soil into a broad color mass with a few large forms, not granular texture. The editor adds only the procedural background and pattern behind this assembly; it must not add another surface, shadow or reflection or resize the assembled foreground. Match the object material saturation and value distribution of comparable original reference materials; do not maximize saturation, use electric/neon blue or bleach it to pastel.`
      : 'C1: Generate ONLY the isolated subject and its specified contents. No ground plane, platform or surrounding scenery.';
  return 'OUTPUT CONTRACT — MODULAR FOREGROUND: True transparent alpha outside the subject and category-permitted surface . '+surface+' No decorative background, colored backing, color patches, rings, halo, glow, feathered vignette or cloudy/ragged outer matte. Keep the actual silhouette crisp and naturally antialiased; do not blur, trim or mask the subject. The reference cards teach style only; do not copy their backgrounds. Background and pattern are created separately by our procedural editor.';
}
export function validateAlpha(image,contract){
  const {width,height,rgba}=image;let opaque=0,nonzero=0,nonopaque=0;
  for(let i=3;i<rgba.length;i+=4){opaque+=rgba[i]===255;nonzero+=rgba[i]>0;nonopaque+=rgba[i]!==255;}
  if(contract.mode==='whole_card'&&nonopaque)throw Error('Whole card must be opaque across every pixel; source retained for review');
  if(contract.mode==='modular'){
    if(nonzero===0)throw Error('Empty foreground; source retained for review');
    const corners=(contract.category==='C3'||contract.surface_mode==='generated')?[0,width-1]:[0,width-1,(height-1)*width,width*height-1];
    if(nonzero/(width*height)>.98||corners.some(p=>rgba[p*4+3]>0))throw Error('Foreground includes a canvas-wide matte/background; source retained for review');
  }
  return {opaque,nonzero,nonopaque,pixels:width*height};
}

export function selectSurfaceFinish(seed){let h=2166136261;for(const c of String(seed))h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h%2?'reflective':'matte';}
