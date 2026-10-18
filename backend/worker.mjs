import { createStore } from './store.mjs';
import { HttpError, SESSION_MS, equalSecret, isUuid, readJson, requireValue, signToken, validateSnapshot, verifyToken } from './security.mjs';
import { adminPage, adminScript, adminStyles } from './dashboard.mjs';

function settings(env) {
  if (!env.DATABASE_URL || !env.PRESENTATION_PASSWORD || !env.ADMIN_PASSWORD || env.SESSION_SECRET?.length < 32 || !env.SESSION_SECRET) throw Error('Missing secrets');
  if (env.ADMIN_PASSWORD.length < 16) throw Error('Admin password must be at least 16 characters');
  const origins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!/^[a-z0-9-]{1,60}$/.test(env.SITE_ID || '') || !origins.length) throw Error('Invalid site configuration');
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname))) throw Error('Invalid origin');
  }
  const count = Number(env.SLIDE_COUNT);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw Error('Invalid slide count');
  return {origins,count};
}
async function limit(binding, key) {
  // Fail closed rather than silently deploy an API with no configured rate limiter.
  if (!binding) throw Error('Missing rate limiter binding');
  if (!(await binding.limit({key})).success) throw new HttpError(429,'Too many requests. Try again shortly.');
}
export function createHandler(storeFactory = createStore) {
  return async function fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    let allowedOrigin = null;
    const headers = {
      'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY',
      'Strict-Transport-Security':'max-age=31536000', 'Vary':'Origin',
    };
    function respond(data, status = 200) {
      return new Response(data === null ? null : JSON.stringify(data), {status,headers:{...headers,'Content-Type':'application/json'}});
    }
    try {
      if (url.pathname === '/admin' && request.method === 'GET') {
        return new Response(adminPage,{headers:{...headers,'Content-Type':'text/html; charset=utf-8',
          'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
      }
      if (url.pathname === '/admin.js' && request.method === 'GET') {
        return new Response(adminScript,{headers:{...headers,'Content-Type':'application/javascript'}});
      }
      if (url.pathname === '/admin.css' && request.method === 'GET') return new Response(adminStyles,{headers:{...headers,'Content-Type':'text/css'}});
      if (url.pathname === '/health' && request.method === 'GET') return respond({ok:true,service:'campaign-analytics'});
      const config = settings(env);
      if (url.pathname.startsWith('/report')) {
        if (origin && origin !== url.origin) throw new HttpError(403,'Origin not allowed');
        await limit(env.ADMIN_LIMITER, `${env.SITE_ID}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
        const password = request.headers.get('Authorization')?.replace(/^Bearer /,'');
        if (!await equalSecret(password,env.ADMIN_PASSWORD)) throw new HttpError(401,'Invalid admin password');
        if (request.method !== 'GET') throw new HttpError(405,'Method not allowed');
        const store = storeFactory(env.DATABASE_URL,env.SITE_ID);
        if (url.pathname === '/report/session') {
          const id = url.searchParams.get('id'); requireValue(isUuid(id));
          const detail = await store.detail(id);
          if (!detail) throw new HttpError(404,'Session not found');
          return respond(detail);
        }
        if (url.pathname !== '/report') throw new HttpError(404,'Not found');
        const period = url.searchParams.get('days') || 'all';
        const days = period === 'all' ? null : Number(period);
        requireValue(days === null || (Number.isInteger(days) && days >= 1 && days <= 90));
        return respond(await store.report(days));
      }
      if (!origin || !config.origins.includes(origin)) throw new HttpError(403,'Origin not allowed');
      allowedOrigin = origin;
      headers['Access-Control-Allow-Origin'] = allowedOrigin;
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type';
      if (!['/session','/events'].includes(url.pathname)) throw new HttpError(404,'Not found');
      if (request.method === 'OPTIONS') return respond(null,204);
      if (request.method !== 'POST') throw new HttpError(405,'Method not allowed');
      if (url.pathname === '/session') {
        await limit(env.LOGIN_LIMITER, `${env.SITE_ID}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
        const data = await readJson(request);
        requireValue(typeof data.password === 'string' && data.password.length <= 256);
        if (!await equalSecret(data.password,env.PRESENTATION_PASSWORD)) throw new HttpError(401,'Incorrect access key');
        requireValue(isUuid(data.visitorId));
        const now = Date.now();
        requireValue(typeof data.openedAt === 'string');
        const opened = Date.parse(data.openedAt);
        requireValue(Number.isFinite(opened) && opened <= now + 60000 && opened >= now - SESSION_MS + 60000);
        const shareTag = data.shareTag || null;
        requireValue(shareTag === null || (typeof shareTag === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(shareTag)));
        const id = crypto.randomUUID(), expiresAt = opened + SESSION_MS;
        const store = storeFactory(env.DATABASE_URL,env.SITE_ID);
        await store.createSession({id,visitorId:data.visitorId,origin,openedAt:new Date(opened).toISOString(),expiresAt:new Date(expiresAt).toISOString(),
          ip:request.headers.get('CF-Connecting-IP'),userAgent:(request.headers.get('User-Agent') || '').slice(0,512),shareTag});
        return respond({token:await signToken({sid:id,site:env.SITE_ID,origin,iat:opened,exp:expiresAt},env.SESSION_SECRET),sessionId:id,expiresAt});
      }
      const data = await readJson(request);
      const claims = await verifyToken(data.token,env.SESSION_SECRET,env.SITE_ID,origin);
      await limit(env.EVENT_LIMITER, `${env.SITE_ID}:${claims.sid}`);
      const snapshot = validateSnapshot(data,config.count,Date.now()-claims.iat);
      const accepted = await storeFactory(env.DATABASE_URL,env.SITE_ID).saveSnapshot(claims.sid,snapshot);
      return respond({ok:true,accepted});
    } catch(error) {
      if (!(error instanceof HttpError)) console.error('Analytics request failed', {path:url.pathname});
      return respond({error:error instanceof HttpError ? error.message : 'Service unavailable'},error instanceof HttpError ? error.status : 503);
    }
  };
}
export default {
  fetch: createHandler(),
  async scheduled(_event, env, ctx) {
    if (env.RETENTION_ENABLED !== 'true') return;
    settings(env);
    ctx.waitUntil(createStore(env.DATABASE_URL,env.SITE_ID).cleanup(7,90));
  },
};
