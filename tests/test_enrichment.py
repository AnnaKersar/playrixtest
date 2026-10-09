import copy,hashlib,unittest
from studio.enrichment import compile_enriched
class EnrichmentTests(unittest.TestCase):
 def setUp(self):
  self.ad='synthetic style';self.hash=hashlib.sha256(self.ad.encode()).hexdigest();self.p={'main_identity':'bowl','detail_budget':'medium','contents':[],'decoration':[],'loose_accessories':[],'material':'ceramic','camera':{'shared_components':True},'category':{'production_category':'C2','asset_stage':'foreground_only','external_support':'deferred'},'locks':[],'assumptions':[],'compiled_brief':'A coherent bowl.'}
 def test_ad_integrity_and_no_inference(self):
  r=compile_enriched(self.ad,self.hash,self.p);self.assertFalse(r['generation_enabled']);self.assertEqual(r['semantic_and_visual_validation'],'not_performed')
  with self.assertRaises(ValueError):compile_enriched(self.ad+'x',self.hash,self.p)
 def test_user_locks_and_model_defaults(self):
  self.p['contents']=['fruit'];self.p['assumptions']=[{'field':'contents','value':'fruit','source':'compiler_assumption','reason':'appropriate contents'}];self.p['locks']=[{'constraint':'empty','source':'model_default'}];compile_enriched(self.ad,self.hash,self.p)
  self.p['locks'][0]['source']='user'
  with self.assertRaises(ValueError):compile_enriched(self.ad,self.hash,self.p)
 def test_undecorated_unlit_provenance_and_category(self):
  for fields in [{'decoration':['motif'],'locks':[{'constraint':'undecorated','source':'user'}]},{'effects':['flame'],'locks':[{'constraint':'unlit','source':'user'}]},{'contents':['fruit']},{'category':{'production_category':'C1','asset_stage':'whole_card'},'is_multi_object_scene':True}]:
   p=copy.deepcopy(self.p);p.update(fields)
   with self.assertRaises(ValueError):compile_enriched(self.ad,self.hash,p)
 def test_no_cross_subject_propagation(self):
  first=compile_enriched(self.ad,self.hash,self.p);q=copy.deepcopy(self.p);q['main_identity']='hammer';q['compiled_brief']='A hammer with functional components.';second=compile_enriched(self.ad,self.hash,q);self.assertNotIn('fruit',second['prompt']);self.assertNotEqual(first['prompt_sha256'],second['prompt_sha256'])
 def test_c3_generates_meaningful_surface_with_object(self):
  self.p['category']={'production_category':'C3','asset_stage':'object_with_surface','external_support':'included_meaningful_surface'};compile_enriched(self.ad,self.hash,self.p)
  self.p['category']['external_support']='deferred'
  with self.assertRaises(ValueError):compile_enriched(self.ad,self.hash,self.p)
