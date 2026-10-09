const denied=()=>{throw Object.assign(Error('Not authorized for this resource'),{status:403});};
export function ownerOnly(auth){if(auth.role!=='owner')denied();}
export function generationRole(auth){if(!['owner','generator'].includes(auth.role))denied();}
export async function runAccess(env,auth,runId){const row=await env.DB.prepare('SELECT * FROM runs WHERE id=?').bind(runId).first();if(!row)throw Object.assign(Error('Study not found'),{status:404});if(auth.role==='owner'||row.principal_id===auth.principalId)return row;const grant=await env.DB.prepare('SELECT 1 FROM run_access WHERE run_id=? AND principal_id=?').bind(runId,auth.principalId).first();if(!grant)denied();return row;}
export async function jobAccess(env,auth,jobId){const row=await env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(jobId).first();if(!row)throw Object.assign(Error('Job not found'),{status:404});await runAccess(env,auth,row.run_id);return row;}
export function redactRun(row){const {frozen_key,frozen_sha,...safe}=row;return safe;}
