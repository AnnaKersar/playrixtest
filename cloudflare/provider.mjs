export const IMAGE_MODEL = 'gpt-image-2.5-sunburst-2026-09-08';
export const PROVIDER_VERSION = 'openai-image-edit/v1';
export const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?new TextEncoder().encode(bytes):bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export function usageCost(usage) {
  const text=usage?.input_tokens_details?.text_tokens,image=usage?.input_tokens_details?.image_tokens,output=usage?.output_tokens;
  if (![text,image,output,usage?.input_tokens,usage?.total_tokens].every(n=>Number.isSafeInteger(n)&&n>=0)||text+image!==usage.input_tokens||usage.input_tokens+output!==usage.total_tokens)return null;
  const value=text*5000+image*8000+output*30000;return Number.isSafeInteger(value)?value:null;
}
export async function imageRequest(env,prompt,sheets,fetcher=fetch) {
  if(env.LIVE_GENERATION_ENABLED!=='true'||!env.OPENAI_API_KEY)throw Error('Live provider disabled');
  if(sheets.length!==13)throw Error('Exactly 13 sheets required');
  const body=new FormData();for(const[k,v]of Object.entries({model:IMAGE_MODEL,n:'1',size:'1376x1536',quality:'medium',background:'transparent',output_format:'png',prompt}))body.append(k,v);
  sheets.forEach((bytes,i)=>body.append('image[]',new Blob([bytes],{type:'image/png'}),`sheet-${i+1}.png`));
  // Exactly one send. No SDK retries, redirects, alternative models or replay after timeout.
  const response=await fetcher('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body,redirect:'error',signal:AbortSignal.timeout(240000)});
  const requestId=response.headers.get('x-request-id');
  if(!response.ok)throw Error(`Provider HTTP ${response.status}; request ${requestId||'unknown'}`);
  const payload=await response.json(),base64=payload?.data?.[0]?.b64_json;
  if(typeof base64!=='string'||base64.length>34*1024*1024||payload.data.length!==1)throw Error('Invalid image response');
  return {png:Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),usage:payload.usage||null,model:payload.model||null,requestId};
}
