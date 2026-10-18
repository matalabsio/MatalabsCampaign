import test from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsClient, normalizeApiUrl, initializeAnalytics } from '../src/analytics/client.mjs';

test('API URLs accept a bare Worker hostname and reject unsafe or incorrect endpoints', () => {
  const host='matalabs-campaign-analytics.product-ea6.workers.dev';
  assert.equal(normalizeApiUrl(host),'https://'+host);
  assert.equal(normalizeApiUrl('  https://'+host+'/  '),'https://'+host);
  assert.equal(normalizeApiUrl('http://localhost:8787/'),'http://localhost:8787');
  for(const url of ['http://'+host,'https://'+host+'/admin','not a url','javascript:alert(1)','https://user:pass@'+host,'https://'+host+'?secret=x']) {
    assert.throws(()=>normalizeApiUrl(url));
  }
});

test('invalid configured API does not throw during startup or silently enable local authentication',()=>{
  const state=initializeAnalytics('not a url',6);
  assert.equal(state.client,null);
  assert.match(state.error,/configuration/i);
  assert.equal(state.configured,true);
  const disabled=initializeAnalytics('',6);
  assert.equal(disabled.configured,false);
  assert.equal(disabled.error,null);
});

test('client keeps failed uploads, sends cumulative times, pauses hidden time, and records link clicks', async () => {
  const names=['window','document','location','localStorage','fetch','performance','setInterval'];
  const original=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  let now=0, focused=true, failNext=false;
  const requests=[], intervals=[];
  const doc=new EventTarget();doc.visibilityState='visible';doc.hasFocus=()=>focused;
  const win=new EventTarget();
  const storage=new Map();
  const values={window:win,document:doc,location:{href:'https://site.test/?share=invite-1'},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    performance:{now:()=>now},setInterval:fn=>{intervals.push(fn);return intervals.length;},
    fetch:async(url,options)=>{
      const body=JSON.parse(options.body);requests.push({url,body});
      if(url.endsWith('/session')) return Response.json({token:'test-token',expiresAt:Date.now()+100000});
      if(failNext){failNext=false;throw Error('offline');}
      return Response.json({ok:true,accepted:true});
    }};
  try {
    for(const [name,value] of Object.entries(values)) Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
    const client=new AnalyticsClient('https://worker.test',2);
    now=2000;await client.unlock('password');
    assert.equal(requests[0].body.shareTag,'invite-1');
    assert.equal(storage.size,1); // Only a random browser ID is persisted; no password or bearer token.
    now=3000;client.clock.tick();
    focused=false;client.setActive();
    now=10000;client.setActive();
    focused=true;client.setActive();
    now=11000;client.clock.setSlide(1);
    now=12000;failNext=true;await client.flush();
    const failed=requests.at(-1).body;
    assert.deepEqual(failed.slideMs,[2000,1000]);assert.equal(failed.elapsedMs,12000);
    await client.flush();
    assert.equal(requests.at(-1).body.events[0].id,failed.events[0].id);
    assert.equal(client.events.length,0);
    const click=new Event('click');click.targetLink={dataset:{slide:'1',linkId:'1:0'}};
    Object.defineProperty(click,'target',{value:{closest:()=>click.targetLink}});
    doc.dispatchEvent(click);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(requests.at(-1).body.events[0].type,'link_click');
    assert.equal(requests.at(-1).body.events[0].linkId,'1:0');
    assert.equal(client.clock.active,true);
    doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(client.clock.active,false);
    let expired=false;win.addEventListener('analytics:expired',()=>expired=true);
    client.expiresAt=Date.now()-1;await client.flush();assert.equal(expired,true);
  } finally {
    for(const name of names) {
      const descriptor=original.get(name);
      if(descriptor) Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
    }
  }
});
