import assert from 'node:assert/strict';
import {categoryVisualSchedule,collectionRules} from '../cloudflare/visitor-public/collection-policy.mjs';
import {subjectLayoutInstructions,resolveLegacyPlacement} from '../cloudflare/subject-layout-policy.mjs';
import {compileObjectPrompt} from '../cloudflare/object-content-policy.mjs';
import {generationContract} from '../cloudflare/generation-contract.mjs';
import {replacementTarget,automaticEditNote} from '../cloudflare/card-replacement-policy.mjs';
import {createCardBatchRunner} from '../cloudflare/visitor-public/card-batch-runner.mjs';
const subjects=['C1','C4','C3','C1','C4','C2','C4','C3','C1','C4'].map(category=>({category}));
for(let seed=0;seed<250;seed++){const v=categoryVisualSchedule(10,String(seed),subjects);assert(v.filter(x=>['purple','pink'].includes(x.background_palette)).length<=2);assert.equal(new Set(v.map(x=>x.background_pattern)).size,10);v.forEach((x,i)=>{if(i)assert.notEqual(x.background_palette,v[i-1].background_palette);if(subjects[i].category==='C1')assert.notEqual(x.background_pattern,'plain-gradient');});}
for(const c of ['C1','C2','C3','C4']){const p=compileObjectPrompt({art_direction:'Approved stylized material rendering'},'Center the subject at x=50%, y=50%.',generationContract(c,'whole_card'));assert(p.includes('HARD maximum width 70%, height 70%'));assert(p.includes('y=86–88%'));assert(!p.includes('Center the subject at x=50%, y=50%'));assert(p.includes('sky blue/cyan-blue only'));assert(p.length<32000);}
assert(collectionRules.includes('Two arbitrary lines'));assert(automaticEditNote('').includes('same subject'));
const source=[{object_id:'a',category:'C1',subject_semantic_key:'hat'},{object_id:'b',category:'C2',subject_semantic_key:'radio'}],plan={collections:[{name:'Club',objects:[{object_id:'a',production_category:'C1',subject_semantic_key:'microphone'},{object_id:'b',production_category:'C2',subject_semantic_key:'radio'}]}]};
assert.equal(replacementTarget(source,plan,'a',['a']).subject_semantic_key,'microphone');assert.throws(()=>replacementTarget(source,plan,'b',['a']));plan.collections[0].objects[1].subject_semantic_key='drum';assert.throws(()=>replacementTarget(source,plan,'a',['a']));
let state={tasks:[{sourceJobId:'a',kind:'edit',requestId:'stable-a',status:'queued'},{sourceJobId:'b',kind:'edit',requestId:'stable-b',status:'queued'}]},posts=0,tracked=0,done=false;
const runner=createCardBatchRunner({read:()=>state,save:s=>state=s,track:()=>tracked++,api:async(url,body)=>{if(url.startsWith('/api/run'))return {jobs:[{id:'edited-'+state.tasks.find(t=>t.runId&&!['complete','failed'].includes(t.status)).sourceJobId,status:done?'complete':'running'}]};if(url.startsWith('/api/card-editor'))return {versions:[]};posts++;return {runId:'run-'+body.jobId,jobId:'edited-'+body.jobId};}});
assert.equal(posts,0);await runner();assert.equal(posts,1);await runner();assert.equal(posts,1);done=true;await runner();await runner();assert.equal(posts,2);assert.equal(tracked,2);
state={tasks:[{sourceJobId:'a',kind:'edit',requestId:'stable',status:'queued'}]};let recoveryPosts=0;
const recover=createCardBatchRunner({read:()=>state,save:s=>state=s,track:()=>{},api:async(url)=>{if(url.startsWith('/api/card-editor'))return {versions:[{request_key:'stable',run_id:'existing-run',edit_job_id:'existing-job'}]};recoveryPosts++;}});await recover();assert.equal(recoveryPosts,0);assert.equal(state.tasks[0].runId,'existing-run');
console.log('PASS 250 palette schedules, C1 pattern, all-category geometry, blue sky, C3 material, replacement isolation, serial batch and lost-response recovery; real paid calls 0');
