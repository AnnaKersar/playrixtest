#!/usr/bin/env python3
"""Import exact existing ZIP packages without a browser folder chooser.
No provider calls. Passcode is prompted without echo and retained only in memory.
"""
import argparse,getpass,hashlib,http.cookiejar,json,sys,urllib.request,urllib.error,zipfile
from pathlib import PurePosixPath
ORIGIN='https://playrixtest.acasyna.workers.dev'
class ImportClient:
 def __init__(self):
  self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def api(self,path,body=None):
  if not path.startswith('/api/owner/'):raise ValueError('Owner routes only')
  headers={'Origin':ORIGIN}
  if isinstance(body,bytes):headers['Content-Type']='application/octet-stream'
  elif body is not None:body=json.dumps(body,separators=(',',':')).encode();headers['Content-Type']='application/json'
  try:
   with self.opener.open(urllib.request.Request(ORIGIN+path,data=body,headers=headers),timeout=180) as r:return json.load(r)
  except urllib.error.HTTPError as e:
   try:message=json.load(e).get('error','Import rejected')
   except Exception:message='Import rejected: HTTP '+str(e.code)
   raise RuntimeError(message) from None
 def login(self):self.api('/api/owner/login',{'passcode':getpass.getpass('Код владельца (не сохраняется): ')})
def package(path):
 with zipfile.ZipFile(path) as z:
  names=[i for i in z.infolist() if not i.is_dir()]
  if len(names)>300 or sum(i.file_size for i in names)>100000000:raise ValueError('Oversized package')
  files={}
  for i in names:
   p=PurePosixPath(i.filename)
   if p.is_absolute() or '..' in p.parts or i.file_size>20000000:raise ValueError('Unsafe ZIP entry')
   if i.filename in files:raise ValueError('Duplicate ZIP path')
   files[i.filename]=z.read(i)
  return files
def references(client,path):
 files=package(path);by_hash={hashlib.sha256(b).hexdigest():b for b in files.values()};c=client.api('/api/owner/reference-import/contract')
 required=[f for f in c['files'] if f['sha256'] not in c.get('available_sha256',[])]
 if any(f['sha256'] not in by_hash for f in required):raise ValueError('Missing exact approved originals or sheets')
 for i,f in enumerate(required):
  print('References:',i+1,'/',len(required),flush=True)
  client.api('/api/owner/reference-import/file?sha256='+f['sha256'],by_hash[f['sha256']])
 result=client.api('/api/owner/reference-import/commit',{});print('References committed:',result['originals'],'originals,',result['sheets'],'sheets')
def private(client,path):
 files=package(path);matches=[n for n in files if PurePosixPath(n).name=='private-import.json']
 if len(matches)!=1:raise ValueError('Exactly one private-import.json required')
 name=matches[0];prefix=name[:-len('private-import.json')];m=json.loads(files[name]);validated=[]
 for f in m['files']:
  b=files.get(prefix+f['key'])
  if b is None or len(b)!=f['bytes'] or hashlib.sha256(b).hexdigest()!=f['sha256']:raise ValueError('Invalid private file: '+f['key'])
  validated.append((f,b))
 p=client.api('/api/owner/private-import/prepare',m);available=set(p.get('available_sha256',[]))
 for i,(f,b) in enumerate(validated):
  if f['sha256'] in available:continue
  print('Private study:',i+1,'/',len(validated),flush=True)
  client.api('/api/owner/private-import/file?package='+p['packageHash']+'&sha256='+f['sha256'],b)
 result=client.api('/api/owner/private-import/commit?package='+p['packageHash'],{});print('Private study committed:',result['studyId'])
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--references',help='Original50_And_13_Sheets.zip');p.add_argument('--private',help='Private_v9_Study_Import.zip');a=p.parse_args()
 if not(a.references or a.private):p.error('Specify at least one ZIP package')
 client=ImportClient()
 try:
  client.login()
  if a.references:references(client,a.references)
  if a.private:private(client,a.private)
  print('Done. Paid generation remains disabled.')
 except Exception as e:print('Stopped:',str(e),file=sys.stderr);return 1
 finally:
  try:client.api('/api/owner/logout',{})
  except Exception:pass
 return 0
if __name__=='__main__':sys.exit(main())
