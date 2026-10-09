/* Public bridge; calibration stays in the authenticated private package. */
export async function editorEngine(){
 let frame=document.getElementById('private-engine');if(!frame){frame=document.createElement('iframe');frame.id='private-engine';frame.src='/editor/';frame.hidden=true;document.body.append(frame);}
 for(let i=0;i<100;i++){const engine=frame.contentWindow?.reviewEngine;if(engine?.coreFalloffPolicy)return engine;await new Promise(r=>setTimeout(r,100));}throw Error('Private v9 editor unavailable; verify package and access.');
}
export async function calibratedAlternatives(job,image,hash){
 const e=await editorEngine(),object=e.canvas(860,960);object.getContext('2d').drawImage(image,0,0);const s=e.getState();s.layers={background:null,surface:null,object:null,finishing:null};s.theme={collectionBrief:'',topics:[],manualMotifOverride:false};Object.assign(s.gradient,{mode:'broad',angle:0,axisX:1,axisY:1,coreRadius:.14,falloffRadius:1.6,focusX:.5,focusY:.5,spread:1,strength:1});e.setState(s);e.assets.set(job.id,{id:job.id,name:job.object_id,sha256:hash,image,width:860,height:960});
 const choices=e.autoMatch(object);if(choices.selected.length!==3)throw Error('v9 needs three eligible candidates');const source=object.getContext('2d').getImageData(0,0,860,960).data,alternatives=[];
 for(const [i,row]of choices.selected.entries()){row.config.layers.object=job.id;e.setState(row.config);if(job.category==='C2')await installPlane(e,row.config,job,image);e.setState(row.config);const canvas=e.compose(860,960),pixels=canvas.getContext('2d').getImageData(0,0,860,960).data;let objectMismatch=0,nonopaque=0;for(let n=0;n<pixels.length;n+=4){nonopaque+=pixels[n+3]!==255;if(source[n+3]===255)objectMismatch+=pixels[n]!==source[n]||pixels[n+1]!==source[n+1]||pixels[n+2]!==source[n+2];}if(objectMismatch||nonopaque)throw Error('Foreground protection QA failed');alternatives.push({id:'candidate-'+i,config:e.manifest(),features:row.assessment,qa:{width:860,height:960,objectMismatch,nonopaque},semanticReview:'unreviewed'});}return alternatives;
}
export async function drawCalibrated(canvas,alternative,job,image,hash){const e=await editorEngine(),assetId=alternative.config.layers?.object||job.id;e.assets.set(assetId,{id:assetId,name:job.object_id,sha256:hash,image,width:860,height:960});const config=structuredClone(alternative.config);if(job.category==='C2')await installPlane(e,config,job,image);e.setState(config);canvas.getContext('2d').drawImage(e.compose(860,960),0,0);}

async function installPlane(e,config,job,image){
 const id=job.id+'-plane';if(config.layers?.surface&&config.layers.surface!==id)return;
 const source=e.canvas(860,960);source.getContext('2d').drawImage(image,0,0);const pixels=source.getContext('2d').getImageData(0,0,860,960).data;let bottom=480;for(let y=0;y<960;y++)for(let x=0;x<860;x++)if(pixels[(y*860+x)*4+3]>30)bottom=Math.max(bottom,y);
 const plane=e.canvas(860,960),ctx=plane.getContext('2d'),horizon=Math.min(920,bottom+2),gradient=ctx.createLinearGradient(0,horizon,0,960);gradient.addColorStop(0,'#bde0ef');gradient.addColorStop(1,'#70a6c8');ctx.fillStyle=gradient;ctx.fillRect(0,horizon,860,960-horizon);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(plane.toDataURL('image/png')))),n=>n.toString(16).padStart(2,'0')).join('');e.assets.set(id,{id,name:'C2 · procedural full-width plane',sha256:hash,image:plane,width:860,height:960});config.layers.surface=id;
}
