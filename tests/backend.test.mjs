import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createStore } from '../backend/store.mjs';
import worker, { createHandler } from '../backend/worker.mjs';
import { readJson } from '../backend/security.mjs';

const allow = {limit:async()=>({success:true})};
const env = {DATABASE_URL:'postgres://unused:unused@localhost/test',SITE_ID:'site-a',SLIDE_COUNT:'2',
  ALLOWED_ORIGINS:'https://site-a.test',PRESENTATION_PASSWORD:'visitor-password',ADMIN_PASSWORD:'test-admin-password-long',
  SESSION_SECRET:'a-long-random-secret-for-this-test-only-123',LOGIN_LIMITER:allow,EVENT_LIMITER:allow,ADMIN_LIMITER:allow};
function request(path,data,origin='https://site-a.test') {
  return new Request('https://worker.test'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(data)});
}

test('real Postgres migration, authentication, ingestion, deduplication, isolation, reports and retention', async () => {
  const db = new PGlite();
  try {
    const migration=await readFile(new URL('../backend/migrations/001_analytics.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.query("INSERT INTO analytics.sites(id,name) VALUES ('site-a','A'),('site-b','B')");
    const factory=(_url,site)=>createStore(env.DATABASE_URL,site,async(sql,params)=>(await db.query(sql,params)).rows);
    const handler=createHandler(factory);
    let response=await handler(request('/session',{password:'wrong'}),env);
    assert.equal(response.status,401);
    response=await handler(request('/session',{password:env.PRESENTATION_PASSWORD},'https://evil.test'),env);
    assert.equal(response.status,403);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
    const input={password:env.PRESENTATION_PASSWORD,visitorId:crypto.randomUUID(),openedAt:new Date().toISOString(),shareTag:'invite-a'};
    response=await handler(request('/session',input),env);
    assert.equal(response.status,200);
    const session=await response.json();assert.ok(session.token);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://site-a.test');
    const event={id:crypto.randomUUID(),type:'link_click',slide:0,atMs:300,linkId:'0:0'};
    const snapshot={token:session.token,seq:1,elapsedMs:1000,slideMs:[600,400],events:[event]};
    response=await handler(request('/events',snapshot),env);
    assert.equal(response.status,200);assert.equal((await response.json()).accepted,true);
    response=await handler(request('/events',snapshot),env);
    assert.equal((await response.json()).accepted,false);
    response=await handler(request('/events',{...snapshot,seq:2,elapsedMs:1500,slideMs:[800,700]}),env);
    assert.equal((await response.json()).accepted,true);
    response=await handler(request('/events',snapshot),env);
    assert.equal((await response.json()).accepted,false);
    const store=factory(null,'site-a');
    let detail=await store.detail(session.sessionId);
    assert.equal(detail.session.viewing_ms,1500);assert.equal(detail.events.length,1);
    assert.equal(detail.session.ip_address,'192.0.2.1');
    assert.equal(await factory(null,'site-b').detail(session.sessionId),null);
    assert.equal(await factory(null,'site-b').saveSnapshot(session.sessionId,{...snapshot,seq:3}),false);
    // A larger sequence cannot redistribute cumulative time to inflate slide totals.
    assert.equal(await store.saveSnapshot(session.sessionId,{...snapshot,seq:3,elapsedMs:2000,slideMs:[0,2000]}),false);
    response=await handler(request('/events',{...snapshot,token:session.token+'x'}),env);assert.equal(response.status,401);
    response=await handler(request('/events',{...snapshot,seq:3,slideMs:[2000,0]}),env);assert.equal(response.status,400);
    response=await handler(request('/events',snapshot),{...env,SITE_ID:'site-b'});assert.equal(response.status,401);
    let reportRequest=new Request('https://worker.test/report?days=7');
    assert.equal((await handler(reportRequest,env)).status,401);
    reportRequest=new Request('https://worker.test/report?days=7',{headers:{Authorization:'Bearer '+env.ADMIN_PASSWORD}});
    response=await handler(reportRequest,env);assert.equal(response.status,200);
    const report=await response.json();assert.equal(report.summary.sessions,1);assert.equal(report.summary.viewing_ms,1500);assert.equal(report.clicks[0].clicks,1);
    await db.query("UPDATE analytics.sessions SET unlocked_at=now()-interval '8 days' WHERE id=$1",[session.sessionId]);
    await store.cleanup(7,90);detail=await store.detail(session.sessionId);assert.equal(detail.session.ip_address,null);
    await db.query("UPDATE analytics.sessions SET unlocked_at=now()-interval '91 days' WHERE id=$1",[session.sessionId]);
    const allTime=await store.report(null);
    assert.equal(allTime.summary.sessions,1);
    assert.equal(allTime.sessions.length,1);
    assert.equal(allTime.slides.length,2);
    assert.equal((await store.report(90)).summary.sessions,0);
    await store.cleanup(7,90);assert.equal(await store.detail(session.sessionId),null);
    assert.equal((await db.query('SELECT count(*)::int n FROM analytics.events')).rows[0].n,0);
  } finally {await db.close();}
});

test('automatic cleanup is disabled by default and cannot run from an old Cron Trigger',async()=>{
  const ctx={waitUntil(){assert.fail('Disabled retention must not start a database operation');}};
  await worker.scheduled({}, {}, ctx);
  await worker.scheduled({}, {...env,RETENTION_ENABLED:'false'}, ctx);
  const {readFile}=await import('node:fs/promises');
  const config=JSON.parse(await readFile(new URL('../wrangler.analytics.jsonc',import.meta.url),'utf8'));
  assert.equal(config.vars.RETENTION_ENABLED,'false');
  assert.deepEqual(config.triggers.crons,[]);
});

test('rate limiting and unavailable configuration fail closed before database access',async()=>{
  const handler=createHandler(()=>{throw Error('Database must not be accessed');});
  const limited={limit:async()=>({success:false})};
  assert.equal((await handler(request('/session',{}),{...env,LOGIN_LIMITER:limited})).status,429);
  assert.equal((await handler(request('/session',{}),{...env,LOGIN_LIMITER:undefined})).status,503);
  assert.equal((await handler(request('/session',{}),{...env,SESSION_SECRET:'short'})).status,503);
  const preflight=new Request('https://worker.test/events',{method:'OPTIONS',headers:{Origin:env.ALLOWED_ORIGINS}});
  assert.equal((await handler(preflight,env)).status,204);
});

test('oversized streamed bodies and malformed JSON are rejected',async()=>{
  await assert.rejects(()=>readJson(request('/session',{value:'x'.repeat(40000)})),e=>e.status===413);
  await assert.rejects(()=>readJson(new Request('https://worker.test/',{method:'POST',body:'not-json'})),e=>e.status===400);
});
