import {sha} from './provider.mjs';
const allowed=new Set(['index.html','direction-v8.js','core-v9.js']);
export async function privateEditor(request,env){
 if(!env.ARTIFACTS||!env.EDITOR_MANIFEST_KEY||!env.EDITOR_MANIFEST_SHA256)return Response.json({error:'Private editor package not provisioned'},{status:503});
 const pathname=new URL(request.url).pathname,name=pathname==='/editor/'?'index.html':pathname.slice('/editor/'.length);if(!allowed.has(name))return new Response('Not found',{status:404});
 const object=await env.ARTIFACTS.get(env.EDITOR_MANIFEST_KEY);if(!object)return new Response('Missing private manifest',{status:503});const text=await object.text();if(await sha(text)!==env.EDITOR_MANIFEST_SHA256)return new Response('Private manifest pin mismatch',{status:503});const m=JSON.parse(text);
 if(m.version!=='private-editor/v1'||!Array.isArray(m.files))return new Response('Invalid private package',{status:503});const file=m.files.find(f=>f.name===name);if(!file||!file.key.startsWith('editor/v9/'))return new Response('Invalid package entry',{status:503});
 const asset=await env.ARTIFACTS.get(file.key);if(!asset)return new Response('Missing private package entry',{status:503});const bytes=await asset.arrayBuffer();if(bytes.byteLength!==file.bytes||await sha(bytes)!==file.sha256)return new Response('Private package integrity failure',{status:503});
 return new Response(bytes,{headers:{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':m.csp,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
