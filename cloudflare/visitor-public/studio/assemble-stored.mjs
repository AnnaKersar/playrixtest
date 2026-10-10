import {proceduralCard,COMPOSITION_VERSION} from './procedural-card.mjs';
export async function buildStoredAssembly(job,info,lightDirection='auto'){
 const image=new Image();image.src='/api/asset?job='+encodeURIComponent(job.id)+'&kind=foreground';await image.decode();
 const width=info.final[0],height=info.final[1];if(image.naturalWidth!==width||image.naturalHeight!==height)throw Error('Размер сохранённого предмета не совпадает с карточкой');
 const source=document.createElement('canvas');source.width=width;source.height=height;const context=source.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
 const rgba=new Uint8Array(context.getImageData(0,0,width,height).data),card=proceduralCard({width,height,rgba},job.category,{lightDirection,shadowMode:info.generation?.shadow_mode,surfaceMode:info.generation?.surface_mode,surfaceFinish:info.generation?.surface_finish});
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(card.rgba),width,height),0,0);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Не удалось сохранить PNG');const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {jobId:job.id,expectedForegroundSHA:info.foreground_sha256,expectedFinalSHA:info.final_sha256,rendererVersion:COMPOSITION_VERSION,composition:card.composition,pngBase64:btoa(binary)};
}
