import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:8791';
for(const path of ['/owner.html','/owner','/owner/','/index.html','/index','/index/','/']){
 let url=base+path;const chain=[];let res;
 for(let n=0;n<5;n++){res=await fetch(url,{redirect:'manual'});chain.push({path:new URL(url).pathname,status:res.status,location:res.headers.get('location')});if(res.status>=300&&res.status<400&&res.headers.has('location')){url=new URL(res.headers.get('location'),url).href;continue;}break;}
 const html=await res.text();assert.equal(res.status,200,JSON.stringify(chain));assert.match(res.headers.get('content-type'),/text\/html/);assert(html.includes(path.startsWith('/owner')?'id="login"':'id="preview"'));console.log(JSON.stringify(chain));
}
for(const path of ['/studio','/studio/','/studio/index.html','/editor/','/api/studies']){const r=await fetch(base+path,{redirect:'manual'});assert.notEqual(r.status,200);console.log('PRIVATE '+path+' '+r.status);}
console.log('PASS real Wrangler asset redirects: 7 entry paths reach correct HTML; 5 private paths stay closed. No login submitted.');
