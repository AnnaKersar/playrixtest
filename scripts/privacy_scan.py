"""Fail closed on private paths, raster payloads, known credential forms and private identifiers."""
import json,re,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=root,text=True).splitlines()
issues=[]
for name in files:
 p=root/name
 if not p.is_file():continue
 if any(part in {'private','runtime','qa-output','.git','__pycache__'} for part in p.relative_to(root).parts):issues.append((name,'private path'))
 if p.suffix.lower() in {'.png','.jpg','.jpeg','.webp','.zip','.ipynb','.sqlite'}:issues.append((name,'binary/private artifact'))
 text=p.read_text(encoding='utf8')
 checks={'credential':r'\b(?:sk-proj-|sk-live-|ghp_|github_pat_|art_v2_)[A-Za-z0-9_-]{12,}','embedded raster':r'data:image/[^;]+;base64,[A-Za-z0-9+/=]{100,}','private Drive URL':r'https://(?:drive|docs)\.google\.com/[^\s"\']+','private account/path':r'(?:C:\\\\Users\\\\[^\\]+|chatgpt\.site|libfile_[0-9a-f]+|file_000000)','email':r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'}
 if p.name!='privacy_scan.py':
  for label,pattern in checks.items():
   if re.search(pattern,text):issues.append((name,label))
result={'files_scanned':len(files),'issues':issues};print(json.dumps(result));sys.exit(bool(issues))
