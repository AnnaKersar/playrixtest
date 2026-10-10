// Pure procedural editor preset. No segmentation, masks, blur, trimming or white matte.
export const COMPOSITION_VERSION='procedural-card/v1';
export function proceduralCard(foreground,category,settings={}){
  const {width,height,rgba}=foreground;
  const palette=settings.palette||[[167,226,246],[55,133,204]];
  const pixels=new Uint8Array(rgba.length);
  let bottom=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]>30)bottom=Math.max(bottom,y);
  const horizon=Math.min(height-1,bottom+2);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4;
    const distance=Math.hypot((x/width-.5)*.8,(y/height-.45)*.8),t=Math.min(1,distance);
    const band=((x+y*.5)/Math.max(1,width*.15))%1<.12?.04:0;
    for(let c=0;c<3;c++){
      let bg=palette[0][c]*(1-t)+palette[1][c]*t;
      bg=bg*(1-band)+255*band;
      if(category==='C2'&&y>=horizon){const u=(y-horizon)/Math.max(1,height-horizon-1);bg=[189,224,239][c]*(1-u)+[112,166,200][c]*u;}
      const a=rgba[p+3]/255;pixels[p+c]=Math.round(rgba[p+c]*a+bg*(1-a));
    }
    pixels[p+3]=255;
  }
  return {width,height,rgba:pixels,composition:{version:COMPOSITION_VERSION,palette,pattern:'diagonal-bands',surface:category==='C2'?{type:'simple-horizontal-full-width',horizon}:null}};
}

