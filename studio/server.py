import argparse, copy, json, mimetypes, threading, uuid
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from .pipeline import Store, MockProvider, NOW, encoded, sha, identifier, compile_briefs
from .fixtures import fixture
from .planner import plan_mock

PUBLIC=Path(__file__).resolve().parents[1]/'public'
PRIVATE_EDITOR=Path(__file__).resolve().parents[1]/'private/editor'
class Studio:
    def __init__(self,store):self.store=store;self.worker_lock=threading.Lock()
    def dataset(self,run):
        spec=self.store.spec(run);jobs=self.store.jobs(run)
        with self.store.db() as db: frozen={r['object_id']:json.loads(r['alternatives']) for r in db.execute('SELECT * FROM frozen WHERE run_id=?',(run,))}
        objects=[];candidates={}
        for obj in spec['objects']:
            oid=obj['object_id'];m=jobs.get(oid)
            if not m or oid not in frozen:continue
            self.store.verify_saved(run,obj,m);asset=run+'-'+oid
            objects.append({'objectId':asset,'sourceObjectId':oid,'name':obj['name'],'sha256':m['final_sha256'],'partition':'review','path':'/assets/'+run+'/'+m['final_filename']})
            candidates[asset]=frozen[oid]
        return {'studyId':run,'runId':run,'version':1,'generatorVersion':'source-contrast/1.6.0','rendererVersion':'vector-pattern/1.0.0','objects':objects,'frozenCandidates':candidates,'quality_accepted':False,'automaticPolicyChanges':False}
    def trial(self,run,obj,row=None):
        alts=self.dataset(run)['frozenCandidates'][run+'-'+obj]
        result={'id':run+':'+obj,'object_id':run+'-'+obj,'study_id':run,'revision':0,'status':'pending','selected_id':None,'diagnostics':{},'updated_at':'','frozen':{'alternatives':alts,'displayOrder':[0,1,2]}}
        if row:result.update(revision=row['revision'],status=row['status'],selected_id=row['selected'],diagnostics=json.loads(row['diagnostics']),updated_at=row['updated'])
        return result
    def preferences(self,run,exporting=False):
        d=self.dataset(run)
        with self.store.db() as db:
            rows={r['object_id']:r for r in db.execute('SELECT * FROM answers WHERE run_id=?',(run,))}
            events=[{**dict(r),'payload':json.loads(r['payload'])} for r in db.execute('SELECT * FROM events WHERE run_id=? ORDER BY created,id',(run,))]
        out={'dataset':d,'trials':[self.trial(run,o['sourceObjectId'],rows.get(o['sourceObjectId'])) for o in d['objects']],'durable':True,'studyStatus':{'status':'active','backgroundLearningEligible':False,'productionStyleApproved':False}}
        if exporting:out.update(schema='preference-study-export/v1',events=events,noAutomaticPolicyChanges=True)
        return out
    def decide(self,b):
        run=identifier(b['studyId']);obj=identifier(b['trialId'].removeprefix(run+':'));event=identifier(b['eventId']);rev=b['expectedRevision'];action=b['action'];selected=b.get('selectedId') if action=='select' else None
        if type(rev) is not int or rev<0 or action not in ('select','none','skip','undo'):raise ValueError('Invalid decision')
        current=self.trial(run,obj)
        if selected and selected not in [a['id'] for a in current['frozen']['alternatives']]:raise ValueError('Unknown candidate')
        if action=='select' and not selected:raise ValueError('Candidate required')
        diag=b.get('diagnostics',{});allowed={'objectMaterial':{'too_plastic','too_realistic','flat_material'},'trial':{'object_style','shape_composition','surface_shadow','other'}}
        for key,tags in allowed.items():
            v=diag.get(key,{})
            if not isinstance(v.get('tags',[]),list) or not set(v.get('tags',[]))<=tags or not isinstance(v.get('comment',''),str) or len(v.get('comment',''))>500:raise ValueError('Invalid diagnostics')
        for key,v in diag.get('options',{}).items():
            if key not in [a['id'] for a in current['frozen']['alternatives']] or not set(v.get('tags',[]))<={'background_color_gradient','pattern_type_scale_contrast','object_readability','other'} or not isinstance(v.get('comment',''),str) or len(v.get('comment',''))>500:raise ValueError('Invalid background diagnostics')
        payload=encoded(b).decode()
        with self.store.db() as db:
            db.execute('BEGIN IMMEDIATE');existing=db.execute('SELECT * FROM events WHERE id=?',(event,)).fetchone();row=db.execute('SELECT * FROM answers WHERE run_id=? AND object_id=?',(run,obj)).fetchone()
            if existing:
                if existing['payload']!=payload:raise ValueError('Idempotency conflict')
                return {'trial':self.trial(run,obj,row),'durable':True,'replayed':True}
            if rev!=(row['revision'] if row else 0):raise ValueError('Revision conflict')
            status='pending' if action=='undo' else action;now=NOW()
            db.execute('INSERT INTO events VALUES (?,?,?,?,?)',(event,run,obj,payload,now))
            db.execute('INSERT INTO answers VALUES (?,?,?,?,?,?,?) ON CONFLICT(run_id,object_id) DO UPDATE SET revision=excluded.revision,status=excluded.status,selected=excluded.selected,diagnostics=excluded.diagnostics,updated=excluded.updated',(run,obj,rev+1,status,selected,encoded(diag).decode(),now))
        return {'trial':self.trial(run,obj,{'revision':rev+1,'status':status,'selected':selected,'diagnostics':encoded(diag).decode(),'updated':now}),'durable':True}
    def register(self,b):
        run=identifier(b['run']);obj=identifier(b['object']);spec=self.store.spec(run);m=self.store.jobs(run)[obj];alts=b['alternatives'];asset=run+'-'+obj
        self.store.verify_saved(run,next(o for o in spec['objects'] if o['object_id']==obj),m)
        if len(alts)!=3 or {x['id'] for x in alts}!={'candidate-0','candidate-1','candidate-2'}:raise ValueError('Three candidates required')
        for a in alts:
            c=a['config']
            if c['dimensions'].get('width')!=860 or c['dimensions'].get('height')!=960 or c['layers']['object']!=asset or c['sharedRenderingPolicy']!='source-contrast/1.6.0':raise ValueError('v9 composition required')
            if a['qa']['objectMismatch'] or a['qa']['nonopaque']:raise ValueError('Composition QA failed')
        value=encoded(alts).decode()
        with self.store.db() as db:
            old=db.execute('SELECT alternatives FROM frozen WHERE run_id=? AND object_id=?',(run,obj)).fetchone()
            if old and old[0]!=value:raise ValueError('Frozen candidates immutable')
            db.execute('INSERT OR IGNORE INTO frozen VALUES (?,?,?)',(run,obj,value))
        return {'registered':True,'studyId':run}
    def pending(self):
        with self.store.db() as db:rows=db.execute("SELECT j.* FROM jobs j LEFT JOIN frozen f ON f.run_id=j.run_id AND f.object_id=j.object_id WHERE f.object_id IS NULL AND j.status='complete' ORDER BY j.run_id,j.object_id").fetchall()
        return [{'run':r['run_id'],'object':r['object_id'],'manifest':json.loads(r['manifest'])} for r in rows]

