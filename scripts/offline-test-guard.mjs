// Release tests must not contact a real provider, even if the host has credentials.
delete process.env.OPENAI_API_KEY;
const original=globalThis.fetch;
globalThis.fetch=(input,options)=>{const u=new URL(typeof input==='string'?input:input.url||String(input));if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw Error('External network forbidden in mandatory offline tests: '+u.hostname);return original(input,options);};
