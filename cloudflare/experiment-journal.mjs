import {sha} from './provider.mjs';
export function processingHealth(snapshot, now = Date.now()) {
 if (!snapshot?.execution_id || !snapshot.deadline_at) return snapshot;
 const deadline = Date.parse(snapshot.deadline_at);
 const stale = ['running','waiting'].includes(snapshot.processing_state) && Number.isFinite(deadline) && now > deadline;
 return {...snapshot,stale,...(stale?{processing_outcome:'unconfirmed',stale_reason:'deadline_elapsed_without_terminal_event',automatic_retry_allowed:false}:{})};
}
export function processingExecutions(events, now = Date.now()) {
 const latest=new Map(),received=new Set();
 for(const event of events){
  if(event.event_type!=='processing_stage')continue;
  const data=event.payload||JSON.parse(event.payload_json);
  if(data.stage==='finalization_receive'&&data.parent_execution_id)received.add(data.parent_execution_id);
  if(!data.execution_id||!Number.isInteger(data.sequence))continue;
  if(!latest.has(data.execution_id)||latest.get(data.execution_id).sequence<data.sequence)latest.set(data.execution_id,data);
 }
 // Retain every execution, including one whose latest progress was overwritten by a duplicate.
 return [...latest.values()].map(data=>processingHealth(received.has(data.execution_id)&&data.processing_state==='waiting'?{...data,processing_state:'handed_off'}:data,now));
}
const idOK=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(s);
export function experimentContext(body={}){
 const value={};for(const k of ['hypothesis','changes','test_method','retry_of']){const v=body[k];if(v!==undefined&&(typeof v!=='string'||v.length>8000))throw Object.assign(Error('Invalid experiment '+k),{status:400});value[k]=v?.trim()||null;}
 return {...value,hypothesis_status:value.hypothesis?'provided':'missing',public:false};
}
export async function journalPrepare(env,id,input){
 if(!idOK(id))throw Error('Invalid journal attempt ID');const payload=JSON.stringify(input),hash=await sha(payload);
 await env.DB.prepare('INSERT OR IGNORE INTO experiment_journal (attempt_id,input_json,input_sha256,created_at) VALUES (?,?,?,?)').bind(id,payload,hash,new Date().toISOString()).run();
 const row=await env.DB.prepare('SELECT input_sha256 FROM experiment_journal WHERE attempt_id=?').bind(id).first();if(row?.input_sha256!==hash)throw Error('Immutable experiment input conflict');
 return hash;
}
export async function journalEvent(env,id,key,type,data={}){
 const payload=JSON.stringify(data),hash=await sha(payload),eventId=id+':'+key;
 await env.DB.prepare('INSERT OR IGNORE INTO experiment_journal_events (event_id,attempt_id,event_type,payload_json,payload_sha256,created_at) VALUES (?,?,?,?,?,?)').bind(eventId,id,type,payload,hash,new Date().toISOString()).run();
 const row=await env.DB.prepare('SELECT payload_sha256,event_type FROM experiment_journal_events WHERE event_id=?').bind(eventId).first();if(row?.payload_sha256!==hash||row?.event_type!==type)throw Error('Immutable journal event conflict');return eventId;
}
export async function journalRead(env,id){
 if(!idOK(id))throw Object.assign(Error('Invalid attempt ID'),{status:400});const input=await env.DB.prepare('SELECT * FROM experiment_journal WHERE attempt_id=?').bind(id).first();if(!input)throw Object.assign(Error('Journal not found'),{status:404});
 const events=(await env.DB.prepare('SELECT * FROM experiment_journal_events WHERE attempt_id=? ORDER BY created_at,event_id').bind(id).all()).results;
 const parsed=events.map(e=>({...e,payload:JSON.parse(e.payload_json),payload_json:undefined}));
 const providerStage=outcome=>parsed.some(e=>e.event_type==='processing_stage'&&e.payload.stage==='provider_response'&&e.payload.outcome===outcome);
 const started=events.some(e=>e.event_type==='provider_started')||providerStage('started'),settled=events.some(e=>['provider_returned','provider_failed','storage_recovered'].includes(e.event_type))||providerStage('succeeded');
 return {version:'experiment-journal/v1',input:JSON.parse(input.input_json),input_sha256:input.input_sha256,created_at:input.created_at,events:parsed,processing_executions:processingExecutions(parsed),unresolved_provider_outcome:started&&!settled,public:false};
}
export async function journalFeedback(env,body){
 if(!idOK(body.attemptId)||!idOK(body.eventId)||typeof body.feedback!=='string'||body.feedback.length>8000||!['accepted','rejected','undecided'].includes(body.decision))throw Object.assign(Error('Invalid experiment feedback'),{status:400});
 await journalRead(env,body.attemptId);await journalEvent(env,body.attemptId,'feedback:'+body.eventId,'owner_feedback',{feedback:body.feedback,decision:body.decision});return {saved:true,public:false};
}
