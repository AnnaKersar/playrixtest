"""Prepare a curated, explicit public manifest and image folder. No discovery or uploads.
Input: {title, assets:[{id,path,mime}], entries:[...images:[{assetId,role,caption,attribution}]]}.
Only call after reviewing the supplied catalog for public publication.
"""
from pathlib import Path
import sys,json,hashlib,shutil
source=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
catalog=json.loads(source.read_text(encoding='utf-8-sig'));assets=[];lookup={}
for item in catalog['assets']:
 path=(source.parent/item['path']).resolve();data=path.read_bytes();mime=item['mime']
 assert mime in ['image/png','image/jpeg','image/webp'] and 0<len(data)<=20000000
 assert (mime=='image/png' and data.startswith(b'\x89PNG\r\n\x1a\n')) or (mime=='image/jpeg' and data.startswith(b'\xff\xd8\xff')) or (mime=='image/webp' and data[:4]==b'RIFF' and data[8:12]==b'WEBP')
 digest=hashlib.sha256(data).hexdigest();assert item['id'] not in lookup;lookup[item['id']]=digest
 ext='jpg' if mime=='image/jpeg' else mime.split('/')[1];(out/(digest+'.'+ext)).write_bytes(data)
 if not any(a['sha256']==digest for a in assets):assets.append({'sha256':digest,'bytes':len(data),'mime':mime})
entries=[]
for item in catalog['entries']:
 entry={k:item[k] for k in ['id','order','date','chronology','title','hypothesis','change','result','feedback','status']}
 for k in ['chapter','testMethod','decision','evidence','comparisonCaveat']:
  if k in item:entry[k]=item[k]
 entry['images']=[{'sha256':lookup[i['assetId']],**{k:i[k] for k in ['role','caption','attribution']}} for i in item['images']];entries.append(entry)
manifest={'version':'experiment-archive/v2','title':catalog['title'],'entries':entries,'assets':assets}
for k in ['intro','chapters']:
 if k in catalog:manifest[k]=catalog[k]
(out/'archive-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'experiments':len(entries),'images':len(assets),'imageBytes':sum(a['bytes'] for a in assets),'uploaded':False,'sourceBytesPreserved':True}))
