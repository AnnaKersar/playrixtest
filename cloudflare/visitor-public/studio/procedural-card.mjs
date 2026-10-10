import {C2_SURFACE_POLICY,surfaceHorizon,projectedSubjectShadow,subjectLighting} from './surface-policy.mjs';
export const COMPOSITION_VERSION='procedural-card/v6-contact-long-shadow';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),mod=(n,p)=>(n%p+p)%p;
function hsv(rgb){const a=rgb.map(v=>v/255),hi=Math.max(...a),lo=Math.min(...a),d=hi-lo;let h=0;if(d)h=hi===a[0]?mod((a[1]-a[2])/d,6):hi===a[1]?(a[2]-a[0])/d+2:(a[0]-a[1])/d+4;return [h*60,hi?d/hi:0,hi];}
function rgb(h,s,v){h=mod(h,360)/60;const c=v*s,x=c*(1-Math.abs(h%2-1)),m=v-c,a=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];return a.map(n=>Math.round((n+m)*255));}
const smooth=n=>{n=clamp(n,0,1);return n*n*(3-2*n)};
// Same bright HSV anchors and radial field as composition-v10.js; selection avoids the subject hue.
const anchors=[{name:'gold',rgb:[249,186,13],shift:8},{name:'purple',rgb:[188,87,245],shift:10},{name:'cyan',rgb:[10,177,245],shift:-12},{name:'pink',rgb:[255,99,146],shift:-5},{name:'green',rgb:[34,224,86],shift:-8}];
export function proceduralCard(foreground,category,settings={}){
 const {width:w,height:h,rgba:source}=foreground;let x0=w,y0=h,x1=-1,y1=-1,sx=0,sy=0,weight=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4,a=source[p+3];if(a>30){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}if(a>245){const [hue,s,v]=hsv([source[p],source[p+1],source[p+2]]),q=s*v;if(q>.2){sx+=Math.cos(hue*Math.PI/180)*q;sy+=Math.sin(hue*Math.PI/180)*q;weight+=q;}}}
 const subjectHue=mod(Math.atan2(sy,sx)*180/Math.PI,360),distance=anchor=>Math.abs(mod(hsv(anchor.rgb)[0]-subjectHue+180,360)-180);
 const palette=settings.paletteName?anchors.find(a=>a.name===settings.paletteName):anchors.reduce((best,a)=>distance(a)>distance(best)?a:best,anchors[0]);if(!palette)throw Error('Unknown assembly palette');
 const [hue,saturation,value]=hsv(palette.rgb),pixels=new Uint8Array(source.length),fit=['C1','C2'].includes(category)&&x1>=x0;
 const scale=fit?Math.min(1,.78*w/(x1-x0+1),.76*h/(y1-y0+1)):1;
 const dx=fit?(w-(x0+x1+1)*scale)/2:0,dy=fit?(category==='C2'?h*C2_SURFACE_POLICY.objectBottomFraction-(y1+1)*scale:(h-(y0+y1+1)*scale)/2):0;
 const horizon=surfaceHorizon(h),surfaceTop=rgb(hue+palette.shift,Math.max(.42,saturation-.10*.85),1),surfaceBottom=rgb(hue,Math.max(.42,saturation),Math.max(.86,value));
 const lighting=subjectLighting(source,w,h,settings.lightDirection||'auto');
 const shadowMap=category==='C2'&&settings.shadow!==false?projectedSubjectShadow(source,w,h,{scale,dx,dy},lighting):null;
 // Premultiplied sampling transforms the entire source; no segmentation, matte or edge mask.
 function sample(x,y){const u=(x+.5-dx)/scale-.5,v=(y+.5-dy)/scale-.5,i=Math.floor(u),j=Math.floor(v),fx=u-i,fy=v-j;let alpha=0,r=0,g=0,b=0;for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++){const xx=i+ox,yy=j+oy;if(xx<0||xx>=w||yy<0||yy>=h)continue;const p=(yy*w+xx)*4,q=(ox?fx:1-fx)*(oy?fy:1-fy)*source[p+3]/255;alpha+=q;r+=source[p]*q;g+=source[p+1]*q;b+=source[p+2]*q;}return [r,g,b,alpha];}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4,rad=Math.hypot((x/w-.5)*2,(y/h-.5)*2),t=1-smooth((rad-.18)/.78);
  let bg=rgb(hue+palette.shift*t*.85,Math.max(.42,saturation-.10*t*.85),Math.min(1,Math.max(.86,value)+.13*t*.85));
  if(mod(Math.hypot(x-w*.5,y-h*.5),w*.20)<w*.085)bg=bg.map(c=>clamp(c-20*.65,0,255));
  if(category==='C2'&&y>=horizon){const u=(y-horizon)/(h-horizon-1);bg=surfaceTop.map((c,k)=>c*(1-u)+surfaceBottom[k]*u);const shadow=shadowMap?.[y*w+x]||0;bg=bg.map(c=>c*(1-shadow));}
  const [r,g,b,a]=sample(x,y);pixels[p]=Math.round(r+bg[0]*(1-a));pixels[p+1]=Math.round(g+bg[1]*(1-a));pixels[p+2]=Math.round(b+bg[2]*(1-a));pixels[p+3]=255;
 }
 return {width:w,height:h,rgba:pixels,composition:{version:COMPOSITION_VERSION,palette:palette.name,palettePolicy:'reference-bright-palette/v1',paletteSelection:'maximum hue separation from saturated opaque subject pixels',pattern:'concentric_rings',gradient:{core:.18,tail:.78,strength:.85},objectAssembly:{scale,dx,dy,maxWidth:.78,maxHeight:.76,sourceUnchanged:true,widthFraction:(x1-x0+1)*scale/w,heightFraction:(y1-y0+1)*scale/h},surface:category==='C2'?{type:'simple-horizontal-full-width',horizon,heightFraction:(h-horizon)/h,colorPolicy:{version:'reference-bright-palette/v1',saturationFloor:.42,valueFloor:.86,whiteMix:false},shadow:{automatic:true,scope:'surface-only',source:'subject-alpha-copy',lighting,projection:shadowMap?.projection,opacity:.36,falloff:'contact anchored; long cast to canvas border; crisp contour with soft final 30%; lighter tip'},policy:C2_SURFACE_POLICY}:null}};
}
