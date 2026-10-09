import base64, copy, hashlib, html, io, json, os, re, sqlite3, time, uuid, zipfile
from decimal import Decimal
from pathlib import Path
from contextlib import contextmanager
from PIL import Image, ImageDraw

MODEL = 'gpt-image-2.5-sunburst-2026-09-08'
AD_HASH = os.environ.get('STUDIO_APPROVED_AD_SHA256') # private approved pin; no real contract in public code
SYNTHETIC_STYLE = 'Synthetic offline fixture: simple rounded toy shapes, clear color blocks, no external artwork.'
NOW = lambda: time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
def sha(data): return hashlib.sha256(data).hexdigest()
def encoded(obj): return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
def atomic(path, data):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    with tmp.open('wb') as f: f.write(data); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)
def write_json(path, obj): atomic(path, encoded(obj))
def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value): raise ValueError('Invalid ID')
    return value

def validate_spec(spec):
    if spec['model'] != MODEL or spec['size'] != '1376x1536' or spec['quality'] != 'medium' or spec['background'] != 'transparent' or spec['final_size'] != [860,960]: raise ValueError('Frozen generation settings changed')
    expected=sha(SYNTHETIC_STYLE.encode()) if spec.get('contract_id')=='synthetic-fixture-v1' else AD_HASH
    if sha(spec['shared_style_block'].encode()) != expected or spec['shared_style_sha256'] != expected: raise ValueError('Art Direction integrity')
    if sha(spec['generalized_rules'].encode()) != spec['generalized_rules_sha256']: raise ValueError('Rules integrity')
    refs=spec['references']; sheets=spec['input_sheets']
    primary='SYNTHETIC-PRIMARY' if spec.get('contract_id')=='synthetic-fixture-v1' else os.environ.get('STUDIO_PRIMARY_REFERENCE_ID')
    if len(refs)!=50 or len(sheets)!=13 or refs[0]['id']!=primary: raise ValueError('50 references / 13 sheets / approved first reference required')
    if len({x['id'] for x in refs})!=50: raise ValueError('Duplicate references')
    members=[m['id'] for s in sheets for m in s['members']]
    if members != [r['id'] for r in refs] or [len(s['members']) for s in sheets] != [4]*12+[2]: raise ValueError('Sheet membership changed')
    if len(spec['objects'])!=20 or len({o['object_id'] for o in spec['objects']})!=20: raise ValueError('20 unique objects required')
    for obj in spec['objects']:
        identifier(obj['object_id'])
        if sha(obj['prompt'].encode()) != obj['prompt_sha256']: raise ValueError('Prompt hash mismatch')
        if not obj['prompt'].startswith('MAIN ART DIRECTION\n'+spec['shared_style_block']+'\n\nGENERALIZED RENDERING RULES V1\n'+spec['generalized_rules']): raise ValueError('Prompt order changed')
    return spec

def compile_briefs(frozen, briefs):
    """Deterministic compiler; no paid planner needed for unchanged approved style."""
    validate_spec(frozen)
    if len(briefs)!=20: raise ValueError('Expected 20 briefs')
    prefix=frozen['objects'][0]['prompt'].split('\n\nOBJECT: ',1)[0]
    spec=copy.deepcopy(frozen); spec['objects']=[]
    for o in briefs:
        identifier(o['object_id'])
        if not isinstance(o['name'],str) or not isinstance(o['brief'],str) or not o['name'].strip() or not o['brief'].strip(): raise ValueError('Name and brief required')
        prompt=prefix+'\n\nOBJECT: '+o['name']+'\n'+o['brief']
        details=o.get('semantic_details')
        if details is not None:
            if set(details)!={'detail_budget','purpose','contents','decorations','accessories','theme'}:raise ValueError('Explicit semantic detail fields required')
            if type(details['detail_budget']) is not int or not 0<=details['detail_budget']<=8:raise ValueError('Detail budget 0..8')
            if not isinstance(details['purpose'],str) or not isinstance(details['theme'],str):raise ValueError('Purpose/theme must be text')
            for k in ['contents','decorations','accessories']:
                if not isinstance(details[k],list) or any(not isinstance(x,str) or not x.strip() for x in details[k]):raise ValueError('Explicit detail lists required')
            if sum(len(details[k]) for k in ['contents','decorations','accessories'])>details['detail_budget']:raise ValueError('Semantic detail budget exceeded')
            prompt+='\n\nEXPLICIT SEMANTIC DETAILS V1\n'+encoded(details).decode()+'\nInclude only these specified additions. Empty lists mean no additions; do not fill all containers or decorate all objects automatically.'
        spec['objects'].append({**o,'prompt':prompt,'prompt_sha256':sha(prompt.encode())})
    return validate_spec(spec)

