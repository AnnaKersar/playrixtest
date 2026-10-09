import fs from 'node:fs';import {spawn} from 'node:child_process';const root=new URL('./',import.meta.url),checks=[],check=(n,p)=>{checks.push({name:n,pass:!!p});if(!p)throw Error(n)};
spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--remote-debugging-port=9381','--user-data-dir='+new URL('../qa-output/edge/',root).pathname.replace(/^\/(\w:)/,'$1'),'--no-first-run','about:blank'],{stdio:'ignore',windowsHide:true});let tabs;for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9381/json')).json();break}catch{await new Promise(r=>setTimeout(r,150))}}const ws=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();ws.onmessage=e=>{const d=JSON.parse(e.data);if(pending.has(d.id)){pending.get(d.id)(d);pending.delete(d.id)}};const send=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}))});async function ev(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));return r.result.result.value}async function until(expr){for(let i=0;i<60;i++){if(await ev(expr))return;await new Promise(r=>setTimeout(r,150))}throw Error('timeout '+expr)}
try {
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:5190/'});
 for(let i=0;i<360;i++){const r=await ev("({failed:typeof failed==='undefined'?null:failed,ready:document.querySelector('main')?.textContent})");if(r.failed)throw Error(r.failed);if(r.ready?.includes('готово к оценке 20/20'))break;await new Promise(r=>setTimeout(r,500));if(i===359)throw Error('registration timeout')}
 check('20 assets automatically registered without deployment',true);
 const dataset=await (await fetch('http://127.0.0.1:5190/api/preferences?studyId=dryrun-20-50refs-v1')).json();
 check('60 immutable v9 configs',Object.values(dataset.dataset.frozenCandidates).flat().length===60);
 check('60 compositions dimensions/alpha/opaque occlusion',Object.values(dataset.dataset.frozenCandidates).flat().every(a=>a.qa.width===860&&a.qa.height===960&&!a.qa.nonopaque&&!a.qa.objectMismatch));
 await send('Page.navigate',{url:'http://127.0.0.1:5190/review.html?study=dryrun-20-50refs-v1'});
 await until("document.querySelectorAll('.option canvas').length===3 && !busy");
 check('reused review UI renders 3 alternatives',true);
 await ev("document.querySelector('#materialTags input').checked=true;document.getElementById('materialComment').value='QA material independent';document.querySelector('.option button').click()");
 await until("document.getElementById('progress').textContent.startsWith('1 /') && !busy");
 await send('Page.reload');await until("document.getElementById('progress')?.textContent.startsWith('1 /') && document.querySelectorAll('.option canvas').length===3 && !busy");
 check('durable answer resumes after reload',true);
 const exp=await(await fetch('http://127.0.0.1:5190/api/preferences?studyId=dryrun-20-50refs-v1&op=export')).json();
 check('separate material feedback in export',exp.trials[0].diagnostics.objectMaterial.comment==='QA material independent'&&exp.events.length===1);
 await ev("document.getElementById('undo').click()");await until("document.getElementById('progress').textContent.startsWith('0 /') && !busy");check('undo durable',true);
 await ev("document.querySelector('.option button:nth-of-type(2)').click()");await until("document.getElementById('visibleEditor').contentWindow.reviewEngine?.coreFalloffPolicy && !busy");
 check('candidate opens independent v9 draft',await ev("document.getElementById('visibleEditor').contentWindow.reviewEngine.getState().layers.object===current.frozen.alternatives[0].config.layers.object"));
 await ev("document.getElementById('closeEditor').click()");
 check('desktop no overflow',await ev('document.documentElement.scrollWidth<=innerWidth'));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});check('mobile no overflow',await ev('document.documentElement.scrollWidth<=innerWidth'));
 let shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(new URL('../qa-output/review-mobile.png',root),Buffer.from(shot.result.data,'base64'));
 fs.writeFileSync(new URL('../qa-output/browser-report.json',root),JSON.stringify({checks,paidCalls:0},null,2));console.log(JSON.stringify({checks,paidCalls:0}));
} finally {await send('Browser.close');ws.close()}
