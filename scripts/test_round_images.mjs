import assert from 'node:assert/strict';
import {loadRoundImages} from '../cloudflare/visitor-public/round-images.mjs';
const images=[];let release;
const lastDecode=new Promise(r=>release=r);const factory=()=>{const index=images.length,img={decode:()=>index===5?lastDecode:Promise.resolve()};images.push(img);return img;};
let ready=false;const pending=loadRoundImages(['a','b','c','d','e','f'],factory).then(v=>{ready=true;return v});
for(let i=0;i<5;i++)await images[i].onload();await Promise.resolve();assert.equal(ready,false);
const last=images[5].onload();await Promise.resolve();assert.equal(ready,false);release();await last;assert.equal((await pending).length,6);assert.equal(ready,true);
let bad;const failed=loadRoundImages(['broken'],()=>bad={decode:async()=>{}},1000);bad.onerror();await assert.rejects(()=>failed,/failed/);
console.log('PASS no reveal before all six images load and decode, delayed last decode and failed image rejected');
