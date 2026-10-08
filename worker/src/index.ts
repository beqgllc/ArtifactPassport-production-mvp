interface Env {
  ARTIFACTS: R2Bucket;
  DB: D1Database;
  APP_ORIGIN: string;
  MAX_SHARE_BYTES?: string;
  SHARE_TTL_SECONDS?: string;
  LEMONSQUEEZY_STORE_ID?: string;
  LEMONSQUEEZY_PRODUCT_ID?: string;
  LEMONSQUEEZY_VARIANT_ID?: string;
  LICENSE_HMAC_SECRET?: string;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!isAllowedOrigin(request, env)) return json({ error: 'Origin not allowed.' }, 403);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });

    if (request.method === 'POST' && url.pathname === '/api/share') return createShare(request, env);
    if (request.method === 'GET' && url.pathname.startsWith('/api/share/') && url.pathname.endsWith('/file')) return getShareFile(request, env, url);
    if (request.method === 'GET' && url.pathname.startsWith('/api/share/')) return getShare(request, env, url);
    if (request.method === 'POST' && url.pathname === '/api/license/activate') return activateLicense(request, env);
    if (request.method === 'POST' && url.pathname === '/api/license/validate') return validateLicense(request, env);
    if (request.method === 'POST' && url.pathname === '/api/license/deactivate') return deactivateLicense(request, env);
    return new Response('Not found', { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const expired = await env.DB.prepare('SELECT token FROM shares WHERE expires_at <= ? LIMIT 100').bind(now).all<{ token: string }>();
    for (const row of expired.results ?? []) {
      await env.ARTIFACTS.delete(`artifacts/${row.token}`);
    }
    await env.DB.prepare('DELETE FROM shares WHERE expires_at <= ?').bind(now).run();
  },
} satisfies ExportedHandler<Env>;

