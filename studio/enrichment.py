"""Object enrichment v1.1: offline candidate plans, never image generation."""
import hashlib,json
VERSION='object-enrichment-v1.1'
def compile_enriched(art_direction,expected_art_sha256,plan):
    if hashlib.sha256(art_direction.encode()).hexdigest()!=expected_art_sha256:raise ValueError('Main Art Direction changed')
    required=('main_identity','detail_budget','contents','decoration','loose_accessories','material','camera','category','locks','assumptions','compiled_brief')
    if any(k not in plan for k in required):raise ValueError('Missing plan fields')
    if plan['detail_budget'] not in ('low','medium','high'):raise ValueError('Invalid detail budget')
    for field in ('contents','decoration','loose_accessories'):
        if not isinstance(plan[field],list) or any(not isinstance(x,str) or not x.strip() for x in plan[field]):raise ValueError('Invalid detail list')
    # Only explicit active user constraints are locks. Model defaults never become user facts.
    locks={x['constraint']:x for x in plan['locks'] if x.get('source')=='user' and not x.get('superseded',False)}
    if 'empty' in locks and plan['contents']:raise ValueError('User empty lock violated')
    if 'undecorated' in locks and plan['decoration']:raise ValueError('User undecorated lock violated')
    if 'unlit' in locks and any(x in ('flame','smoke') for x in plan.get('effects',[])):raise ValueError('User unlit lock violated')
    for key in ('color','count','name'):
        if key in locks and plan.get(key)!=locks[key].get('value'):raise ValueError('User '+key+' lock violated')
    for field in ('contents','decoration','loose_accessories'):
        for value in plan[field]:
            evidence=[a for a in plan['assumptions'] if a.get('field')==field and a.get('value')==value]
            if not evidence or any(a.get('source') not in ('user','compiler_assumption') or not a.get('reason') for a in evidence):raise ValueError('Addition requires explicit provenance: '+field)
    c=plan['category'];category=c.get('production_category');stage=c.get('asset_stage')
    if stage not in ('foreground_only','object_with_surface','whole_card') or category not in (None,'C1','C2','C3','C4'):raise ValueError('Invalid category/stage')
    if stage=='whole_card' and category is None:raise ValueError('Whole-card category required')
    if category=='C3' and stage in ('foreground_only','object_with_surface') and c.get('external_support')!='included_meaningful_surface':raise ValueError('C3 includes object plus developed meaningful surface; background remains procedural')
    if stage=='foreground_only' and category!='C3' and c.get('external_support') not in ('none','deferred'):raise ValueError('Unexpected external support/pedestal')
    if stage=='foreground_only' and category=='C2' and c.get('external_support')!='deferred':raise ValueError('C2 simple gradient plane is composed separately')
    if category=='C1' and (plan.get('is_multi_object_scene') or plan['loose_accessories']):raise ValueError('C1 category conflict requires review')
    if c.get('original_category') and c['original_category']!=category:raise ValueError('Category change requires explicit review')
    if plan['camera'].get('shared_components') is not True:raise ValueError('Shared component camera required')
    # Do not infer semantic correctness from word matching or confuse historical prose with instructions.
    prompt='MAIN ART DIRECTION\n'+art_direction+'\n\nOBJECT CONTENT PLAN '+VERSION+'\n'+plan['compiled_brief']+'\n\nSTRUCTURED CONSTRAINTS\n'+json.dumps(plan,ensure_ascii=False,sort_keys=True)
    return {'version':VERSION,'prompt':prompt,'prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest(),'art_direction_sha256':expected_art_sha256,'generation_enabled':False,'review_required':True,'deterministic_checks':'passed','semantic_and_visual_validation':'not_performed','unverified':['compiled prose versus structured choices','physical coherence','readability and detail grouping','camera geometry','material and shadow quality']}