def build_sheets(spec, source_dir):
    validate_spec(spec); sources={}; result={}
    for ref in spec['references']:
        data=(Path(source_dir)/(identifier(ref['id'])+'.png')).read_bytes()
        if sha(data)!=ref['sha256']: raise ValueError('Reference hash mismatch: '+ref['id'])
        sources[ref['id']]=data
    for sheet in spec['input_sheets']:
        if (sheet['width'],sheet['height'])!=(896,1040) or len(sheet['members'])!=len(sheet['labels_png_base64']): raise ValueError('Sheet layout')
        im=Image.new('RGB',(896,1040),(245,245,245))
        for member,label in zip(sheet['members'],sheet['labels_png_base64']):
            x,y,x1,y1=member['xyxy']; src=Image.open(io.BytesIO(sources[member['id']])).convert('RGB')
            if src.size!=(430,480) or (x1-x,y1-y)!=(430,480): raise ValueError('Reference dimensions')
            im.paste(src,(x,y)); im.paste(Image.open(io.BytesIO(base64.b64decode(label))).convert('RGB'),(x,y-24))
        if sha(im.tobytes())!=sheet['pixel_sha256']: raise ValueError('Sheet pixel hash mismatch')
        buf=io.BytesIO(); im.save(buf,format='PNG'); result[sheet['id']]=buf.getvalue()
    return result

def usage_cost(usage):
    if not isinstance(usage,dict): return None
    d=usage.get('input_tokens_details',{})
    if not all(type(d.get(k)) is int and d[k]>=0 for k in ['text_tokens','image_tokens']): return None
    if type(usage.get('output_tokens')) is not int or usage['output_tokens']<0 or usage.get('input_tokens')!=d['text_tokens']+d['image_tokens']: return None
    return (Decimal(d['text_tokens'])*5+Decimal(d['image_tokens'])*8+Decimal(usage['output_tokens'])*30)/Decimal(1000000)

class MockProvider:
    mode='mock'
    def __init__(self, fail_at=None, unknown_at=None): self.calls=0; self.fail_at=fail_at; self.unknown_at=unknown_at
    def generate(self,obj,sheets):
        self.calls+=1
        if self.calls==self.fail_at: raise TimeoutError('Simulated ambiguous request')
        im=Image.new('RGBA',(1376,1536),(0,0,0,0)); d=ImageDraw.Draw(im)
        color=tuple(70+(int(obj['prompt_sha256'][i:i+2],16)%160) for i in (0,2,4))+(254,)
        d.rounded_rectangle((250,310,1120,1270),radius=220,fill=color)
        d.ellipse((560,570,820,850),fill=(0,0,0,0)) # transparent hole for occlusion tests
        b=io.BytesIO();im.save(b,format='PNG')
        usage=None if self.calls==self.unknown_at else {'input_tokens':0,'input_tokens_details':{'text_tokens':0,'image_tokens':0},'output_tokens':0}
        return b.getvalue(),usage,{'request_id':'mock-'+str(self.calls)}

class Store:
    def __init__(self, root='runtime'):
        self.root=Path(root).resolve(); self.root.mkdir(parents=True,exist_ok=True)
        with self.db() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,spec TEXT NOT NULL,mode TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(run_id TEXT,object_id TEXT,status TEXT NOT NULL,manifest TEXT NOT NULL,PRIMARY KEY(run_id,object_id));
