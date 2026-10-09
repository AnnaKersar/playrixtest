"""Build a local private R2 package. Does not upload or change source renderer files."""
from pathlib import Path
import hashlib,json,re,base64,zipfile
root=Path(__file__).resolve().parents[1];source=root/'private/editor';out=root/'private/worker-editor-package';out.mkdir(parents=True,exist_ok=True)
html=(source/'measured-editor-v7.html').read_text(encoding='utf8')
if re.search(r'data:image/[^;]+;base64,[A-Za-z0-9+/=]{100,}',html):raise RuntimeError('Embedded raster detected')
html=html.replace('href="/versions.html"','href="/"')
html=html.replace('</html>','<script src="/editor/direction-v8.js"></script><script src="/editor/core-v9.js"></script></html>')
# Original inline scripts are hash-authorized; no unsafe-inline JavaScript.
hashes=["'sha256-"+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()+"'" for s in re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S) if s.strip()]
csp="default-src 'none'; script-src 'self' "+' '.join(hashes)+"; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
files={'index.html':html.encode(),**{name:(source/name).read_bytes() for name in ['direction-v8.js','core-v9.js']}}
manifest={'version':'private-editor/v1','entry':'index.html','csp':csp,'files':[]}
for name,data in files.items():
 (out/name).write_bytes(data);manifest['files'].append({'name':name,'key':'editor/v9/'+name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'contentType':'text/html; charset=utf-8' if name.endswith('.html') else 'text/javascript; charset=utf-8'})
encoded=json.dumps(manifest,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode();(out/'manifest.json').write_bytes(encoded)
(out/'manifest.sha256').write_text(hashlib.sha256(encoded).hexdigest(),encoding='ascii')
with zipfile.ZipFile(out/'private-editor-v9.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in [*files,'manifest.json','manifest.sha256']:z.write(out/name,name)
print(json.dumps({'files':len(files),'package':'private/worker-editor-package/private-editor-v9.zip','bytes':sum(map(len,files.values())),'embedded_source_rasters':0,'uploaded':False}))
