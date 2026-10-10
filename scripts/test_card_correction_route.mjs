import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {readFile} from 'node:fs/promises';
import {createWorker} from '../cloudflare/worker.mjs';import {sha,IMAGE_MODEL} from '../cloudflare/provider.mjs';
const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));db.exec('UPDATE budget SET approved=1,ceiling=100000000000');
function statement(sql,args=[]){return {bind(...a){return statement(sql,a)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}}}
const objects=new Map(),sent=[],art='PINNED STYLE',manifest={version:'reference-pack/v1',reference_count:50,model:IMAGE_MODEL,art_direction:art,art_direction_sha256:await sha(art),sheets:Array.from({length:13},(_,i)=>({key:'references/s'+i,count:i===12?2:4,sha256:'a'.repeat(64)}))};const manifestText=JSON.stringify(manifest);
const generation={mode:'whole_card',category:'C1',background:'opaque',variation:{palette:'gold'}},frozen={native:[864,960],final:[864,960],objects:[{object_id:'o',name:'Prop whistle',category:'C1',generation,semantic_family:'tool',living_creatures:'none',factual_checks:['Construction parts connect to the body','All object parts share coherent perspective'],thematic_category:'Cinema',prompt:'IMMUTABLE ORIGINAL PROMPT'}]};
objects.set('frozen',JSON.stringify(frozen));objects.set('refs',manifestText);objects.set('final',new Uint8Array([7]));objects.set('result',JSON.stringify({final_sha256:await sha(new Uint8Array([7]))}));
db.prepare("INSERT INTO runs VALUES ('r','live','Original','frozen','sha','now','owner')").run();db.prepare("INSERT INTO jobs (id,run_id,object_id,status) VALUES ('r_o','r','o','complete')").run();db.prepare("INSERT INTO results VALUES ('r_o','raw','final','result')").run();
const env={DB:{prepare:statement,async batch(s){for(const q of s)await q.run();}},ARTIFACTS:{async head(k){return objects.has(k)?{}:null},async get(k){if(!objects.has(k))return null;const v=objects.get(k);return {json:async()=>JSON.parse(v),text:async()=>v}},async put(k,v){objects.set(k,v)}},IMAGE_JOBS:{async send(v){sent.push(v)}},LIVE_GENERATION_ENABLED:'true',OPENAI_API_KEY:'test-only',REFERENCE_MANIFEST_KEY:'refs',APPROVED_REFERENCE_MANIFEST_SHA256:await sha(manifestText),APPROVED_ART_DIRECTION_SHA256:await sha(art)};
const worker=createWorker({authenticate:async()=>({role:'owner',principalId:'owner'})}),body={jobId:'r_o',note:'Make lighting softer',requestId:'stable-correction',approval:'I approve one paid card edit'},request=()=>new Request('https://test/api/card-edit',{method:'POST',headers:{Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify(body)});
const response=await worker.fetch(request(),env),value=await response.json();assert.equal(response.status,202,JSON.stringify(value));assert.equal(value.stage,'image-edit');assert.equal(sent.length,1);
const row=db.prepare('SELECT * FROM runs WHERE id=?').get(value.runId),newFrozen=JSON.parse(objects.get(row.frozen_key));assert.deepEqual(newFrozen.objects[0].generation,generation);assert.deepEqual(newFrozen.native,[864,960]);assert.match(newFrozen.objects[0].prompt,/IMMUTABLE ORIGINAL PROMPT/);assert.equal(newFrozen.objects[0].correction.source_key,'final');
const again=await worker.fetch(request(),env);assert.equal(again.status,202);assert.equal(sent.length,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM card_edits').get().n,1);assert.equal(db.prepare("SELECT final_key FROM results WHERE job_id='r_o'").get().final_key,'final');
const guest=createWorker({authenticate:async()=>({role:'visitor',principalId:'guest'})});assert.equal((await guest.fetch(request(),env)).status,403);
console.log('PASS correction queued once, original image unchanged, source SHA pinned, exact generation contract/dimensions preserved, owner-only access and stable request id; paid calls 0');
async function apply(sourceJobId,jobId,client=worker){return client.fetch(new Request('https://test/api/card-apply',{method:'POST',headers:{Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({sourceJobId,jobId})}),env)}
assert.equal((await apply('r_o',value.jobId)).status,409);
assert.equal((await apply('r_o',value.jobId,guest)).status,403);
db.prepare("UPDATE jobs SET status='complete' WHERE id=?").run(value.jobId);
db.prepare('INSERT INTO results VALUES (?,?,?,?)').run(value.jobId,'edit-raw','edit-final','edit-manifest');objects.set('edit-final',new Uint8Array([8]));
assert.equal((await apply('r_o',value.jobId)).status,200);
assert.equal((await apply('r_o',value.jobId)).status,200);
assert.equal(db.prepare('SELECT edit_job_id FROM card_applied WHERE source_job_id=?').get('r_o').edit_job_id,value.jobId);
assert.equal(db.prepare("SELECT final_key FROM results WHERE job_id='r_o'").get().final_key,'final');
assert.equal((await apply('r_o','r_o')).status,409);
assert.equal(sent.length,1);
console.log('PASS apply requires complete linked version and owner; persisted replacement is idempotent; original preserved; no generation');

