// Bounded PNG RGB/RGBA8 codec. Reject unsupported formats rather than silently changing alpha.
const sig = new Uint8Array([137,80,78,71,13,10,26,10]);
const table = Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc = bytes => {let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
const concat = arrays => {const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let p=0;for(const a of arrays){out.set(a,p);p+=a.length;}return out;};
const chunk = (type,bytes) => {const out=new Uint8Array(bytes.length+12),d=new DataView(out.buffer);d.setUint32(0,bytes.length);out.set(new TextEncoder().encode(type),4);out.set(bytes,8);d.setUint32(bytes.length+8,crc(out.subarray(4,bytes.length+8)));return out;};
async function stream(bytes, codec) {return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(codec)).arrayBuffer());}
export async function encodePNG(width,height,rgba) {
  const head=new Uint8Array(13),v=new DataView(head.buffer);v.setUint32(0,width);v.setUint32(4,height);head[8]=8;head[9]=6;
  const scan=new Uint8Array(height*(width*4+1));for(let y=0;y<height;y++)scan.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
  return concat([sig,chunk('IHDR',head),chunk('IDAT',await stream(scan,new CompressionStream('deflate'))),chunk('IEND',new Uint8Array())]);
}
export async function decodePNG(bytes) {
  if(bytes.length>25*1024*1024 || !sig.every((n,i)=>bytes[i]===n))throw Error('Invalid PNG');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=8,width,height,channels,ended=false;const parts=[];
  while(p+12<=bytes.length){const n=v.getUint32(p),type=new TextDecoder().decode(bytes.subarray(p+4,p+8));if(p+n+12>bytes.length)throw Error('Truncated PNG');
    if(crc(bytes.subarray(p+4,p+n+8))!==v.getUint32(p+n+8))throw Error('PNG CRC');
    if(p===8&&type!=='IHDR')throw Error('PNG header');
    if(type==='IHDR'){if(width||n!==13)throw Error('PNG header');width=v.getUint32(p+8);height=v.getUint32(p+12);channels=bytes[p+17]===6?4:bytes[p+17]===2?3:0;if(!width||!height||width*height>2500000||bytes[p+16]!==8||!channels||bytes[p+18]||bytes[p+19]||bytes[p+20])throw Error('Unsupported PNG format');}
    else if(type==='IDAT')parts.push(bytes.subarray(p+8,p+8+n));else if(type==='IEND'){ended=true;break;}else if(type==='tRNS')throw Error('PNG transparency must be RGBA');
    p+=n+12;
  }
  if(!ended||!parts.length)throw Error('Incomplete PNG');
  // Bound decompression before collecting: a malicious compressed stream must not exhaust the isolate.
  const expected=height*(width*channels+1),reader=new Blob([concat(parts)]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(),segments=[];let count=0;
  while(true){const {value,done}=await reader.read();if(done)break;count+=value.length;if(count>expected){await reader.cancel();throw Error('PNG inflated size');}segments.push(value);}
  if(count!==expected)throw Error('PNG scanline size');const scan=concat(segments),stride=width*channels,raw=new Uint8Array(height*stride);
  const paeth=(a,b,c)=>{const x=a+b-c,pa=Math.abs(x-a),pb=Math.abs(x-b),pc=Math.abs(x-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const f=scan[y*(stride+1)];if(f>4)throw Error('PNG filter');for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=channels?raw[i-channels]:0,b=y?raw[i-stride]:0,c=y&&x>=channels?raw[i-stride-channels]:0;const predictor=f===0?0:f===1?a:f===2?b:f===3?(a+b)>>1:paeth(a,b,c);raw[i]=(scan[y*(stride+1)+1+x]+predictor)&255;}}
  const rgba=new Uint8Array(width*height*4);for(let i=0;i<width*height;i++){const s=i*channels,d=i*4;rgba[d]=raw[s];rgba[d+1]=raw[s+1];rgba[d+2]=raw[s+2];rgba[d+3]=channels===4?raw[s+3]:255;}return {width,height,rgba,channels};
}
export async function mockPNG(width=860,height=960) {
  const rgba=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const dx=(x-width/2)/(width*.32),dy=(y-height*.49)/(height*.33),hole=(x-width*.58)**2+(y-height*.43)**2<(width*.07)**2;if(dx*dx+dy*dy<1&&!hole){const i=(y*width+x)*4;rgba.set([70,175,204,255],i);}}return encodePNG(width,height,rgba);
}
// Separable Lanczos-3 with premultiplied alpha; PNG output keeps transparent holes.
export function resizeRGBA(src,options={}) {
  if(src.width!==1376||src.height!==1536||(src.channels!==4&&!(options.allowRGB&&src.channels===3)))throw Error('Expected native 1376x1536 RGBA8');
  const w=860,h=960,scale=src.width/w,sinc=x=>x===0?1:Math.sin(Math.PI*x)/(Math.PI*x),kernel=x=>Math.abs(x)<3?sinc(x)*sinc(x/3):0;
  const weights=(out,size)=>Array.from({length:out},(_,i)=>{const center=(i+.5)*scale-.5,items=[];let total=0;for(let j=Math.ceil(center-3*scale);j<=Math.floor(center+3*scale);j++){const k=kernel((j-center)/scale);items.push([Math.max(0,Math.min(size-1,j)),k]);total+=k;}return items.map(([j,k])=>[j,k/total]);});
  const wx=weights(w,src.width),wy=weights(h,src.height),out=new Uint8Array(w*h*4),rows=new Map();
  const horizontal=sy=>{if(rows.has(sy))return rows.get(sy);const row=new Float32Array(w*4);for(let x=0;x<w;x++){const dest=x*4;for(const [sx,k]of wx[x]){const p=(sy*src.width+sx)*4,a=src.rgba[p+3]/255;row[dest]+=src.rgba[p]*a*k;row[dest+1]+=src.rgba[p+1]*a*k;row[dest+2]+=src.rgba[p+2]*a*k;row[dest+3]+=a*k;}}rows.set(sy,row);return row;};
  for(let y=0;y<h;y++){const minRow=Math.min(...wy[y].map(item=>item[0]));for(const sy of rows.keys())if(sy<minRow)rows.delete(sy);const inputs=wy[y].map(([sy,k])=>[horizontal(sy),k]);for(let x=0;x<w;x++){const val=[0,0,0,0],dest=(y*w+x)*4,q=x*4;for(const [row,k]of inputs){val[0]+=row[q]*k;val[1]+=row[q+1]*k;val[2]+=row[q+2]*k;val[3]+=row[q+3]*k;}const a=Math.max(0,Math.min(1,val[3]));for(let c=0;c<3;c++)out[dest+c]=a>1e-6?Math.max(0,Math.min(255,Math.round(val[c]/a))):0;out[dest+3]=Math.round(a*255);}}

  return {width:w,height:h,rgba:out};
}
export async function finalPNG(bytes,onPhase=async()=>{},options={},operations={}) {
  const phase=async(name,operation,input,describe)=>{
    const started=Date.now();await onPhase(name,{outcome:'started',...input});
    try{const value=await operation();await onPhase(name,{outcome:'succeeded',stage_elapsed_ms:Date.now()-started,...describe(value)});return value;}
    catch(error){await onPhase(name,{outcome:'failed',stage_elapsed_ms:Date.now()-started,error});throw error;}
  };
  const dimensions=image=>({width:image.width,height:image.height,channels:image.channels||4});
  const src=await phase('decoding_png',()=> (operations.decode||decodePNG)(bytes),{input_bytes:bytes.length},dimensions);
  const resized=await phase('resizing_png',()=> (operations.resize||resizeRGBA)(src,options),dimensions(src),dimensions);
  return phase('encoding_png',()=> (operations.encode||encodePNG)(resized.width,resized.height,resized.rgba),dimensions(resized),value=>({output_bytes:value.length}));
}

