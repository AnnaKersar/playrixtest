import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {decodePNG} from '../cloudflare/png.mjs';
const crc=bytes=>{let c=0xffffffff;for(const v of bytes){c^=v;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
function chunk(type,data){const a=Buffer.alloc(data.length+12);a.writeUInt32BE(data.length);a.write(type,4);a.set(data,8);a.writeUInt32BE(crc(a.subarray(4,-4)),a.length-4);return a;}
function png(w,h,c,scan){const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=c===4?6:2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);}
const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
for(const c of [3,4])for(let filter=0;filter<=4;filter++){
 const w=37,h=19,stride=w*c,pixels=Uint8Array.from({length:stride*h},(_,i)=>(i*71+(i>>3))&255),scan=Buffer.alloc(h*(stride+1)),expected=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++){scan[y*(stride+1)]=filter;for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=c?pixels[i-c]:0,b=y?pixels[i-stride]:0,d=y&&x>=c?pixels[i-stride-c]:0,predictor=[0,a,b,(a+b)>>1,paeth(a,b,d)][filter];scan[y*(stride+1)+1+x]=(pixels[i]-predictor)&255;}}
 for(let i=0;i<w*h;i++){expected.set(pixels.subarray(i*c,i*c+3),i*4);expected[i*4+3]=c===4?pixels[i*c+3]:255;}
 assert.deepEqual((await decodePNG(png(w,h,c,scan))).rgba,expected);
}
await assert.rejects(()=>decodePNG(png(1,1,4,Buffer.alloc(1024*1024))),/inflated size/);
await assert.rejects(()=>decodePNG(png(1,1,4,Buffer.alloc(3))),/scanline size/);
await assert.rejects(()=>decodePNG(png(1,1,4,Buffer.from([5,1,2,3,4]))),/filter/);
const corrupt=png(1,1,4,Buffer.from([0,1,2,3,4]));corrupt[corrupt.length-1]^=1;await assert.rejects(()=>decodePNG(corrupt),/CRC/);
console.log('PASS RGB/RGBA all five PNG filters, partial alpha preserved, bounded inflate, short data, invalid filters and CRC rejection; provider calls 0');