CREATE TABLE IF NOT EXISTS frozen(run_id TEXT,object_id TEXT,alternatives TEXT NOT NULL,PRIMARY KEY(run_id,object_id));
CREATE TABLE IF NOT EXISTS answers(run_id TEXT,object_id TEXT,revision INTEGER NOT NULL,status TEXT NOT NULL,selected TEXT,diagnostics TEXT NOT NULL,updated TEXT,PRIMARY KEY(run_id,object_id));
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,run_id TEXT,object_id TEXT,payload TEXT NOT NULL,created TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);''')
            baseline={'known':'0','unresolved':'0','ceiling':'100','source':'synthetic demo; supply verified private baseline before production','reservation':'1'}
            db.execute('INSERT OR IGNORE INTO settings VALUES (?,?)',('budget',json.dumps(baseline)))
    @contextmanager
    def db(self):
        db=sqlite3.connect(self.root/'studio.sqlite',timeout=30);db.row_factory=sqlite3.Row
        try:
            db.execute('PRAGMA journal_mode=WAL')
            with db: yield db
        finally: db.close()
    def create(self,spec,run_id=None,mode='mock'):
        validate_spec(spec)
        if mode!='mock': raise ValueError('Production execution is not enabled')
        run_id=identifier(run_id or 'mock-'+uuid.uuid4().hex[:12]);frozen=copy.deepcopy(spec);frozen['run_id']=run_id
        with self.db() as db: db.execute('INSERT INTO runs VALUES (?,?,?,?)',(run_id,encoded(frozen).decode(),mode,NOW()))
        write_json(self.root/run_id/'frozen_inputs.json',frozen);self.exports(run_id);return run_id
    def spec(self,run):
        identifier(run)
        with self.db() as db: row=db.execute('SELECT spec FROM runs WHERE id=?',(run,)).fetchone()
        if not row: raise ValueError('Unknown run')
        return json.loads(row[0])
    def jobs(self,run):
        with self.db() as db: return {r['object_id']:json.loads(r['manifest']) for r in db.execute('SELECT * FROM jobs WHERE run_id=?',(run,))}
    def ledger(self):
        with self.db() as db:
            b=json.loads(db.execute("SELECT value FROM settings WHERE key='budget'").fetchone()[0]);rows=db.execute('SELECT manifest FROM jobs').fetchall()
        actual=Decimal(0);reserved=Decimal(0)
        for row in rows:
            m=json.loads(row[0])
            if m['cost_usd'] is None: reserved+=Decimal(m['reservation_usd'])
            else: actual+=Decimal(str(m['cost_usd']))
        return {**b,'new_actual':str(actual),'new_reserved_unknown':str(reserved),'remaining':str(Decimal(b['ceiling'])-Decimal(b['known'])-Decimal(b['unresolved'])-actual-reserved)}
    def verify_saved(self,run,obj,m):
        if m['prompt_sha256']!=obj['prompt_sha256']: raise ValueError('Cached prompt mismatch')
        for key in ('raw','final'):
            if sha((self.root/run/m[key+'_filename']).read_bytes())!=m[key+'_sha256']: raise ValueError('Cached '+key+' hash mismatch')
    def execute(self,run,provider,sheets=None):
        if provider.mode!='mock': raise ValueError('Live provider cannot run before separate approval and capability verification')
        spec=self.spec(run);validate_spec(spec); started=time.monotonic()
        try:
            # Fail closed across all runs, before sending another request.
            with self.db() as db:
                unknown=db.execute("SELECT 1 FROM jobs WHERE status != 'complete' LIMIT 1").fetchone()
            if unknown: raise ValueError('Unresolved request exists; manual reconciliation required, no automatic retry')
            for obj in spec['objects']:
                prior=self.jobs(run).get(obj['object_id'])
                if prior: self.verify_saved(run,obj,prior);continue
                job={**obj,'model':MODEL,'mode':provider.mode,'status':'reserved_unknown_billing','cost_usd':None,'reservation_usd':'1','started_at':NOW(),'reference_source_hashes':{r['id']:r['sha256'] for r in spec['references']},'sheet_pixel_hashes':{s['id']:s['pixel_sha256'] for s in spec['input_sheets']},'sheet_png_hashes':{k:sha(v) for k,v in (sheets or {}).items()},'art_direction_sha256':spec['shared_style_sha256'],'rules_sha256':spec['generalized_rules_sha256']}
                with self.db() as db:
                    db.execute('BEGIN IMMEDIATE')
                    if db.execute("SELECT 1 FROM jobs WHERE status != 'complete' LIMIT 1").fetchone(): raise ValueError('Another unresolved request exists')
                    if Decimal(self.ledger()['remaining'])<Decimal('1'): raise ValueError('Budget exhausted')
                    db.execute('INSERT INTO jobs VALUES (?,?,?,?)',(run,obj['object_id'],job['status'],encoded(job).decode()))
                write_json(self.root/run/'image_ledger.json',self.jobs(run));t=time.monotonic()
                try:
                    raw,usage,metadata=provider.generate(obj,sheets or {})
                    im=Image.open(io.BytesIO(raw));im.load()
                    if im.size!=(1376,1536) or im.mode!='RGBA' or im.getextrema()[3][0]!=0 or im.getextrema()[3][1]==0: raise ValueError('Native PNG dimensions/alpha invalid')
                    final=io.BytesIO();im.resize((860,960),Image.Resampling.LANCZOS).save(final,format='PNG');final=final.getvalue()
                    job.update(raw_filename='object_'+obj['object_id']+'_raw.png',final_filename='object_'+obj['object_id']+'_860x960.png',raw_sha256=sha(raw),final_sha256=sha(final),usage=usage,latency_seconds=time.monotonic()-t,provider_metadata=metadata,completed_at=NOW(),alpha_extrema=im.getextrema()[3])
                    atomic(self.root/run/job['raw_filename'],raw);atomic(self.root/run/job['final_filename'],final)
                    cost=usage_cost(usage);job['cost_usd']=str(cost) if cost is not None else None;job['status']='complete' if cost is not None and cost<=1 else 'needs_billing_review'
                except Exception as exc:
                    job.update(status='unknown_request',error={'type':type(exc).__name__,'message':'Request/output unresolved; manual inspection required','request_id':getattr(exc,'request_id',None),'retry_after':getattr(exc,'retry_after',None)},latency_seconds=time.monotonic()-t)
                    raise
                finally:
                    with self.db() as db: db.execute('UPDATE jobs SET status=?,manifest=? WHERE run_id=? AND object_id=?',(job['status'],encoded(job).decode(),run,obj['object_id']))
                    write_json(self.root/run/('object_'+obj['object_id']+'_manifest.json'),job);self.exports(run)
                if job['status']!='complete': raise ValueError('Unknown or excessive cost; stopped before next request')
        finally: self.exports(run)
        return {'run_id':run,'seconds':time.monotonic()-started,'saved':len(self.jobs(run))}
    def exports(self,run):
        spec=self.spec(run);jobs=self.jobs(run);verified=[]
        for obj in spec['objects']:
            m=jobs.get(obj['object_id'])
            if m and 'final_sha256' in m:
                self.verify_saved(run,obj,m);verified.append(m)
        catalog={'run_id':run,'quality_accepted':False,'objects':verified,'planned':20,'reference_count':50,'sheet_count':13}
        root=self.root/run;write_json(root/'game_objects.json',catalog);write_json(root/'image_ledger.json',jobs)
        summary={'run_id':run,'available':len(verified),'complete':sum(x['status']=='complete' for x in jobs.values()),'planned':20,'quality_accepted':False,'budget':self.ledger(),'updated':NOW()};write_json(root/'summary.json',summary)
        contact=Image.new('RGB',(5*172,4*210),(225,225,225));d=ImageDraw.Draw(contact)
        for i,m in enumerate(verified):
            im=Image.open(root/m['final_filename']).convert('RGBA');im.thumbnail((172,192));contact.paste(im,((i%5)*172,(i//5)*210),im);d.text(((i%5)*172,(i//5)*210+192),m['object_id'],fill='black')
        b=io.BytesIO();contact.save(b,format='PNG');atomic(root/'contact_partial_or_complete.png',b.getvalue())
        cards=[]
        for m in verified:
            src='data:image/png;base64,'+base64.b64encode((root/m['final_filename']).read_bytes()).decode()
            cards.append('<article><img src="'+src+'" alt="'+html.escape(m['name'],quote=True)+'"><h2>'+html.escape(m['name'])+'</h2><p>'+html.escape(m['status'])+'</p><code>'+m['final_sha256']+'</code></article>')
        page='<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saved run</title><style>body{font:16px system-ui;background:#17222e;color:white;padding:20px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px}img{width:100%;background:#dde3e6}code{overflow-wrap:anywhere;font-size:11px}article{padding:12px;border:1px solid #567}</style><h1>'+html.escape(run)+'</h1><p>Сохранено '+str(len(verified))+'/20. Художественное качество не подтверждено. Автономный просмотр: без API и ключей.</p><main>'+''.join(cards)+'</main></html>'
        atomic(root/'results.html',page.encode())
        z=io.BytesIO()
        with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as archive:
            for name in ['results.html','game_objects.json','summary.json','image_ledger.json','frozen_inputs.json','contact_partial_or_complete.png']+[m['final_filename'] for m in verified]+['object_'+m['object_id']+'_manifest.json' for m in verified]:
                p=root/name
                if p.exists():archive.write(p,name)
        atomic(root/'Objects20_Available_Results.zip',z.getvalue())
        report={'run_id':run,'quality_accepted':False,'assets':[{'object_id':m['object_id'],'sha256':m['final_sha256'],'reference_ids':[r['id'] for r in spec['references']],'technical':{'native':[1376,1536],'final':[860,960],'alpha_extrema':m['alpha_extrema']},'human_review':{k:{'status':'unreviewed','comment':'','reference_ids':[]} for k in ['identity','component_geometry_perspective','material_detail','color','soft_form_shading','cast_shadow_structure','highlights','alpha_boundaries']}} for m in verified]};write_json(root/'study_report.json',report)
        return summary
