import {sha} from './provider.mjs';
import {pinnedReferencePNG} from './png.mjs';
const proofKey=s=>'reference-validation/'+encodeURIComponent(s.key)+'-'+s.sha256+'.json';
// Proofs are private and tied to the exact immutable R2 object version, not just its path.
export async function prepareSheets(env,manifest,jobId,processing){
 const proofs=[];
 for(const [index,s] of manifest.sheets.entries()){
  const head=await env.ARTIFACTS.head(s.key);if(!head?.etag)throw Error('Missing reference sheet version');
  const saved=await env.ARTIFACTS.get(proofKey(s)),proof=saved?await saved.json():null;
  if(proof?.key!==s.key||proof?.etag!==head.etag||proof?.sha256!==s.sha256){
   await processing.event('reference_sheet_validation','started',{sheet:index+1,total:manifest.sheets.length});
   const object=await env.ARTIFACTS.get(s.key);if(!object?.etag)throw Error('Missing reference sheet');
   const bytes=new Uint8Array(await object.arrayBuffer());
   if(await sha(bytes)!==s.sha256)throw Error('Reference SHA mismatch');pinnedReferencePNG(bytes);
   await env.ARTIFACTS.put(proofKey(s),JSON.stringify({key:s.key,etag:object.etag,sha256:s.sha256}),{httpMetadata:{contentType:'application/json'}});
   await env.IMAGE_JOBS.send({version:1,jobId});
   await processing.event('reference_validation_queued','succeeded',{sheet:index+1,total:manifest.sheets.length});
   return null; // At most one full hash per queue invocation, always before paid claim.
  }
  proofs.push(proof);
 }
 const sheets=[];
 for(const [index,s] of manifest.sheets.entries()){
  const object=await env.ARTIFACTS.get(s.key);
  if(!object||object.etag!==proofs[index].etag)throw Error('Reference sheet changed after validation');
  sheets.push(new Uint8Array(await object.arrayBuffer()));
 }
 return {sheets,hashes:manifest.sheets.map(s=>s.sha256)};
}