// For SHA-pinned reference sheets only. Keep full pixel decoding for generated images.
export function pinnedReferencePNG(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<57||bytes.length>25*1024*1024||!sig.every((n,i)=>bytes[i]===n))throw Error('Invalid reference PNG');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(v.getUint32(8)!==13||new TextDecoder().decode(bytes.subarray(12,16))!=='IHDR'||crc(bytes.subarray(12,29))!==v.getUint32(29))throw Error('Reference PNG header');
 const width=v.getUint32(16),height=v.getUint32(20),channels=bytes[25]===6?4:bytes[25]===2?3:0;
 if(width!==896||height!==1040||bytes[24]!==8||!channels||bytes[26]||bytes[27]||bytes[28])throw Error('Unsupported reference PNG format or dimensions');
 let p=33,idat=false,ended=false;while(p+12<=bytes.length){const n=v.getUint32(p);if(n>bytes.length-p-12)throw Error('Truncated reference PNG');const type=new TextDecoder().decode(bytes.subarray(p+4,p+8));if(type==='IHDR'||type==='tRNS')throw Error('Unsupported reference PNG chunk');if(type==='IDAT'){if(n)idat=true;}if(type==='IEND'){if(n||p+12!==bytes.length)throw Error('Invalid reference PNG end');ended=true;break;}p+=n+12;}
 if(!idat||!ended)throw Error('Incomplete reference PNG');return {width,height,channels};
}

