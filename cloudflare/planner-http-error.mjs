export async function plannerHTTPError(response){
 let payload=null;try{payload=await response.json();}catch{}
 const safe=v=>typeof v==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(v)?v:null;
 const code=safe(payload?.error?.code),type=safe(payload?.error?.type),request_id=safe(response.headers.get('x-request-id'));
 const reason=code==='insufficient_quota'||type==='insufficient_quota'||/credit|billing|spend_limit|usage_limit|quota/.test(code||'')?'quota':code==='rate_limit_exceeded'||code==='slow_down'||type==='rate_limit_error'?'rate_limit':'unknown';
 const message=reason==='quota'?'OpenAI: недостаточно баланса или достигнут лимит расходов. Проверьте оплату и лимиты API.':reason==='rate_limit'?'OpenAI: временный лимит частоты запросов. Попробуйте запустить план позже.':'OpenAI вернул HTTP '+response.status+'. Причина не уточнена; проверьте баланс и лимиты API.';
 return Object.assign(Error(message),{planner_rejection:response.status===429,provider_error:{http_status:response.status,code,type,reason,request_id,retry_after:response.headers.get('retry-after')?.slice(0,80)||null,message}});
}
