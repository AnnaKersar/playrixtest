"""Optional candidate ranker contract. Mock is diagnostic, not an AI quality claim."""
from .pipeline import NOW,encoded,sha
def rank_candidates(candidates,allowed_palettes,context=None):
    rows=[]
    for c in candidates:
        if c['config']['palette'] not in allowed_palettes:raise ValueError('Palette outside allowed set')
        metrics=c.get('precompositionQA',{})
        rows.append({'candidate_id':c['id'],'score':metrics.get('meanVisibleRGBDelta',0),'confidence':0,'reasons':['mock: ordered by measured pattern visibility only; harmony, readability and theme are unjudged'],'axes':{'readability':None,'color_harmony':None,'theme':None,'pattern_visibility':metrics.get('meanVisibleRGBDelta')},'candidate_hash':sha(encoded(c))})
    return {'version':'vision-ranker-interface/v1','provider':'mock','created_at':NOW(),'quality_accepted':False,'benchmark_passed':False,'ranking':sorted(rows,key=lambda x:x['score'],reverse=True),'context':context or {}}
class VisionRanker:
    def rank(self,*args,**kwargs):raise RuntimeError('Live vision inference disabled pending approval and benchmark')
def benchmark(predictions,export):
    """Relative-choice agreement only; none trials must not become positive labels."""
    selected=[t for t in export['trials'] if t['status']=='select'];none=[t for t in export['trials'] if t['status']=='none']
    hits=sum(predictions.get(t['object_id'])==t['selected_id'] for t in selected)
    return {'selected_trials':len(selected),'none_trials':len(none),'top1_matches':hits,'relative_choice_agreement':hits/len(selected) if selected else None,'backgroundLearningEligible':False,'productionStyleApproved':False,'benchmark_passed':False,'caveat':'Descriptive result; no held-out validation, no automatic approval. Empty diagnostics do not identify rejection causes.'}
