"""Unwired server-side adapters. No caller in this release enables live execution.
Validate model entitlement/settings and obtain explicit budget/key approval first.
Official request contract: https://developers.openai.com/api/reference/resources/images
"""
import base64, json, os, urllib.request, urllib.error, uuid
from .pipeline import MODEL

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

class OpenAIImageAdapter:
    mode='live'
    def __init__(self, approved=False):
        if not approved: raise RuntimeError('Live execution requires separate approval; adapter is not production-verified')
    def generate(self,obj,sheets):
        if len(sheets)!=13: raise ValueError('Exactly 13 reference sheets required')
        key=os.environ.get('OPENAI_API_KEY')
        if not key: raise RuntimeError('No approved server credential')
        boundary='card-studio-'+uuid.uuid4().hex;parts=[]
        def add(name,value,filename=None):
            h=f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
            if filename:h+=f'; filename="{filename}"\r\nContent-Type: image/png'
            parts.append(h.encode()+b'\r\n\r\n'+(value if isinstance(value,bytes) else value.encode())+b'\r\n')
        for k,v in {'model':MODEL,'n':'1','size':'1376x1536','quality':'medium','output_format':'png','background':'transparent','prompt':obj['prompt']}.items():add(k,v)
        for i,data in enumerate(sheets.values()):add('image[]',data,f'reference_sheet_{i+1:02}.png')
        body=b''.join(parts)+f'--{boundary}--\r\n'.encode()
        req=urllib.request.Request('https://api.openai.com/v1/images/edits',data=body,headers={'Authorization':'Bearer '+key,'Content-Type':'multipart/form-data; boundary='+boundary})
        # One send only. Never retry a timeout, HTTP error, decoding error or interrupted request.
        try:
            with urllib.request.build_opener(NoRedirect()).open(req,timeout=240) as response:
                payload=json.load(response);request_id=response.headers.get('x-request-id')
        except urllib.error.HTTPError as e:
            err=RuntimeError('Provider HTTP '+str(e.code));err.request_id=e.headers.get('x-request-id');err.retry_after=e.headers.get('retry-after');raise err from None
        return base64.b64decode(payload['data'][0]['b64_json'],validate=True),payload.get('usage'),{'request_id':request_id}

class TextDirectionAdapter:
    model='gpt-6-sol'
    def propose(self,brief):
        raise RuntimeError('Paid planner disabled. Current Art Direction is frozen; a future proposal needs explicit approval and a new version.')
