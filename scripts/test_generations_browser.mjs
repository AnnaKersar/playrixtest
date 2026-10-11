import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const root='cloudflare/visitor-public';let paidCalls=0;
const server=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 if(req.method!=='GET'){if(['/api/runs','/api/plan-live'].includes(path))paidCalls++;json({},405);return;}
 if(path==='/api/generations'){json({items:[{id:'opaque',kind:'images',mode:'live',source:'admin',created_at:'2026-10-11T06:00:00Z',status:'failed',cards:[{label:'Карточка 1',status:'complete',image_url:'/game-art/cards-emblem.png'},{label:'Карточка 2',status:'failed',image_url:null}]}],next_offset:null});return;}
 if(path==='/api/guest/budget'){json({remaining_nanodollars:7500000000,ceiling_nanodollars:10000000000,committed_nanodollars:2500000000,card_count:10,generation_enabled:false,quote_nanodollars:null});return;}
 if(path==='/api/preflight'){json({},401);return;}
 if(path.startsWith('/api/')){json({cards:[],references:[],runs:[]});return;}
 try{const name=path==='/'?'index.html':path==='/generations'?'generations.html':path.slice(1);const bytes=await fs.readFile(root+'/'+name);res.setHeader('Content-Type',/\.m?js$/.test(name)?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html');res.end(bytes);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
await fs.mkdir('qa-output',{recursive:true});
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--remote-debugging-port=9391','--user-data-dir='+process.cwd()+'/qa-output/edge-generation-history','--no-first-run','about:blank'],{stdio:'ignore',windowsHide:true});
let ws,send;
try{
  let tabs;
  for(let i=0;i<60;i++){
    try{tabs=await(await fetch('http://127.0.0.1:9391/json',{signal:AbortSignal.timeout(1000)})).json();break;}
    catch{await new Promise(r=>setTimeout(r,150));}
  }
  assert(tabs?.some(t=>t.type==='page'),'Edge debugging endpoint unavailable');
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('Browser socket timeout')),10000);ws.onopen=()=>{clearTimeout(timer);r();};ws.onerror=j;});
  let id=0;const pending=new Map();
  ws.onmessage=e=>{const data=JSON.parse(e.data);if(pending.has(data.id)){pending.get(data.id)(data);pending.delete(data.id);}};
  send=(method,params={})=>new Promise((r,j)=>{const current=++id,timer=setTimeout(()=>{pending.delete(current);j(Error('Browser command timed out: '+method));},15000);pending.set(current,value=>{clearTimeout(timer);r(value);});ws.send(JSON.stringify({id:current,method,params}));});
  const ev=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.result.exceptionDetails)throw Error(JSON.stringify(result.result.exceptionDetails));return result.result.result.value;};
  const viewport=async(width,height=1000)=>send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<760});
  const screenshot=async name=>fs.writeFile('qa-output/'+name+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).result.data,'base64'));

 await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 for(const path of ['/generations','/','/minigame.html']){
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+path});
  const ready=path==='/generations'?'document.querySelectorAll(".generation-run").length===1':path==='/'?'document.querySelector("#guest-budget-summary")?.textContent.includes("7,5")':'!!document.querySelector("#game-grid")';
  for(let i=0;i<80;i++){if(await ev(ready))break;await new Promise(r=>setTimeout(r,100));}assert(await ev(ready),'Page not ready '+path);
  for(const width of [1280,768,390,320]){await viewport(width);assert(await ev('document.documentElement.scrollWidth<=innerWidth'),'Overflow '+path+' '+width);}
  if(path==='/generations'){assert(await ev('document.body.textContent.includes("Ошибка")'));await screenshot('generations-mobile');await viewport(1280);await screenshot('generations-desktop');}
  if(path==='/'){assert(await ev('document.querySelector("#launch").disabled'));assert(await ev('document.querySelector("#guest-budget-quote").textContent.includes("недоступна")'));await screenshot('guest-budget-mobile');}
  if(path==='/minigame.html')assert(await ev('Array.from(document.links).find(a=>a.pathname.endsWith("game-results.html")).getBoundingClientRect().top<document.querySelector("#game-grid").getBoundingClientRect().top'));
 }
 assert.equal(paidCalls,0);console.log('PASS generations, guest budget, results before play; 1280/768/390/320px no horizontal overflow; zero paid calls');
}finally{if(send)try{await send('Browser.close');}catch{}ws?.close();edge.kill();server.close();}
