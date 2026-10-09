"""Fail closed on private paths, raster payloads, known credential forms and private identifiers."""
import json,re,subprocess,sys,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=root,text=True).splitlines()
issues=[]
for name in files:
 p=root/name
 if not p.is_file():continue
 if any(part in {'private','runtime','qa-output','.git','__pycache__'} for part in p.relative_to(root).parts):issues.append((name,'private path'))
 if p.suffix.lower() in {'.png','.jpg','.jpeg','.webp','.zip','.ipynb','.sqlite'}:
  approved=False
  if name.startswith('cloudflare/visitor-public/reference-seed/original160-v1/') and p.suffix.lower()=='.png':
   manifest=json.loads((root/'cloudflare/visitor-public/reference-seed/original160-v1/manifest.json').read_text(encoding='utf-8'))
   approved=any(p.name==r['id']+'.png' and hashlib.sha256(p.read_bytes()).hexdigest()==r['sha256'] for r in manifest['references'])
  if name.startswith('cloudflare/visitor-public/archive-seed/history-v1/') and p.suffix.lower() in {'.png','.jpg','.webp'}:
   manifest=json.loads((root/'cloudflare/visitor-public/archive-seed/history-v1/archive-manifest.json').read_text(encoding='utf-8'))
   data=p.read_bytes()
   approved=any(p.stem==a['sha256'] and len(data)==a['bytes'] and hashlib.sha256(data).hexdigest()==a['sha256'] and p.suffix==('.jpg' if a['mime']=='image/jpeg' else '.'+a['mime'].split('/')[1]) for a in manifest['assets'])
  if name.startswith('cloudflare/visitor-public/archive/latest-lora-test/') and p.suffix.lower()=='.png':
   manifest=json.loads((root/'cloudflare/visitor-public/archive/latest-lora-test/test.json').read_text(encoding='utf-8'))
   approved=any(p.name==a['file'] and hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256'] for a in manifest['assets'])
  if not approved:issues.append((name,'binary/private artifact'))
  continue
 text=p.read_text(encoding='utf8')
 checks={'credential':r'\b(?:sk-proj-|sk-live-|ghp_|github_pat_|art_v2_)[A-Za-z0-9_-]{12,}','embedded raster':r'data:image/[^;]+;base64,[A-Za-z0-9+/=]{100,}','private Drive URL':r'https://(?:drive|docs)\.google\.com/[^\s"\']+','private account/path':r'(?:C:\\\\Users\\\\[^\\]+|chatgpt\.site|libfile_[0-9a-f]+|file_000000)','email':r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'}
 if p.name!='privacy_scan.py':
  for label,pattern in checks.items():
   if re.search(pattern,text):issues.append((name,label))
result={'files_scanned':len(files),'issues':issues};print(json.dumps(result));sys.exit(bool(issues))
