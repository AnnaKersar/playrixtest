import json
from pathlib import Path
from .pipeline import sha,encoded
ROOT=Path(__file__).resolve().parents[1]
VERSION='narrative-collection-designer/v1.1'
def build_request(category,collection_names=None,gd_brief='',art_direction=None):
    if not isinstance(category,str) or not category.strip():raise ValueError('Broad category required')
    if not isinstance(collection_names or [],list):raise ValueError('Collection names must be a list')
    return {'model':'gpt-6-sol','version':VERSION,'messages':[{'role':'system','content':'You are the Narrative Collection Designer. Return structured collection plans; no image generation.'},{'role':'developer','content':(ROOT/'prompts/narrative-collection-designer-v1.1.md').read_text(encoding='utf8')},{'role':'user','content':json.dumps({'category':category,'collection_names':collection_names or [],'gd_brief':gd_brief,'immutable_art_direction':art_direction},ensure_ascii=False)}],'output_schema':json.loads((ROOT/'config/planner-output.schema.json').read_text()),'execution_enabled':False}
def plan_mock(theme,genre='',gd_brief=''):
    if not isinstance(theme,str) or not theme.strip() or any(not isinstance(x,str) or len(x)>4000 for x in (theme,genre,gd_brief)):raise ValueError('Broad category required; inputs must be text')
    examples=json.loads((ROOT/'config/enrichment-v1.1-examples.json').read_text(encoding='utf8'))['examples'];objects=[]
    for i,e in enumerate(examples):
        contents=e['contents'];decorations=e['decoration'];budget={'low':1,'medium':3,'high':6}[e['detail_budget']]
        objects.append({'object_id':f'{i+1:03}','name':e['name'],'brief':e['brief'],'semantic_details':{'detail_budget':budget,'purpose':'Mock template; thematic fit requires review','contents':contents,'decorations':decorations,'accessories':[],'theme':theme}})
    prompt=(ROOT/'prompts/narrative-collection-designer-v1.1.md').read_text(encoding='utf8')
    art=json.loads((ROOT/'config/art-direction-v1.json').read_text());evidence=lambda xs:[{'description':v,'source':'planner_inference','reason':'Fixed mock fixture; review required'} for v in xs]
    planned=[]
    for o,e in zip(objects,examples):
        planned.append({'object_id':o['object_id'],'main_identity':o['name'],'theme_role':'Mock inventory, not inferred thematic fit','detail_budget':{'level':e['detail_budget'],'rationale':'Generic evaluation fixture'},'contents':evidence(e['contents']),'decoration':evidence(e['decoration']),'attached_components':[],'loose_accessories':[],'structural_features':[],'material_color':'Unreviewed fixture','camera_plan':{'projection':'weak perspective','elevation':'gently elevated','component_coherence':'shared axes; visual validation pending'},'production_category':'C2','asset_stage':'foreground_only','deferred_context':evidence(['whole-card support']),'user_locks':[],'assumptions':evidence(['generic mock inventory; category unreviewed']),'object_brief':o['brief']})
    request=build_request(theme,[],gd_brief,{'version':'synthetic-fixture-v1','sha256':art['shared_style_sha256']})
    return {'version':VERSION,'provider':'mock','llm_inference':False,'image_generation_enabled':False,'prompt_sha256':sha(prompt.encode()),'input_sha256':sha(encoded([theme,genre,gd_brief])),'input':{'theme':theme,'genre':genre,'gd_brief':gd_brief},'objects':objects,'art_direction_version':'synthetic-fixture-v1','art_direction_sha256':art['shared_style_sha256'],'assumptions':evidence(['Fixed mock inventory, no inference']),'collections':[{'collection_id':'mock-collection','name':theme,'coherence_rationale':'Not evaluated by mock','objects':planned}],'request_preview':request,'review_required':True,'warning':'Fixed generic demonstration inventory; no semantic inference, constraint extraction or thematic validation was performed.'}
def plan_live(*args,**kwargs):raise RuntimeError('gpt-6-sol inference disabled pending separate approval and evaluation')
