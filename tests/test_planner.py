import unittest
from studio.planner import plan_mock,plan_live
class PlannerTests(unittest.TestCase):
 def test_upstream_contract_mock_only(self):
  p=plan_mock('village','casual','20 meaningful collectibles');self.assertEqual(len(p['objects']),20);self.assertFalse(p['llm_inference']);self.assertTrue(p['review_required']);self.assertGreater(len({o['semantic_details']['detail_budget'] for o in p['objects']}),1)
  bowl=next(o for o in p['objects'] if o['name']=='Mixing bowl');basket=next(o for o in p['objects'] if o['name']=='Wicker basket');cushion=next(o for o in p['objects'] if o['name']=='Cushion')
  self.assertTrue(bowl['semantic_details']['contents']);self.assertTrue(basket['semantic_details']['contents']);self.assertTrue(cushion['semantic_details']['decorations'])
  from studio.pipeline import compile_briefs
  from studio.fixtures import fixture
  spec=fixture();compiled=compile_briefs(spec,p['objects']);self.assertEqual(len(compiled['objects']),20);self.assertEqual(compiled['shared_style_block'],spec['shared_style_block'])
  with self.assertRaises(RuntimeError):plan_live()
