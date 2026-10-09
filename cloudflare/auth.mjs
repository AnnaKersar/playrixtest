const cache = new Map();
const decode = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export async function authenticate(request, env, fetcher = fetch) {
  const { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: audience, OWNER_EMAIL: owner } = env;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer || '') || !audience || !owner)
    return { status: 503, error: 'Configure ACCESS_TEAM_DOMAIN, ACCESS_AUD and OWNER_EMAIL before serving any content.' };
  try {
    const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
    if (token.length > 16384) throw Error();
    const parts = token.split('.');
    if (parts.length !== 3) throw Error();
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw Error();
    let entry = cache.get(issuer);
    if (!entry || entry.expires < Date.now()) {
      const response = await fetcher(issuer + '/cdn-cgi/access/certs', { redirect: 'manual', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error();
      const body = await response.json();
      if (!Array.isArray(body.keys)) throw Error();
      entry = { keys: body.keys, expires: Date.now() + 300000 };
      cache.set(issuer, entry);
    }
    const jwk = entry.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) throw Error();
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(parts.slice(0, 2).join('.')))) throw Error();
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== issuer || !Array.isArray(claims.aud) || !claims.aud.includes(audience) ||
      !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 30 ||
      (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 30))) throw Error();
    if (typeof claims.email !== 'string') throw Error();
    const email=claims.email.toLowerCase();
    if(email===owner.toLowerCase())return {email,role:'owner',principalId:'owner'};
    const list=name=>{const values=JSON.parse(env[name]||'[]');if(!Array.isArray(values)||values.some(v=>typeof v!=='string'))throw Error();return values.map(v=>v.toLowerCase());};
    const role=list('GUEST_GENERATION_EMAILS').includes(email)?'generator':list('REVIEWER_EMAILS').includes(email)?'reviewer':null;
    if(!role||typeof claims.sub!=='string'||!claims.sub)return {status:403,error:'Invited application role required.'};
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(issuer+'\n'+claims.sub));
    return {email,role,principalId:'guest-'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')};
  } catch { return { status: 401, error: 'A valid Cloudflare Access owner token is required.' }; }
}
