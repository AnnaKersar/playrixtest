// Public synthetic editor only. No auth fallback and no private/backend routes.
const paths=new Set(['/','/index.html','/demo.js','/demo.css']);
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(!['GET','HEAD'].includes(request.method))return new Response('Backend mutations are disabled in public demo.',{status:403,headers});
  if(!paths.has(url.pathname))return new Response('Private assets and backend APIs are unavailable in public demo.',{status:403,headers});
  if(!env.ASSETS)return new Response('Public demo assets are not configured.',{status:503,headers});
  const asset=await env.ASSETS.fetch(request),out=new Headers(asset.headers);for(const[k,v]of Object.entries(headers))out.set(k,v);return new Response(request.method==='HEAD'?null:asset.body,{status:asset.status,headers:out});
 },
 async queue(){throw Error('Public demo cannot process provider jobs.');}
};
