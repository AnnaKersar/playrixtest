import {journalEvent} from './experiment-journal.mjs';
export {processingHealth} from './experiment-journal.mjs';

// An observation deadline, not permission to retry or a claim that the isolate died.
export const PROCESSING_DEADLINE_MS = 20 * 60 * 1000;
const token = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,180}$/.test(value) ? value : null;
const pngErrors = new Set(['Invalid PNG','Truncated PNG','PNG CRC','PNG header','Unsupported PNG format','PNG transparency must be RGBA','Incomplete PNG','PNG inflated size','PNG scanline size','PNG filter','Expected native 1376x1536 RGBA8','Missing stored raw PNG','Stored raw SHA mismatch']);
const contractErrors = new Set(['Whole card must be opaque across every pixel; source retained for review','Empty foreground; source retained for review','Foreground includes a canvas-wide matte/background; source retained for review']);
export function safeProcessingError(error, stage = 'processing') {
  // Never log arbitrary exception text: SDK/storage errors can contain URLs, tokens or prompts.
  const message = typeof error?.message === 'string' ? error.message : '';
  if (pngErrors.has(message)) return {code:'PNG_VALIDATION_FAILED',message};
  if (contractErrors.has(message)) return {code:'GENERATION_CONTRACT_FAILED',message};
  if (stage === 'provider_response') {
    const http=/^Provider HTTP ([1-5][0-9]{2});/.exec(message);
    return {code:http?'PROVIDER_HTTP_'+http[1]:'PROVIDER_OUTCOME_UNCONFIRMED',message:http?'Provider returned HTTP '+http[1]+'; billing outcome requires reconciliation.':'Provider request did not return a usable response; billing reconciliation may be required.'};
  }
  const codes={decoding_png:'IMAGE_DECODE_FAILED',resizing_png:'IMAGE_RESIZE_FAILED',encoding_png:'IMAGE_ENCODE_FAILED',raw_r2_write:'RAW_STORAGE_FAILED',receipt_r2_write:'RECEIPT_STORAGE_FAILED',final_r2_write:'FINAL_STORAGE_FAILED',read_raw_receipt:'STORED_RECEIPT_READ_FAILED',receipt_d1_status:'RECEIPT_STATUS_FAILED',final_d1_status:'FINAL_STATUS_FAILED',failure_d1_status:'FAILURE_STATUS_FAILED',finalization_send:'FINALIZATION_SEND_FAILED'};
  if(codes[stage])return {code:codes[stage],message:'The '+stage+' stage failed; inspect the correlated execution events.'};
  return {code:'PROCESSING_STAGE_FAILED',message:'Processing stage failed; inspect the correlated execution events.'};
}
export function createProcessing(env, job, options = {}) {
  const clock = options.clock || Date.now, started = clock(), executionId = crypto.randomUUID();
  let sequence = 0, degraded = false, failedStage = null;
  const base = {version:'processing-diagnostic/v1',run_id:job.run_id,job_id:job.id,attempt_id:job.id,execution_id:executionId,kind:options.kind || 'image',started_at:new Date(started).toISOString(),deadline_at:new Date(started + PROCESSING_DEADLINE_MS).toISOString(),deploy_version:token(env.CF_VERSION_METADATA?.id)};
  const warn = (destination, stage) => {
    degraded = true;
    console.error(JSON.stringify({event:'processing-diagnostic-write-failed',job_id:job.id,execution_id:executionId,stage,destination,code:'DIAGNOSTIC_WRITE_FAILED'}));
  };
  async function event(stage, outcome, detail = {}, processingState = 'running') {
    const now = clock(), seq = ++sequence, data = {...base,sequence:seq,stage,outcome,processing_state:processingState,at:new Date(now).toISOString(),elapsed_ms:now-started,telemetry_degraded:degraded};
    for (const key of ['stage_elapsed_ms','input_bytes','output_bytes','width','height','channels']) if (Number.isFinite(detail[key]) && detail[key] >= 0) data[key] = detail[key];
    if (token(detail.parent_execution_id)) data.parent_execution_id = detail.parent_execution_id;
    if (detail.error) data.error = safeProcessingError(detail.error,stage);
    try {await journalEvent(env,job.id,`processing:${executionId}:${seq}`,'processing_stage',data);}
    catch {warn('D1',stage);data.telemetry_degraded=true;try {await env.ARTIFACTS.put(`processing-diagnostics/${job.id}/${executionId}/${String(seq).padStart(4,'0')}.json`,JSON.stringify(data));} catch {warn('R2-event',stage);}}
    // Preserve the existing progress endpoint; each write is awaited before the next CPU stage.
    data.telemetry_degraded=degraded;
    try {await env.ARTIFACTS.put(`queue-diagnostics/${job.id}.json`,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});} catch {warn('R2-progress',stage);}
  }
  return {
    executionId, event,
    get failedStage() {return failedStage;},
    async stage(name, operation, input = {}, describe = () => ({})) {
      const start = clock();await event(name,'started',input);
      try {const value = await operation();await event(name,'succeeded',{...describe(value),stage_elapsed_ms:clock()-start});return value;}
      catch (error) {failedStage=name;await event(name,'failed',{stage_elapsed_ms:clock()-start,error});throw error;}
    },
    async phase(name, detail = {}) {if(detail.outcome === 'failed')failedStage=name;await event(name,detail.outcome || 'started',detail);},
    async journal(key,type,data) {
      try {await journalEvent(env,job.id,key,type,data);}
      catch {warn('D1-journal',type);await event('journal_write','failed',{},'running');}
    },
    async end(state,error) {await event(state,state==='complete'?'succeeded':state==='waiting_finalization'?'succeeded':'failed',error?{error}:{},state==='waiting_finalization'?'waiting':state==='complete'?'complete':'failed');}
  };
}
