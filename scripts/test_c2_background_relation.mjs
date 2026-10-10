import assert from 'node:assert/strict';
import {proceduralCard} from '../cloudflare/procedural-card.mjs';
const width=100,height=100,rgba=new Uint8Array(width*height*4);
for(let y=70;y<100;y++)for(let x=0;x<100;x++)rgba.set([249,186,13,255],(y*width+x)*4);
for(let y=20;y<88;y++)for(let x=30;x<70;x++)rgba.set([50,100,180,255],(y*width+x)*4);
for(const relation of ['similar','contrast']){const c=proceduralCard({width,height,rgba},'C2',{surfaceMode:'generated',backgroundSurfaceRelation:relation});assert.equal(c.composition.backgroundSurfaceRelation,relation);assert.equal(relation==='similar',c.composition.palette==='gold');for(let y=70;y<100;y++)for(let x=0;x<100;x++){const p=(y*width+x)*4;assert.deepEqual(c.rgba.slice(p,p+4),rgba.slice(p,p+4));}}
assert.deepEqual(proceduralCard({width,height,rgba},'C2',{surfaceMode:'generated'}).rgba,proceduralCard({width,height,rgba},'C2',{surfaceMode:'generated'}).rgba);
console.log('PASS similar and contrasting C2 background choices follow table hue; generated surface preserved; repeat assembly deterministic');

