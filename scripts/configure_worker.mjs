// Generates bindings only from explicit existing resource identifiers. Never provisions resources.
import {readFile,writeFile} from 'node:fs/promises';
const names=['STUDIO_D1_ID','STUDIO_D1_NAME','STUDIO_R2_BUCKET','STUDIO_QUEUE'];
for(const name of names)if(!process.env[name])throw Error('Missing explicit existing resource: '+name);
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(process.env.STUDIO_D1_ID))throw Error('STUDIO_D1_ID must be an actual D1 UUID');
for(const name of names.slice(1))if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(process.env[name]))throw Error('Invalid resource name: '+name);
const c=JSON.parse(await readFile('wrangler.jsonc','utf8').then(x=>x.replace(/^\uFEFF/,'')));
c.d1_databases=[{binding:'DB',database_name:process.env.STUDIO_D1_NAME,database_id:process.env.STUDIO_D1_ID}];
c.r2_buckets=[{binding:'ARTIFACTS',bucket_name:process.env.STUDIO_R2_BUCKET}];
c.queues={producers:[{binding:'IMAGE_JOBS',queue:process.env.STUDIO_QUEUE}],consumers:[{queue:process.env.STUDIO_QUEUE,max_batch_size:1,max_batch_timeout:1,max_retries:0,max_concurrency:1}]};
await writeFile('wrangler.generated.jsonc',JSON.stringify(c,null,2)+'\n');
console.log('Wrote explicit bindings to wrangler.generated.jsonc; no network or provisioning performed.');
