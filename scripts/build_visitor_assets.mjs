import {mkdir,readFile,writeFile} from 'node:fs/promises';
const out='cloudflare/visitor-public';await mkdir(out+'/studio',{recursive:true});
for(const name of ['index.html','demo.js','demo.css','owner.html','owner.js','archive.html','archive.js','archive.css'])await writeFile(out+'/'+name,await readFile('cloudflare/public-demo/'+name));
for(const name of ['index.html','app.js','style.css','editor-bridge.js','archive-import.html','archive-import.js','private-import.html','private-import.js']){let text=await readFile('cloudflare/public/'+name,'utf8');if(name==='index.html')text=text.replace('href="/style.css"','href="/studio/style.css"').replace('src="/app.js"','src="/studio/app.js"');await writeFile(out+'/studio/'+name,text);}
console.log('Built allowlisted code-only assets; no private package, references or results copied.');
