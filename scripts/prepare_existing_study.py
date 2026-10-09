"""Prepare private R2 files and D1 INSERTs locally. Never uploads or executes remote SQL."""
import json,hashlib,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
src=root/'private/site-migration'
out=src/'prepared';out.mkdir(exist_ok=True)
dataset_path=src/'data/refs50-dataset.json'
dataset=json.loads(dataset_path.read_text(encoding='utf-8-sig'))
study=dataset['studyId'];prefix='imported/'+study
objects=dataset['objects'];assert len(objects)==20
assert sum(map(len,dataset['frozenCandidates'].values()))==60
feedback=json.loads((src/'source-feedback-bounded.json').read_text(encoding='utf-8'))
trials=[r for p in feedback['trials_pages'] for r in p['rows'] if r['study_id']==study]
assert len(trials)==20 and len({t['user_key'] for t in trials})==1
assert all(len(dataset['frozenCandidates'][o['objectId']])==3 for o in objects)
sha=lambda b:hashlib.sha256(b).hexdigest()
compact=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'))
quote=lambda v:"'"+str(v).replace("'","''")+"'" if v is not None else 'NULL'
sql=[];assets=[];records=[]
def asset(key,data):
 p=out/key;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 assets.append({'key':key,'path':str(p.relative_to(out)).replace('\\','/'),'sha256':sha(data),'bytes':len(data)})
def insert(table,columns,values):
 records.append({'table':table,'columns':columns,'values':values})
 sql.append('INSERT OR IGNORE INTO '+table+' ('+','.join(columns)+') VALUES ('+','.join(quote(v) for v in values)+');')
frozen=dataset_path.read_bytes();frozen_key=prefix+'/frozen.json';asset(frozen_key,frozen)
insert('runs',['id','mode','name','frozen_key','frozen_sha','created_at','principal_id'],[study,'imported-v9',dataset['title'],frozen_key,sha(frozen),min(t['created_at'] for t in trials),'owner'])
for obj in objects:
 oid=obj['objectId'];job=oid;binary=(src/'public'/obj['path'].lstrip('/')).read_bytes();assert sha(binary)==obj['sha256']
 image_key=prefix+'/'+oid+'.png';asset(image_key,binary)
 manifest={'version':'imported-image/v1','final':[860,960],'final_sha256':obj['sha256'],'alpha':'original-RGBA','source':obj,'studyId':study,'renderer':dataset['editor'],'generated':False}
 manifest_key=prefix+'/'+oid+'.json';asset(manifest_key,compact(manifest).encode())
 insert('jobs',['id','run_id','object_id','status'],[job,study,obj['name'],'complete'])
 insert('results',['job_id','raw_key','final_key','manifest_key'],[job,image_key,image_key,manifest_key])
 alternatives=compact(dataset['frozenCandidates'][oid]);insert('candidates',['job_id','payload','payload_sha'],[job,alternatives,sha(alternatives.encode())])
 trial=next(t for t in trials if t['object_id']==oid);diag=json.loads(trial['diagnostics_json'])
 payload=compact({'action':trial['status'],'selected':trial['selected_id'],'diagnostics':diag,'material':diag.get('objectMaterial',{}),'sourceTrialId':trial['id'],'sourceRevision':trial['revision']})
 insert('choices_v2',['principal_id','job_id','revision','payload'],['owner',job,trial['revision'],payload])
 # Preserve full original event rows separately; do not fabricate hashes or rewrite their semantics.
asset(prefix+'/source-feedback-bounded.json',(src/'source-feedback-bounded.json').read_bytes())
(out/'import-existing-study.sql').write_text('\n'.join(sql)+'\n',encoding='utf-8')
report={'version':'private-migration/v1','studyId':study,'objects':20,'alternatives':60,'choices':20,'assets':assets,'uploaded':False,'feedbackLimit':'Source frozen_json fields are truncated by the read-only tool; dataset alternatives preserved separately. Full source export still required for complete original trial/display-order archive.','budgetChanged':False}
(out/'upload-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'objects':20,'alternatives':60,'choices':20,'privateFiles':len(assets),'uploaded':False,'budgetChanged':False}))

editor=root/'private/worker-editor-package';em=json.loads((editor/'manifest.json').read_text())
for f in em['files']:asset(f['key'],(editor/f['name']).read_bytes())
asset('editor/v9/manifest.json',(editor/'manifest.json').read_bytes())
package={'version':'private-import/v1','studyId':study,'files':[{k:a[k] for k in ['key','sha256','bytes']} for a in assets],'records':records}
(out/'private-import.json').write_text(json.dumps(package,ensure_ascii=False),encoding='utf-8')
