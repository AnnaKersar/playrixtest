export const GENERATION_MODE_VERSION='image-background-contract/v3-stylized-c2-shadow';
export function generationContract(category,mode){
  if(!['C1','C2','C3','C4'].includes(category))throw Error('Generation category C1–C4 required');
  mode ||= category==='C4'?'whole_card':'modular';
  if(!['modular','whole_card'].includes(mode)||category==='C4'&&mode!=='whole_card')throw Error('C4 requires whole_card; invalid generation mode');
  return {version:GENERATION_MODE_VERSION,mode,category,background:mode==='whole_card'?'opaque':'transparent',...(mode==='modular'&&category==='C2'?{shadow_mode:'generated-alpha'}:{})};
}
export function generationInstructions(contract){
  if(contract.mode==='whole_card')return 'OUTPUT CONTRACT — WHOLE CARD: Render a complete opaque card. The background fully fills the entire canvas through all four edges and corners. No transparent margins, cutout boundary, cloudy boundary, soft external vignette, halo or isolated color patch. Preserve the approved art direction and object identity.';
  const surface=contract.category==='C3'
    ? 'C3: Generate the subject and its explicitly requested complex meaningful surface together as one transparent assembly. The surface may span the full width where specified. All other space stays truly transparent.'
    : contract.category==='C2'
      ? 'C2: Generate the subject, its specified contents AND its stylized semitransparent cast shadow in the same RGBA PNG. The shadow is the only permitted element outside the subject. C2 STYLE CHECK: Match the clean rounded volumetric casual-game illustration of the approved references. Use broad smooth color and shading regions, simplified chunky contents and restrained broad highlights. The cast shadow belongs to that same illustrated style: a readable flattened shape with a defined contact contour, not a photographic diffuse smudge. When soil or similar material is explicitly requested, depict a simplified brown mass with only a few large readable clumps; avoid gritty granular soil, dense tiny particles and photographic texture. Keep worms and other contents as broad smooth stylized forms. Do not invent dirt spatter, scratches, corrosion, scuffed microtexture, grunge, realistic wear or product-photography materials. A requested faded color is a broad color choice, not permission to add distressed texture. Preserve the approved object identity, camera and art direction. Do NOT generate a floor, ground plane, pedestal or full-width gradient plane: our procedural editor adds the simple horizontal full-width surface separately. Render the shadow as neutral dark pixels with genuine partial alpha (approximately 15–55% opacity), never as an opaque gray patch, white backing or painted floor. Anchor its darkest contact edge directly beneath the actual bottom of the subject, without a floating gap. Project a long, flattened silhouette away from the actual key light, toward a side edge of the canvas; keep the contour defined near the subject with only slight softening at the far tip, which fades lighter. All shadow pixels must lie in the bottom 30% of the canvas (the future horizontal surface), never on the upper background. Place the subject centrally with its opaque bottom at 88% of canvas height; the opaque subject including handle occupies at most 78% of canvas width and 76% of height. Keep the whole subject and shadow inside the canvas, with a small transparent margin at the shadow tip. Outside the subject and this shadow, alpha is exactly zero. Do not draw a checkerboard. The editor preserves this generated shadow and adds no second shadow.'
      : 'C1: Generate ONLY the isolated subject and its specified contents. No ground plane, platform or surrounding scenery.';
  return 'OUTPUT CONTRACT — MODULAR FOREGROUND: True transparent alpha outside the subject and category-permitted surface or explicitly permitted C2 cast shadow. '+surface+' No decorative background, colored backing, color patches, rings, halo, glow, feathered vignette or cloudy/ragged outer matte. Keep the actual silhouette crisp and naturally antialiased; do not blur, trim or mask the subject. The reference cards teach style only; do not copy their backgrounds. Background and pattern are created separately by our procedural editor.';
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
