import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const root='cloudflare/visitor-public';
const m=JSON.parse(await fs.readFile(root+'/archive-seed/history-v1/archive-manifest.json','utf8'));
const lora=JSON.parse(await fs.readFile(root+'/archive/latest-lora-test/test.json','utf8'));
let paidCalls=0;
const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method!=='GET'){paidCalls++;res.writeHead(405);res.end();return;}
  if(path==='/api/archive'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(m));return;}
  if(path==='/api/studies'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({runs:[],attempts:[]}));return;}
  if(path.startsWith('/api/archive/image/')){
    const hash=path.split('/').at(-1),asset=m.assets.find(a=>a.sha256===hash);
    if(!asset){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',asset.mime);
    res.end(await fs.readFile(root+'/archive-seed/history-v1/'+hash+'.'+(asset.mime==='image/jpeg'?'jpg':asset.mime.split('/')[1])));return;
  }
  try{
    const name=path==='/'?'archive.html':path.slice(1);
    const bytes=await fs.readFile(root+'/'+name);
    res.setHeader('Content-Type',/\.m?js$/.test(name)?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html');res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
await fs.mkdir('qa-output',{recursive:true});
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--remote-debugging-port=9389','--user-data-dir='+process.cwd()+'/qa-output/edge-archive-editorial','--no-first-run','about:blank'],{stdio:'ignore',windowsHide:true});
let ws,send;
try{
  let tabs;
  for(let i=0;i<60;i++){
    try{tabs=await(await fetch('http://127.0.0.1:9389/json',{signal:AbortSignal.timeout(1000)})).json();break;}
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
  await viewport(1280);await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  for(let i=0;i<60;i++){if(await ev('document.querySelectorAll(".archive-step").length===57 && document.querySelectorAll(".archive-scheme").length===5'))break;await new Promise(r=>setTimeout(r,100));}
  // Original archive guarantees remain intact; only the obsolete .step selector changed.
  assert.equal(await ev('document.querySelectorAll(".archive-step").length'),57);
  assert.equal(await ev('document.querySelectorAll("#chapters button").length'),7);
  assert.equal(await ev('document.querySelectorAll("h2 img").length'),0);
  assert.equal(await ev('document.querySelectorAll(".reference").length'),160);
  assert.equal(await ev('document.querySelectorAll(".uncertain").length'),57);
  assert.equal(await ev('document.querySelectorAll(".archive-phase").length'),10);
  assert.equal(await ev('document.querySelectorAll(".archive-scheme").length'),5);
  assert.equal(await ev('document.querySelectorAll(".archive-scheme-flow").length'),5);
  assert.equal(await ev('document.querySelectorAll(".archive-step.step").length'),0);
  assert(await ev('Array.from(document.images).every(img=>img.hasAttribute("alt")&&img.alt.trim().length>0)'));
  assert(await ev('Array.from(document.querySelectorAll(".archive-toc a")).every(a=>document.querySelector(a.hash))'));
  const media=await ev('Promise.all(Array.from(document.querySelectorAll(".archive-phase-media img")).map(async img=>{img.loading="eager";await img.decode();const f=img.closest("figure");return {record:f.dataset.recordId,sha:f.dataset.sha256,loaded:img.naturalWidth>0};}))');
  assert(media.length>=12,'Expected the selected historical comparisons');
  for(const item of media){assert(item.loaded);assert(item.record==='latest-lora-test'?lora.assets.some(a=>a.sha256===item.sha):m.entries.find(e=>e.id===item.record)?.images.some(a=>a.sha256===item.sha));}
  await screenshot('archive-desktop');
  await ev('Array.from(document.querySelectorAll("#scheme-list details")).forEach(d=>d.open=true)');
  assert(await ev('document.querySelectorAll("#scheme-list table").length>=3'));
  for(const width of [1280,768,390,320]){
    await viewport(width,844);
    assert(await ev('document.documentElement.scrollWidth<=innerWidth'),'Horizontal overflow at '+width);
    assert(await ev('Array.from(document.querySelectorAll(".archive-step>summary")).every(s=>{const p=s.getBoundingClientRect(),h=s.querySelector(".archive-heading").getBoundingClientRect();return h.width>100&&h.bottom<=p.bottom&&h.top>=p.top;})'),'Summary clipping at '+width);
  }
  await ev('Array.from(document.querySelectorAll("#scheme-list details")).forEach(d=>d.open=false)');
  await viewport(390,844);await ev('scrollTo(0,0)');await screenshot('archive-mobile');
  await ev('document.getElementById("archive-schemes").scrollIntoView()');await screenshot('archive-schemes-mobile');
  await ev('document.getElementById("phase-05").scrollIntoView()');await screenshot('archive-comparison-mobile');
  await ev('document.getElementById("search").value="160 оригинальных";document.getElementById("search").dispatchEvent(new Event("input"))');
  assert.equal(await ev('document.querySelectorAll(".archive-step").length'),1);
  await ev('Array.from(document.querySelectorAll(".archive-phase a")).find(a=>a.hash==="#history-I15").click()');
  assert.equal(await ev('document.querySelectorAll(".archive-step").length'),57);
  assert(await ev('document.getElementById("history-I15").open'));
  assert(await ev('document.documentElement.scrollWidth<=390'),'Expanded record overflow');
  assert.equal(paidCalls,0);
  console.log('PASS actual archive: 57 entries, 7 chapter buttons, 160 reference captions, 57 uncertainty labels, search and deep links; 10 phases, 5 schemes, verified comparison images; 1280/768/390/320px no overflow or summary clipping; 0 paid calls.');
}finally{
  if(send)try{await send('Browser.close');}catch{}
  ws?.close();edge.kill();server.close();
}
