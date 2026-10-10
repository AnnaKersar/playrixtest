// Horizons measured at unobstructed side borders of original 430 × 480 C2 cards.
export const C2_SURFACE_POLICY={version:'c2-reference-plane/v1',heightFraction:.30,objectBottomFraction:.88,references:[
 {id:'R02C04',horizon:333},{id:'R03C07',horizon:340},{id:'R04C01',horizon:322},
 {id:'R05C04',horizon:232},{id:'R07C03',horizon:358},{id:'R08C07',horizon:314},
 {id:'R10C02',horizon:369},{id:'R10C04',horizon:348},{id:'R13C08',horizon:229},
 {id:'R15C06',horizon:372},{id:'R16C08',horizon:362}],referenceHeight:480,
 medianHeightFraction:140/480,method:'Visible full-width horizontal edge; ambiguous, curved and horizonless cards excluded. Fraction is plane height, including area behind the object, not unobstructed pixel area.'};
export const surfaceHorizon=height=>Math.round(height*(1-C2_SURFACE_POLICY.heightFraction));
export function subjectLighting(rgba,width,height,override='auto'){
 const vectors={'upper-left':[-1,-1],'upper-right':[1,-1],'lower-left':[-1,1],'lower-right':[1,1]};
 if(override!=='auto'&&!vectors[override])throw Error('Invalid light direction');
 let vector=vectors[override],confidence=1,ambiguous=false,method='manual-object-light';
 if(!vector){
  const rows=[],hist=new Float64Array(36),step=Math.max(1,Math.round(width/288));
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){const p=(y*width+x)*4;if(rgba[p+3]<200)continue;const r=rgba[p]/255,g=rgba[p+1]/255,b=rgba[p+2]/255,hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,s=hi?d/hi:0;let hue=0;if(d)hue=hi===r?((g-b)/d+6)%6:hi===g?(b-r)/d+2:(r-g)/d+4;hue*=60;const l=.2126*r+.7152*g+.0722*b;rows.push({x,y,hue,s,v:hi,l});if(s>.25&&hi>.2)hist[Math.floor(hue/10)%36]+=s*hi;}
  let bin=0;for(let i=1;i<36;i++)if(hist[i]>hist[bin])bin=i;const hue=(bin+.5)*10,material=hist[bin]?rows.filter(r=>r.s>.25&&Math.abs(((r.hue-hue+540)%360)-180)<25):rows;
  if(material.length){const ordered=material.map(r=>r.l).sort((a,b)=>a-b),threshold=ordered[Math.floor(ordered.length*.75)];let cx=0,cy=0,bx=0,by=0,n=0;for(const r of material){cx+=r.x;cy+=r.y;const q=Math.max(0,r.l-threshold);bx+=r.x*q;by+=r.y*q;n+=q;}const vx=n?(bx/n-cx/material.length)/width:0,vy=n?(by/n-cy/material.length)/height:0;confidence=Math.hypot(vx,vy);ambiguous=confidence<.05||Math.abs(vx)<.05;vector=[vx>=0?1:-1,vy>=0?1:-1];}else{vector=[0,-1];confidence=0;ambiguous=true;}
  method='dominant-material bright-quartile centroid; heuristic, manually overridable';
 }
 const name=(vector[1]<0?'upper':'lower')+'-'+(vector[0]<0?'left':vector[0]>0?'right':'center'),shadowVector=vector.map(v=>-v);
 return {version:'subject-light-shadow/v2',override,method,lightDirection:name,lightVector:vector,shadowDirection:(shadowVector[1]<0?'upper':'lower')+'-'+(shadowVector[0]<0?'left':shadowVector[0]>0?'right':'center'),shadowVector,confidence,ambiguous,scope:'surface-only'};
}
export function shadowProjection(width,height,lighting){const foot=height*C2_SURFACE_POLICY.objectBottomFraction;return {foot,baseY:foot-height*.003,centerX:width*.5,compression:.14*lighting.shadowVector[1],shear:.24*lighting.shadowVector[0],spread:.80};}
export function projectShadowPoint(x,y,p){return [p.centerX+p.spread*(x-p.centerX)+p.shear*(p.foot-y),p.baseY+p.compression*(p.foot-y)];}
export function unprojectShadowPoint(x,y,p){const sourceY=p.foot-(y-p.baseY)/p.compression;return [p.centerX+(x-p.centerX-p.shear*(p.foot-sourceY))/p.spread,sourceY];}
export function surfacePalette(selection,sampleRGB){
 if(selection&&typeof selection==='object'&&['h','s','v','shift'].every(k=>Number.isFinite(selection[k])))return selection;
 if(!Array.isArray(sampleRGB)||sampleRGB.length!==3||!sampleRGB.every(Number.isFinite))throw Error('Editor background palette unavailable');
 const a=sampleRGB.map(v=>Math.max(0,Math.min(255,v))/255),hi=Math.max(...a),lo=Math.min(...a),d=hi-lo;let h=0;
 if(d)h=hi===a[0]?((a[1]-a[2])/d+6)%6:hi===a[1]?(a[2]-a[0])/d+2:(a[0]-a[1])/d+4;
 return {h:h*60,s:hi?d/hi:0,v:Math.max(.86,hi),shift:8};
}

// Copy the subject alpha, flatten and shear it onto the plane. Soften only the shadow.
export function projectedSubjectShadow(rgba,width,height,layout={scale:1,dx:0,dy:0},lighting=subjectLighting(rgba,width,height)){
 const {scale,dx,dy}=layout,projection=shadowProjection(width,height,lighting);
 const alpha=new Float32Array(width*height),out=new Float32Array(alpha.length),horizon=surfaceHorizon(height);
 for(let y=horizon;y<height;y++)for(let x=0;x<width;x++){
  const [subjectX,subjectY]=unprojectShadowPoint(x+.5,y+.5,projection);if(subjectY>projection.foot)continue;
  const u=(subjectX-dx)/scale-.5,v=(subjectY-dy)/scale-.5,ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy;let a=0;
  for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++){const xx=ix+ox,yy=iy+oy;if(xx>=0&&xx<width&&yy>=0&&yy<height)a+=rgba[(yy*width+xx)*4+3]/255*(ox?fx:1-fx)*(oy?fy:1-fy);}
  const distance=Math.min(1,Math.abs(y-projection.baseY)/(height*.12)),fade=1-distance*distance*(3-2*distance);
  alpha[y*width+x]=a*.30*fade;
 }
 // Small separable kernel belongs to the shadow layer, never to the object layer.
 const radius=Math.max(1,Math.round(width*.003)),weights=Array.from({length:radius*2+1},(_,i)=>Math.exp(-2*((i-radius)/radius)**2)),sum=weights.reduce((a,b)=>a+b,0),temp=new Float32Array(alpha.length);
 for(let y=horizon;y<height;y++)for(let x=0;x<width;x++){let a=0;for(let k=-radius;k<=radius;k++){const xx=x+k;if(xx>=0&&xx<width)a+=alpha[y*width+xx]*weights[k+radius];}temp[y*width+x]=a/sum;}
 for(let y=horizon;y<height;y++)for(let x=0;x<width;x++){let a=0;for(let k=-radius;k<=radius;k++){const yy=y+k;if(yy>=horizon&&yy<height)a+=temp[yy*width+x]*weights[k+radius];}out[y*width+x]=a/sum;}
 return out;
}
