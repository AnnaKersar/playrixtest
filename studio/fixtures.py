import json
from pathlib import Path
from .pipeline import sha

def fixture():
    contract=json.loads((Path(__file__).parents[1]/'config/art-direction-v1.json').read_text(encoding='utf8'))
    refs=[{'id':'SYNTHETIC-PRIMARY' if i==0 else 'MOCK'+str(i),'sha256':sha(str(i).encode())} for i in range(50)]
    sheets=[{'id':'sheet'+str(i),'members':[{'id':r['id']} for r in refs[i*4:(i+1)*4]],'pixel_sha256':sha(str(i).encode())} for i in range(13)]
    s={**contract,'run_id':'fixture','references':refs,'input_sheets':sheets,'objects':[]}
    for o in contract.pop('briefs'):
        prompt='MAIN ART DIRECTION\n'+s['shared_style_block']+'\n\nGENERALIZED RENDERING RULES V1\n'+s['generalized_rules']+'\n\n'+s['technical_contract']+'\n\n'+s['sheet_instruction']+'\n\nOBJECT: '+o['name']+'\n'+o['brief']
        s['objects'].append({**o,'prompt':prompt,'prompt_sha256':sha(prompt.encode())})
    return s
