import {Buffer} from 'node:buffer';
export const IMAGE_MODEL = 'gpt-image-2.5-sunburst-2026-09-08';
export const PROVIDER_VERSION = 'openai-image-edit/v1';
export const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?new TextEncoder().encode(bytes):bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export function usageCost(usage) {
  const text=usage?.input_tokens_details?.text_tokens,image=usage?.input_tokens_details?.image_tokens,output=usage?.output_tokens;
  if (![text,image,output,usage?.input_tokens,usage?.total_tokens].every(n=>Number.isSafeInteger(n)&&n>=0)||text+image!==usage.input_tokens||usage.input_tokens+output!==usage.total_tokens)return null;
  const value=text*5000+image*8000+output*30000;return Number.isSafeInteger(value)?value:null;
}
export async function imageRequest(env,prompt,sheets,fetcher=fetch,options={}) {
  if(env.LIVE_GENERATION_ENABLED!=='true'||!env.OPENAI_API_KEY)throw Error('Live provider disabled');
  if(sheets.length!==13)throw Error('Exactly 13 sheets required');
  const background=options.background||'transparent';if(!['transparent','opaque'].includes(background))throw Error('Invalid background mode');
  const size=options.size||'1376x1536';if(!['1376x1536','864x960'].includes(size))throw Error('Invalid requested image size');
  const body=new FormData();for(const[k,v]of Object.entries({model:IMAGE_MODEL,n:'1',size,quality:'medium',background,output_format:'png',prompt}))body.append(k,v);
  if(options.sourceImage){if(!(options.sourceImage instanceof Uint8Array)||options.sourceImage.length>25*1024*1024)throw Error('Invalid edit source');body.append('image[]',new Blob([options.sourceImage],{type:'image/png'}),'card-to-edit.png');}
  sheets.forEach((bytes,i)=>body.append('image[]',new Blob([bytes],{type:'image/png'}),`sheet-${i+1}.png`));
  // Exactly one send. No SDK retries, redirects, alternative models or replay after timeout.
  const stage=options.stage||((name,operation)=>operation());
  const response=await stage('provider_http_wait',()=>fetcher('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body,redirect:'manual',signal:AbortSignal.timeout(240000)}),{},r=>({http_status:r.status,request_id:r.headers.get('x-request-id')}));
  if(response.status>=300&&response.status<400)throw Error('Provider redirect rejected');
  const requestId=response.headers.get('x-request-id');
  if(!response.ok)throw Error(`Provider HTTP ${response.status}; request ${requestId||'unknown'}`);
  const payload=await stage('provider_json_read',()=>response.json(),{request_id:requestId}),base64=payload?.data?.[0]?.b64_json;
  if(typeof base64!=='string'||base64.length>34*1024*1024||payload.data.length!==1)throw Error('Invalid image response');
  const png=await stage('provider_base64_decode',async()=>Buffer.from(base64,'base64'),{base64_characters:base64.length,request_id:requestId},bytes=>({output_bytes:bytes.length}));
  return {png,usage:payload.usage||null,model:payload.model||null,requestId};
}

