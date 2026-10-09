"""Reuse the existing editor, removing all embedded reference artwork from git deliverables."""
import argparse, base64, hashlib, json, re, shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);a=p.parse_args();root=Path(__file__).resolve().parents[1];dest=root/'private/editor';dest.mkdir(parents=True,exist_ok=True)
html=(a.source/'public/measured-editor-v7.html').read_text(encoding='utf8')
# Preserve measured numerical policy, path geometry and code, but not source rasters.
art=re.findall(r'data:image/[^;]+;base64,[A-Za-z0-9+/=]+',html)
html=re.sub(r'data:image/[^;]+;base64,[A-Za-z0-9+/=]+','',html)
(dest/'measured-editor-v7.html').write_text(html,encoding='utf8')
for name in ['measured-editor-v9.html','direction-v8.js','core-v9.js']:
    shutil.copyfile(a.source/'public'/name,dest/name)
h=(a.source/'public/preference-refs50.html').read_text(encoding='utf8').replace('preference-refs50.js','review.js').replace('Новые 20 объектов · 50 референсов · v9','AI Card Studio · проверка партии').replace('/versions.html','/')
(root/'public/review.html').write_text(h,encoding='utf8')
j=(a.source/'public/preference-refs50.js').read_text(encoding='utf8')
j=re.sub(r"STUDY='[^']+'","STUDY=new URLSearchParams(location.search).get('study')",j,count=1)
j=re.sub(r"if\(dataset.objects.length!==20\|\|dataset.runId!=='[^']+'\)","if(!dataset.objects.length)",j)
j=j.replace("$('undo').onclick=async()=>{if(busy||!last)return;", "$('undo').onclick=async()=>{if(busy||!last)return;if(readLocal(KEY)){await load();return;}")
j=j.replace('все 20 объектов','все доступные объекты')
(root/'public/review.js').write_text(j,encoding='utf8')
provenance={name:hashlib.sha256((a.source/'public'/name).read_bytes()).hexdigest() for name in ['measured-editor-v7.html','direction-v8.js','core-v9.js','preference-refs50.html','preference-refs50.js']}
(root/'private/EDITOR_PROVENANCE.json').write_text(json.dumps({'source_hashes':provenance,'changes':'Remove embedded reference rasters; parameterize study ID; guard pending undo. Renderer unchanged.','removed_rasters':len(art)},indent=2),encoding='utf8')
print('Reused editor; embedded source rasters removed:',len(art))