def serve(data='runtime',port=5190):
    studio=Studio(Store(data))
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def send(self,value,status=200):
            b=encoded(value);self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(b)
        def boundary(self):
            host=self.headers.get('Host','')
            if host not in (f'127.0.0.1:{port}',f'localhost:{port}'):raise ValueError('Local Host required')
            origin=self.headers.get('Origin')
            if origin and origin not in (f'http://127.0.0.1:{port}',f'http://localhost:{port}'):raise ValueError('Origin mismatch')
        def do_GET(self):
            try:
                self.boundary();u=urlparse(self.path);q=parse_qs(u.query)
                if u.path=='/api/studies':
                    with studio.store.db() as db:runs=[dict(r) for r in db.execute('SELECT id,mode,created FROM runs ORDER BY created DESC')]
                    return self.send({'runs':[{**r,'ready':len(studio.dataset(r['id'])['objects']),'saved':len(studio.store.jobs(r['id']))} for r in runs],'budget':studio.store.ledger()})
                if u.path=='/api/render-jobs':return self.send(studio.pending())
                if u.path=='/api/brief-template':return self.send([{k:o[k] for k in ['object_id','name','brief']} for o in fixture()['objects']])
                if u.path=='/api/run':
                    run=identifier(q['run'][0]);return self.send({'run_id':run,'objects':list(studio.store.jobs(run).values()),'quality_accepted':False})
                if u.path=='/api/preferences':return self.send(studio.preferences(q['studyId'][0],q.get('op')==['export']))
                base=PUBLIC;name=u.path.lstrip('/') or 'index.html'
                if name in ('measured-editor-v7.html','measured-editor-v9.html','direction-v8.js','core-v9.js'):base=PRIVATE_EDITOR
                if name.startswith('assets/'):base=studio.store.root;name=name[7:]
                p=(base/name).resolve()
                if not p.is_relative_to(base.resolve()) or not p.is_file() or p.suffix not in ('.html','.js','.png','.json','.zip'):return self.send({'error':'Not found'},404)
                if base==studio.store.root and p.suffix not in ('.png','.zip') and p.name!='results.html':return self.send({'error':'Not exposed'},404)
                b=p.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(p.name)[0] or 'application/octet-stream');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(b)
            except Exception as e:self.send({'error':str(e)},400)
        def do_POST(self):
            try:
                self.boundary()
                if self.headers.get('Content-Type')!='application/json':raise ValueError('JSON required')
                n=int(self.headers.get('Content-Length','0'))
                if n<1 or n>2_000_000:raise ValueError('Body size')
                b=json.loads(self.rfile.read(n));path=urlparse(self.path).path
                if path=='/api/plan-mock':return self.send(plan_mock(b['theme'],b['genre'],b['gd_brief']))
                if path=='/api/runs':
                    spec=compile_briefs(fixture(),b['briefs'])
                    if not studio.worker_lock.acquire(blocking=False):raise ValueError('Another mock run is active')
                    try:run=studio.store.create(spec)
                    except Exception:studio.worker_lock.release();raise
                    def work():
                        try:studio.store.execute(run,MockProvider())
                        except Exception:pass # Durable ledger exposes failure; never retry automatically.
                        finally:studio.worker_lock.release()
                    threading.Thread(target=work,daemon=True).start();return self.send({'run_id':run,'mode':'mock','paid_calls':0},202)
                if path=='/api/register':return self.send(studio.register(b))
                if path=='/api/preferences':
                    if b['op']=='decide':return self.send(studio.decide(b))
                    if b['op']=='freeze':
                        d=studio.dataset(b['studyId']);o=next(o for o in d['objects'] if o['objectId']==b['objectId'])
                        if b['objectHash']!=o['sha256'] or b['alternatives']!=d['frozenCandidates'][o['objectId']]:raise ValueError('Frozen config mismatch')
                        return self.send({'trial':studio.trial(b['studyId'],o['sourceObjectId']),'durable':True})
                raise ValueError('Unknown endpoint')
            except Exception as e:self.send({'error':str(e)},409 if 'conflict' in str(e).lower() else 400)
    print(f'Local studio http://127.0.0.1:{port}',flush=True);ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--data',default='runtime');p.add_argument('--port',type=int,default=5190);a=p.parse_args();serve(a.data,a.port)
