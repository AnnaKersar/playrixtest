import copy,json,tempfile,unittest,zipfile
from pathlib import Path
from studio.pipeline import *
from studio.server import Studio

def fixture():
    contract=json.loads((Path(__file__).parents[1]/'config/art-direction-v1.json').read_text(encoding='utf8'))
    refs=[{'id':'SYNTHETIC-PRIMARY' if i==0 else 'MOCK'+str(i),'sha256':sha(str(i).encode())} for i in range(50)]
    sheets=[{'id':'sheet'+str(i),'members':[{'id':r['id']} for r in refs[i*4:(i+1)*4]],'pixel_sha256':sha(str(i).encode())} for i in range(13)]
    s={**contract,'run_id':'fixture','references':refs,'input_sheets':sheets,'objects':[]}
    for o in contract.pop('briefs'):
        prompt='MAIN ART DIRECTION\n'+s['shared_style_block']+'\n\nGENERALIZED RENDERING RULES V1\n'+s['generalized_rules']+'\n\n'+s['technical_contract']+'\n\n'+s['sheet_instruction']+'\n\nOBJECT: '+o['name']+'\n'+o['brief']
        s['objects'].append({**o,'prompt':prompt,'prompt_sha256':sha(prompt.encode())})
    return s

class Tests(unittest.TestCase):
    def setUp(self):
        Path('qa-output').mkdir(exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir='qa-output');self.store=Store(self.temp.name);self.spec=fixture()
    def tearDown(self):self.temp.cleanup()
    def test_frozen_integrity_and_compiler(self):
        validate_spec(self.spec);compiled=compile_briefs(self.spec,[{k:o[k] for k in ['object_id','name','brief']} for o in self.spec['objects']]);self.assertEqual(compiled['objects'],self.spec['objects'])
        for key in ['shared_style_block','generalized_rules']:
            d=copy.deepcopy(self.spec);d[key]+='changed'
            with self.assertRaises(ValueError):validate_spec(d)
        d=copy.deepcopy(self.spec);d['references'].pop()
        with self.assertRaises(ValueError):validate_spec(d)
    def test_success_resume_cache_budget(self):
        run=self.store.create(self.spec,'mock-all');p=MockProvider();self.store.execute(run,p);self.assertEqual(p.calls,20)
        p=MockProvider();self.store.execute(run,p);self.assertEqual(p.calls,0)
        self.assertEqual(self.store.ledger()['remaining'],'100')
        root=self.store.root/run;summary=json.loads((root/'summary.json').read_text());self.assertEqual(summary['available'],20);self.assertFalse(summary['quality_accepted'])
        with zipfile.ZipFile(root/'Objects20_Available_Results.zip') as z:self.assertEqual(len([x for x in z.namelist() if x.endswith('_860x960.png')]),20)
        m=next(iter(self.store.jobs(run).values()));atomic(root/m['final_filename'],b'bad')
        with self.assertRaises(ValueError):self.store.execute(run,MockProvider())
    def test_ambiguous_blocks_retry_and_partial_export(self):
        run=self.store.create(self.spec);p=MockProvider(fail_at=3)
        with self.assertRaises(TimeoutError):self.store.execute(run,p)
        self.assertEqual(json.loads((self.store.root/run/'summary.json').read_text())['available'],2)
        q=MockProvider()
        with self.assertRaises(ValueError):self.store.execute(run,q)
        self.assertEqual(q.calls,0);self.assertEqual(self.store.ledger()['new_reserved_unknown'],'1')
    def test_unknown_usage_stops_next_request(self):
        run=self.store.create(self.spec);p=MockProvider(unknown_at=1)
        with self.assertRaises(ValueError):self.store.execute(run,p)
        self.assertEqual(p.calls,1);self.assertEqual(self.store.jobs(run)['001']['status'],'needs_billing_review')
        self.assertEqual(json.loads((self.store.root/run/'summary.json').read_text())['available'],1)
    def test_budget_exhaustion(self):
        with self.store.db() as db:
            b=json.loads(db.execute("SELECT value FROM settings WHERE key='budget'").fetchone()[0]);b['ceiling']='0.5';db.execute("UPDATE settings SET value=? WHERE key='budget'",(json.dumps(b),))
        run=self.store.create(self.spec);p=MockProvider()
        with self.assertRaises(ValueError):self.store.execute(run,p)
        self.assertEqual(p.calls,0)
    def test_usage_validation(self):
        self.assertIsNone(usage_cost({'input_tokens':10,'input_tokens_details':{'text_tokens':5,'image_tokens':6},'output_tokens':3}))
        self.assertEqual(usage_cost({'input_tokens':11,'input_tokens_details':{'text_tokens':5,'image_tokens':6},'output_tokens':3}),Decimal('0.000163'))
    def test_semantic_budget_is_explicit_and_varied(self):
        briefs=[{k:o[k] for k in ['object_id','name','brief']} for o in self.spec['objects']]
        briefs[0]['semantic_details']={'detail_budget':0,'purpose':'fruit','contents':[],'decorations':[],'accessories':[],'theme':'orchard'}
        compiled=compile_briefs(self.spec,briefs);self.assertIn('Empty lists mean no additions',compiled['objects'][0]['prompt']);self.assertEqual(compiled['objects'][1],self.spec['objects'][1])
        briefs[0]['semantic_details']['contents']=['unrequested extra']
        with self.assertRaises(ValueError):compile_briefs(self.spec,briefs)
    def test_mock_ranker_no_quality_claim_or_palette_escape(self):
        from studio.ranker import rank_candidates,benchmark,VisionRanker
        c=[{'id':'candidate-0','config':{'palette':'allowed'},'precompositionQA':{'meanVisibleRGBDelta':4}}]
        r=rank_candidates(c,['allowed']);self.assertFalse(r['benchmark_passed']);self.assertEqual(r['ranking'][0]['confidence'],0)
        with self.assertRaises(ValueError):rank_candidates(c,['other'])
        with self.assertRaises(RuntimeError):VisionRanker().rank(c)
        report=benchmark({'object':'candidate-0'},{'trials':[{'object_id':'object','status':'none','selected_id':None}]});self.assertEqual(report['selected_trials'],0);self.assertFalse(report['productionStyleApproved'])
    def test_no_live_entrypoint(self):
        from studio.providers import OpenAIImageAdapter,TextDirectionAdapter
        with self.assertRaises(RuntimeError):OpenAIImageAdapter()
        with self.assertRaises(RuntimeError):TextDirectionAdapter().propose('test')
        with self.assertRaises(ValueError):self.store.create(self.spec,mode='live')
    def test_synthetic_50_sources_13_pixel_exact_sheets(self):
        source=Path(self.temp.name)/'sources';source.mkdir();spec=copy.deepcopy(self.spec)
        for i,r in enumerate(spec['references']):
            b=io.BytesIO();Image.new('RGB',(430,480),(i*4,120,200)).save(b,format='PNG');raw=b.getvalue();r['sha256']=sha(raw);(source/(r['id']+'.png')).write_bytes(raw)
        for sheet in spec['input_sheets']:
            sheet.update(width=896,height=1040,labels_png_base64=[]);im=Image.new('RGB',(896,1040),(245,245,245))
            for i,m in enumerate(sheet['members']):
                x,y=12+442*(i%2),40+512*(i//2);m['xyxy']=[x,y,x+430,y+480];label=Image.new('RGB',(430,24),'white');buf=io.BytesIO();label.save(buf,format='PNG');sheet['labels_png_base64'].append(base64.b64encode(buf.getvalue()).decode());im.paste(Image.open(source/(m['id']+'.png')),(x,y));im.paste(label,(x,y-24))
            sheet['pixel_sha256']=sha(im.tobytes())
        result=build_sheets(spec,source);self.assertEqual(len(result),13)
        spec['input_sheets'][0]['pixel_sha256']='0'*64
        with self.assertRaises(ValueError):build_sheets(spec,source)
        atomic(source/'SYNTHETIC-PRIMARY.png',b'wrong')
        with self.assertRaises(ValueError):build_sheets(spec,source)
    def test_dynamic_study_immutable_feedback_replay_conflict(self):
        run=self.store.create(self.spec,'first');self.store.execute(run,MockProvider());api=Studio(self.store)
        alts=[{'id':'candidate-'+str(i),'config':{'dimensions':{'width':860,'height':960},'layers':{'object':'first-001'},'sharedRenderingPolicy':'source-contrast/1.6.0'},'qa':{'nonopaque':0,'objectMismatch':0}} for i in range(3)]
        api.register({'run':run,'object':'001','alternatives':alts});self.assertEqual(len(api.dataset(run)['objects']),1)
        d={'op':'decide','studyId':run,'trialId':'first:001','eventId':'event-test-00000001','expectedRevision':0,'action':'select','selectedId':'candidate-0','diagnostics':{'objectMaterial':{'tags':['too_plastic'],'comment':'material'},'options':{'candidate-0':{'tags':['background_color_gradient'],'comment':'background'}}}}
        api.decide(d);self.assertTrue(api.decide(d)['replayed'])
        with self.assertRaises(ValueError):api.decide({**d,'eventId':'event-test-00000002'})
        snapshot=api.preferences(run,True);self.store.create(self.spec,'second');self.assertEqual(api.preferences(run,True),snapshot)
        self.assertEqual(len(snapshot['events']),1);self.assertEqual(snapshot['trials'][0]['diagnostics']['objectMaterial']['comment'],'material')
        alts[0]['config']['extra']='change'
        with self.assertRaises(ValueError):api.register({'run':run,'object':'001','alternatives':alts})
if __name__=='__main__':unittest.main()
