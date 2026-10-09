(()=>{'use strict';
const defaults={type:'rings',scale:100,thickness:22,opacity:65,x:0,y:0,rotation:0,color:'#d8f1ff',background:'#20445b',object:true},order=['background','pattern','surface','object','finishing'];let state={...defaults};const $=id=>document.getElementById(id),canvas=()=>{const c=document.createElement('canvas');c.width=860;c.height=960;return c;};
function validate(s){if(!['rings','stripes','rays','dots'].includes(s.type))throw Error('Неизвестный узор');for(const[k,min,max]of [['scale',35,180],['thickness',2,60],['opacity',0,100],['x',-400,400],['y',-400,400],['rotation',0,180]])if(!Number.isFinite(s[k])||s[k]<min||s[k]>max)throw Error('Некорректный параметр '+k);for(const k of ['color','background'])if(!/^#[0-9a-f]{6}$/i.test(s[k]))throw Error('Некорректный цвет');if(typeof s.object!=='boolean')throw Error('Некорректный объект');return Object.fromEntries(Object.keys(defaults).map(k=>[k,s[k]]));}
function pattern(s=state){const c=canvas(),g=c.getContext('2d'),step=s.scale,width=Math.min(s.thickness,step*.7);g.translate(430+s.x,480+s.y);g.rotate(s.rotation*Math.PI/180);g.fillStyle=g.strokeStyle=s.color;g.globalAlpha=s.opacity/100;g.lineWidth=width;
 if(s.type==='rings'){for(let i=1;i<=3;i++){g.beginPath();g.arc(0,0,i*step,0,Math.PI*2);g.stroke();}}
 if(s.type==='stripes')for(let x=-1600;x<=1600;x+=step)g.fillRect(x-width/2,-1600,width,3200);
 if(s.type==='dots')for(let y=-1600;y<=1600;y+=step)for(let x=-1600;x<=1600;x+=step){g.beginPath();g.arc(x,y,width/2,0,Math.PI*2);g.fill();}
 if(s.type==='rays'){const n=Math.max(6,Math.round(2400/step)),a=2*Math.PI/n,gap=Math.min(.7,width/step);for(let i=0;i<n;i++){g.beginPath();g.moveTo(0,0);g.arc(0,0,2000,i*a,i*a+a*gap);g.closePath();g.fill();}}
 return c;}
function object(){const c=canvas(),g=c.getContext('2d');g.fillStyle='#ec9d58';g.beginPath();g.roundRect(270,290,320,400,65);g.moveTo(512,420);g.arc(470,420,42,0,Math.PI*2);g.fill('evenodd');return c;}
function compose(s=state){const c=canvas(),g=c.getContext('2d');g.fillStyle=s.background;g.fillRect(0,0,860,960);g.drawImage(pattern(s),0,0);if(s.object)g.drawImage(object(),0,0);return c;}
function manifest(){return {version:'public-pattern-demo/v1',dimensions:{width:860,height:960},pattern:{...state,ringCount:state.type==='rings'?3:null},assetReferences:{background:'procedural-solid',pattern:'procedural',surface:null,object:state.object?'synthetic-rounded-shape-with-hole':null,finishing:null},layerOrder:order};}
function apply(m){if(m.version!=='public-pattern-demo/v1'||m.dimensions?.width!==860||m.dimensions?.height!==960||JSON.stringify(m.layerOrder)!==JSON.stringify(order))throw Error('Несовместимый manifest');state=validate(m.pattern);sync();render();}
function sync(){for(const k of Object.keys(defaults)){if(k==='object')$(k).checked=state[k];else $(k).value=state[k];}}
function render(){$('preview').getContext('2d').drawImage(compose(),0,0);$('rotation').disabled=state.type==='rings';}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
for(const k of Object.keys(defaults))$(k).oninput=()=>{state[k]=k==='object'?$(k).checked:typeof defaults[k]==='number'?Number($(k).value):$(k).value;render();};
$('reset').onclick=()=>{state={...defaults};sync();render();};$('pattern').onclick=()=>pattern().toBlob(b=>download(b,'pattern.png'));$('card').onclick=()=>compose().toBlob(b=>download(b,'card.png'));$('manifest').onclick=()=>download(new Blob([JSON.stringify(manifest(),null,2)],{type:'application/json'}),'manifest.json');
$('import').onchange=async()=>{try{const file=$('import').files[0];if(!file)return;if(file.size>20000)throw Error('Слишком большой JSON');apply(JSON.parse(await file.text()));$('status').textContent='Настройки восстановлены локально.';}catch(e){$('status').textContent=e.message;}};
window.demoEngine={pattern,compose,object,manifest,apply,getState:()=>({...state}),setState:s=>{state=validate(s);sync();render();}};sync();render();
})();