async function createShare(request: Request, env: Env): Promise<Response> {
  const limit = Number(env.MAX_SHARE_BYTES || 10 * 1024 * 1024);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (!contentLength || contentLength > limit) return json({ error: `Share payload must be between 1 byte and ${limit} bytes.` }, 413, env);

  const filename = decodeURIComponent(request.headers.get('x-artifact-filename') || 'artifact.bin').slice(0, 255);
  const mime = request.headers.get('x-artifact-mime') || 'application/octet-stream';
  const size = Number(request.headers.get('x-artifact-size') || 0);
  const sha256 = request.headers.get('x-artifact-sha256') || '';
  const iv = request.headers.get('x-artifact-iv') || '';
  const passportEncoded = request.headers.get('x-artifact-passport') || '';
  if (!sha256 || !iv || !passportEncoded || !Number.isSafeInteger(size) || size < 0) return json({ error: 'Missing share metadata.' }, 400, env);

  const token = crypto.randomUUID();
  const ttl = Math.min(Math.max(Number(env.SHARE_TTL_SECONDS || 86400), 300), 7 * 86400);
  const createdAt = Math.floor(Date.now() / 1000);
  const expiresAt = createdAt + ttl;
  const passportJson = decodeBase64Url(passportEncoded);
  if (passportJson.length > 200_000) return json({ error: 'Passport metadata too large.' }, 400, env);
  try { JSON.parse(passportJson); } catch { return json({ error: 'Invalid passport metadata.' }, 400, env); }

  if (!env.LICENSE_HMAC_SECRET) return json({ error: 'Cloud sharing is not configured.' }, 503, env);
  const licenseToken = request.headers.get('x-ap-license') || '';
  const license = await verify(licenseToken, env.LICENSE_HMAC_SECRET);
  if (!license || license.exp < Math.floor(Date.now() / 1000)) return json({ error: 'A valid ArtifactPassport Pro license is required for encrypted cloud handoff.' }, 402, env);

  const body = request.body;
  if (!body) return json({ error: 'Empty share payload.' }, 400, env);
  const object = await env.ARTIFACTS.put(`artifacts/${token}`, body, {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { filename, mime, sha256 },
  });
  if (!object) return json({ error: 'Unable to store artifact.' }, 500, env);

  await env.DB.prepare('INSERT INTO shares (token,filename,mime,size,sha256,iv,passport_json,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(token, filename, mime, size, sha256, iv, passportJson, createdAt, expiresAt)
    .run();

  return json({ token, expiresAt: new Date(expiresAt * 1000).toISOString() }, 201, env);
}

async function getShare(_request: Request, env: Env, url: URL): Promise<Response> {
  const token = url.pathname.split('/').pop() || '';
  const row = await env.DB.prepare('SELECT token,filename,mime,size,sha256,iv,passport_json,expires_at FROM shares WHERE token = ?').bind(token).first<{ token: string; filename: string; mime: string; size: number; sha256: string; iv: string; passport_json: string; expires_at: number }>();
  if (!row || row.expires_at <= Math.floor(Date.now() / 1000)) return json({ error: 'Share expired or not found.' }, 404, env);
  return json({ token: row.token, filename: row.filename, mime: row.mime, size: row.size, sha256: row.sha256, iv: row.iv, passport: JSON.parse(row.passport_json), expiresAt: new Date(row.expires_at * 1000).toISOString() }, 200, env);
}

async function getShareFile(_request: Request, env: Env, url: URL): Promise<Response> {
  const parts = url.pathname.split('/');
  const token = parts.at(-2) || '';
  const row = await env.DB.prepare('SELECT mime,expires_at FROM shares WHERE token = ?').bind(token).first<{ mime: string; expires_at: number }>();
  if (!row || row.expires_at <= Math.floor(Date.now() / 1000)) return json({ error: 'Share expired or not found.' }, 404, env);
  const object = await env.ARTIFACTS.get(`artifacts/${token}`);
  if (!object) return json({ error: 'Artifact unavailable.' }, 404, env);
  return new Response(object.body, { headers: { ...corsHeaders(env), 'content-type': 'application/octet-stream', 'cache-control': 'private, no-store' } });
}

async function activateLicense(request: Request, env: Env): Promise<Response> {
  if (!env.LICENSE_HMAC_SECRET) return json({ error: 'Licensing is not configured.' }, 503, env);
  const body = await request.json().catch(() => null) as { licenseKey?: string; instanceName?: string } | null;
  const licenseKey = body?.licenseKey?.trim();
  const instanceName = body?.instanceName?.trim() || `web-${crypto.randomUUID().slice(0, 8)}`;
  if (!licenseKey || licenseKey.length > 200) return json({ error: 'License key required.' }, 400, env);

  const ls = await lemonPost('https://api.lemonsqueezy.com/v1/licenses/activate', new URLSearchParams({ license_key: licenseKey, instance_name: instanceName }));
  if (!ls.activated || !matchesProduct(ls.meta, env)) return json({ error: ls.error || 'License is not valid for ArtifactPassport.' }, 403, env);

  const payload = JSON.stringify({ licenseKey, instanceId: ls.instance?.id, variantId: ls.meta?.variant_id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
  const token = await sign(payload, env.LICENSE_HMAC_SECRET);
  return json({ token, instanceId: ls.instance?.id, expiresAt: new Date((Math.floor(Date.now() / 1000) + 7 * 86400) * 1000).toISOString() }, 200, env);
}

async function validateLicense(request: Request, env: Env): Promise<Response> {
  if (!env.LICENSE_HMAC_SECRET) return json({ error: 'Licensing is not configured.' }, 503, env);
  const body = await request.json().catch(() => null) as { token?: string } | null;
  const data = body?.token ? await verify(body.token, env.LICENSE_HMAC_SECRET) : null;
  if (!data || data.exp < Math.floor(Date.now() / 1000)) return json({ valid: false }, 401, env);
  const ls = await lemonPost('https://api.lemonsqueezy.com/v1/licenses/validate', new URLSearchParams({ license_key: data.licenseKey, instance_id: data.instanceId || '' }));
  if (!ls.valid || !matchesProduct(ls.meta, env)) return json({ valid: false, error: ls.error || 'License is not valid.' }, 403, env);
  return json({ valid: true, expiresAt: new Date(data.exp * 1000).toISOString() }, 200, env);
}

async function deactivateLicense(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as { licenseKey?: string; instanceId?: string } | null;
  if (!body?.licenseKey || !body.instanceId) return json({ error: 'License key and instance ID required.' }, 400, env);
  const ls = await lemonPost('https://api.lemonsqueezy.com/v1/licenses/deactivate', new URLSearchParams({ license_key: body.licenseKey, instance_id: body.instanceId }));
  return json({ deactivated: Boolean(ls.deactivated), error: ls.error || null }, ls.deactivated ? 200 : 400, env);
}

async function lemonPost(url: string, body: URLSearchParams): Promise<any> {
  const response = await fetch(url, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body });
  return response.json();
}

function matchesProduct(meta: any, env: Env): boolean {
  if (!meta) return false;
  const storeOk = !env.LEMONSQUEEZY_STORE_ID || String(meta.store_id) === String(env.LEMONSQUEEZY_STORE_ID);
  const productOk = !env.LEMONSQUEEZY_PRODUCT_ID || String(meta.product_id) === String(env.LEMONSQUEEZY_PRODUCT_ID);
  const variantOk = !env.LEMONSQUEEZY_VARIANT_ID || String(meta.variant_id) === String(env.LEMONSQUEEZY_VARIANT_ID);
  return storeOk && productOk && variantOk;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return `${toBase64Url(new TextEncoder().encode(payload))}.${toBase64Url(signature)}`;
}

async function verify(token: string, secret: string): Promise<any | null> {
  try {
    const [payloadPart, sigPart] = token.split('.');
    if (!payloadPart || !sigPart) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, fromBase64Url(sigPart), new TextEncoder().encode(new TextDecoder().decode(fromBase64Url(payloadPart))));
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(fromBase64Url(payloadPart)));
  } catch { return null; }
}

function toBase64Url(bytes: Uint8Array): string { let binary=''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function fromBase64Url(value: string): Uint8Array { const padded=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4); const binary=atob(padded); return Uint8Array.from(binary, c=>c.charCodeAt(0)); }
function decodeBase64Url(value: string): string { return new TextDecoder().decode(fromBase64Url(value)); }
function corsHeaders(env: Env): Record<string,string> { return { 'access-control-allow-origin': env.APP_ORIGIN, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,x-artifact-filename,x-artifact-mime,x-artifact-size,x-artifact-sha256,x-artifact-iv,x-artifact-passport' }; }
function isAllowedOrigin(request: Request, env: Env): boolean { if (request.method === 'OPTIONS') return true; const origin=request.headers.get('origin'); return !origin || origin === env.APP_ORIGIN; }
function json(value: unknown, status=200, env?: Env): Response { return new Response(JSON.stringify(value), { status, headers: { ...JSON_HEADERS, ...(env ? corsHeaders(env) : {}) } }); }
