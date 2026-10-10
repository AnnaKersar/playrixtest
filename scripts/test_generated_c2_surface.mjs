import assert from 'node:assert/strict';
import {generationContract,generationInstructions,validateAlpha,selectSurfaceFinish} from '../cloudflare/generation-contract.mjs';
import {proceduralCard} from '../cloudflare/procedural-card.mjs';
const finishes=new Set(Array.from({length:100},(_,i)=>selectSurfaceFinish('attempt-'+i)));assert.deepEqual([...finishes].sort(),['matte','reflective']);assert.equal(selectSurfaceFinish('same'),selectSurfaceFinish('same'));
const c=generationContract('C2','modular','attempt-1');assert.equal(c.surface_mode,'generated');assert.equal(c.background,'transparent');assert.match(generationInstructions(c),/S 42-100%, V 86-100%/);assert.match(generationInstructions(c),/70%/);
for(const category of ['C1','C3','C4'])assert.equal(generationContract(category).surface_mode,undefined);assert.equal(generationContract('C2','whole_card').background,'opaque');
const width=100,height=100,rgba=new Uint8Array(width*height*4);for(let y=70;y<100;y++)for(let x=0;x<100;x++)rgba.set([180,140,70,255],(y*width+x)*4);for(let y=20;y<88;y++)for(let x=30;x<70;x++)rgba.set([50,100,180,255],(y*width+x)*4);
assert.doesNotThrow(()=>validateAlpha({width,height,rgba},c));const bad=rgba.slice();bad[3]=255;assert.throws(()=>validateAlpha({width,height,rgba:bad},c));
const before=rgba.slice(),card=proceduralCard({width,height,rgba},'C2',{surfaceMode:'generated',surfaceFinish:c.surface_finish,shadowMode:c.shadow_mode});assert.deepEqual(before,rgba);assert.equal(card.composition.objectAssembly.scale,1);assert.equal(card.composition.objectAssembly.dx,0);assert.equal(card.composition.objectAssembly.dy,0);assert.equal(card.composition.surface.shadow.editorAdded,false);assert.equal(card.composition.surface.finish,c.surface_finish);
for(let p=0;p<rgba.length;p+=4){assert.equal(card.rgba[p+3],255);if(rgba[p+3]===255)assert.deepEqual(card.rgba.slice(p,p+4),rgba.slice(p,p+4),'Generated subject/surface altered');}
console.log('PASS frozen matte/reflective selection; C2 transparent top and opaque edge-to-edge surface; no resizing, recoloring or second surface/shadow; opaque final; other modes preserved');
