export const SESSION_MS = 6 * 60 * 60 * 1000;
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function requireValue(condition, message = 'Invalid request') {
  if (!condition) throw new HttpError(400, message);
}
const encoder = new TextEncoder();
function encode(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
function decode(value) { return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); }
async function key(secret) {
  if (!secret || secret.length < 32) throw new Error('Signing secret is not configured');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signToken(claims, secret) {
  const payload = encode(encoder.encode(JSON.stringify(claims)));
  return `${payload}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload))))}`;
}
export async function verifyToken(token, secret, site, origin) {
  try {
    if (typeof token !== 'string' || token.length > 2048) throw Error();
    const parts = token.split('.');
    if (parts.length !== 2 || !await crypto.subtle.verify('HMAC', await key(secret), decode(parts[1]), encoder.encode(parts[0]))) throw Error();
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (claims.site !== site || claims.origin !== origin || claims.exp <= Date.now() || !isUuid(claims.sid)) throw Error();
    return claims;
  } catch { throw new HttpError(401, 'Session expired. Please unlock again.'); }
}
export async function equalSecret(a, b) {
  if (typeof a !== 'string' || !b) return false;
  const [left, right] = await Promise.all([a,b].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const x = new Uint8Array(left), y = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validateSnapshot(data, count, maxElapsed) {
  requireValue(Number.isSafeInteger(data.seq) && data.seq > 0 && data.seq < 1e9);
  requireValue(Number.isSafeInteger(data.elapsedMs) && data.elapsedMs >= 0 && data.elapsedMs <= Math.min(SESSION_MS, maxElapsed + 10000));
  requireValue(Array.isArray(data.slideMs) && data.slideMs.length === count);
  requireValue(data.slideMs.every(n => Number.isSafeInteger(n) && n >= 0));
  requireValue(data.slideMs.reduce((sum, n) => sum + n, 0) <= data.elapsedMs);
  requireValue(Array.isArray(data.events) && data.events.length <= 40);
  for (const event of data.events) {
    requireValue(isUuid(event.id) && ['slide_view','link_click'].includes(event.type));
    requireValue(Number.isInteger(event.slide) && event.slide >= 0 && event.slide < count);
    requireValue(Number.isSafeInteger(event.atMs) && event.atMs >= 0 && event.atMs <= data.elapsedMs);
    if (event.type === 'link_click') requireValue(typeof event.linkId === 'string' && /^[0-9]+:[0-9]+$/.test(event.linkId) && event.linkId.length < 20);
  }
  return { seq: data.seq, elapsedMs: data.elapsedMs, slideMs: data.slideMs, events: data.events.map(e => ({ id:e.id, type:e.type, slide:e.slide, atMs:e.atMs, linkId:e.type === 'link_click' ? e.linkId : null })) };
}
export async function readJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing request body');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32768) { await reader.cancel(); throw new HttpError(413, 'Request too large'); }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    requireValue(data && typeof data === 'object' && !Array.isArray(data));
    return data;
  } catch { throw new HttpError(400, 'Invalid JSON'); }
}
