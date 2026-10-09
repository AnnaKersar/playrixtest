const enc=new TextEncoder();
const response=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const cookie=(value,age)=>`__Host-card_owner=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
async function key(env){if(typeof env.OWNER_PASSCODE!=='string'||env.OWNER_PASSCODE.length===0)throw Error('Owner passcode Secret not configured');return crypto.subtle.importKey('raw',enc.encode(env.OWNER_PASSCODE),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function limited(env,ip){const now=Math.floor(Date.now()/1000);for(const[bucket,limit,expiry]of [['owner-global:'+Math.floor(now/60),20,now+120],['owner-ip:'+(await hash(ip)).slice(0,32)+':'+Math.floor(now/900),5,now+1800]]){const r=await env.DB.prepare('INSERT INTO guest_throttle VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 WHERE hits<?').bind(bucket,expiry,limit).run();if(!r.meta.changes)return false;}return true;}
export async function ownerIdentity(request,env){
 try{if(!env.DB)return null;const raw=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-card_owner=([a-f0-9]{64})(?:;|$)/)?.[1];if(!raw)return null;const now=Math.floor(Date.now()/1000);const row=await env.DB.prepare('SELECT expires_at FROM owner_sessions WHERE session_hash=? AND expires_at>?').bind(await hash(raw),now).first();return row?{principalId:'owner',role:'owner',ownerSession:raw}:null;}catch{return null;}
}
export async function ownerLogin(request,env){
 const origin=new URL(request.url).origin;if(request.method!=='POST'||request.headers.get('Origin')!==origin)return response({error:'Same-origin POST required'},403);
 if(!env.DB)return response({error:'Owner session storage not configured'},503);const ip=request.headers.get('CF-Connecting-IP');if(!ip)return response({error:'Trusted edge client address unavailable'},503);
 let k;try{k=await key(env);}catch{return response({error:'OWNER_PASSCODE Secret must be nonempty'},503);}
 if(!await limited(env,ip))return response({error:'Too many login attempts; try later'},429,{'Retry-After':'900'});
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return response({error:'JSON required'},415);
 const reader=request.body?.getReader();if(!reader)return response({error:'Invalid login'},400);let count=0;const chunks=[];while(true){const{value,done}=await reader.read();if(done)break;count+=value.length;if(count>4096){await reader.cancel();return response({error:'Invalid login'},400);}chunks.push(value);}
 let pass;try{pass=JSON.parse(await new Blob(chunks).text()).passcode;}catch{return response({error:'Invalid login'},400);}if(typeof pass!=='string'||pass.length===0||pass.length>1024)return response({error:'Invalid login'},400);
 // Native HMAC verify performs the comparison; no early-exit plaintext equality.
 const expected=await crypto.subtle.sign('HMAC',k,enc.encode('owner-passcode/v1|'+env.OWNER_PASSCODE));if(!await crypto.subtle.verify('HMAC',k,expected,enc.encode('owner-passcode/v1|'+pass)))return response({error:'Invalid owner code'},401);
 // A random opaque token is independent of password entropy; only its hash is persisted.
 const now=Math.floor(Date.now()/1000),nonce=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');await env.DB.prepare('INSERT INTO owner_sessions VALUES (?,?)').bind(await hash(nonce),now+3600).run();return response({role:'owner',expires_in:3600},200,{'Set-Cookie':cookie(nonce,3600)});
}
export async function ownerLogout(request,env){if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin)return response({error:'Same-origin POST required'},403);const identity=await ownerIdentity(request,env);if(identity)await env.DB.prepare('DELETE FROM owner_sessions WHERE session_hash=?').bind(await hash(identity.ownerSession)).run();return response({signed_out:true},200,{'Set-Cookie':cookie('',0)});}
