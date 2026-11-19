/** Cloudflare Access JWT validation (RS256) using WebCrypto only.
 * Setup: create a self-hosted Access application for the /admin* path in the
 * Zero Trust dashboard, then set COURT_ACCESS_TEAM and COURT_ACCESS_AUD.
 * https://developers.cloudflare.com/cloudflare-one/policies/access/validate-jwt/ */
interface AccessJwt { header: { alg: string; kid: string }; payload: { aud: string | string[]; iss: string; exp: number; iat?: number; email?: string; common_name?: string }; signature: Uint8Array }
const b64urlDecode = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '='));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};
const text2 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

let certsCache: { at: number; keys: Map<string, JsonWebKey> } | undefined;
async function accessCerts(team: string): Promise<Map<string, JsonWebKey>> {
  if (certsCache && Date.now() - certsCache.at < 3600_000) return certsCache.keys;
  const response = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600 } } as RequestInit);
  if (!response.ok) throw new Error('Access 证书暂时无法获取。');
  const data = await response.json() as { keys?: { kid: string; kty: string; n: string; e: string; alg?: string }[] };
  const keys = new Map((data.keys || []).filter(key => key.kid).map(key => [key.kid!, { kty: key.kty, n: key.n, e: key.e, alg: 'RS256', ext: true } as JsonWebKey]));
  certsCache = { at: Date.now(), keys };
  return keys;
}
function parseAccessJwt(assertion: string): AccessJwt {
  const parts = assertion.split('.');
  if (parts.length !== 3) throw new Error('Access 令牌格式无效。');
  const header = JSON.parse(text2(b64urlDecode(parts[0])));
  const payload = JSON.parse(text2(b64urlDecode(parts[1])));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Access 令牌算法无效。');
  return { header, payload, signature: b64urlDecode(parts[2]) };
}

/** Returns the admin's email, or throws when the request is not authorized. */
export async function verifyAccess(request: Request, team: string, aud: string): Promise<string> {
  const assertion = request.headers.get('cf-access-jwt-assertion') || (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith('CF_Authorization='))?.slice('CF_Authorization='.length);
  if (!assertion) throw new Error('需要通过 Cloudflare Access 登录。');
  const jwt = parseAccessJwt(assertion);
  const expectedIssuer = `https://${team}.cloudflareaccess.com`;
  const audience = Array.isArray(jwt.payload.aud) ? jwt.payload.aud : [jwt.payload.aud];
  if (jwt.payload.iss !== expectedIssuer || !audience.includes(aud)) throw new Error('Access 令牌不属于本管理后台。');
  if (typeof jwt.payload.exp !== 'number' || jwt.payload.exp * 1000 < Date.now()) throw new Error('Access 登录已过期，请重新认证。');
  const keys = await accessCerts(team);
  const jwk = keys.get(jwt.header.kid);
  if (!jwk) throw new Error('Access 证书未找到。');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${assertion.split('.')[0]}.${assertion.split('.')[1]}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, jwt.signature, signed);
  if (!valid) throw new Error('Access 令牌签名无效。');
  return jwt.payload.email || jwt.payload.common_name || 'access-user';
}
