export function createCardBatchRunner({read,save,api,track,canStart=()=>true}){
 let busy=false;
 return async function check(){
 if(busy)return;busy=true;
 try{
 const state=read(),task=state.tasks?.find(t=>!['complete','failed','needs_review','cancelled'].includes(t.status));if(!task)return;
 if(!task.runId&&!canStart())return;
 if(task.runId){const result=await api('/api/run?compact=1&run='+encodeURIComponent(task.runId)),job=result.jobs?.find(j=>j.id===task.editJobId);if(job&&job.status!==task.status){task.status=job.status;save(state);}return;}
 const context=await api('/api/card-editor?job='+encodeURIComponent(task.sourceJobId)),prior=context.versions?.find(v=>v.request_key===task.requestId);
 let result=prior?{runId:prior.run_id,jobId:prior.edit_job_id}:null;
 if(!result)result=await api(task.kind==='replace'?'/api/card-subject-edit':'/api/card-edit',{jobId:task.sourceJobId,requestId:task.requestId,...(task.kind==='replace'?{planId:task.planId,approval:'I approve one paid subject replacement'}:{note:task.note||'',approval:'I approve one paid card edit'})});
 task.runId=result.runId;task.editJobId=result.jobId;task.status='running';save(state);track({runId:task.runId,jobId:task.editJobId,sourceJobId:task.sourceJobId});
 }catch(e){const state=read(),task=state.tasks?.find(t=>!['complete','failed','needs_review','cancelled'].includes(t.status));if(task){const terminal=e.status>=400&&e.status<500&&![408,429].includes(e.status)&&!(e.status===409&&/billing|budget|reconciliation|лимит|бюджет|учёт|учет|выполняется/i.test(e.message));task.error=e.message;if(terminal)task.status='failed';save(state);}}finally{busy=false;}
 };
}
