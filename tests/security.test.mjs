import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken, validateSnapshot } from '../backend/security.mjs';
import { ExposureClock } from '../src/analytics/clock.mjs';

test('session tokens reject tampering, another site, another origin, and expiration', async () => {
  const secret = 'test-signing-secret-that-is-long-enough';
  const claims = { sid: crypto.randomUUID(), site: 'a', origin: 'https://a.test', exp: Date.now() + 10000 };
  const token = await signToken(claims, secret);
  assert.equal((await verifyToken(token, secret, 'a', 'https://a.test')).sid, claims.sid);
  for (const [value, site, origin] of [[token+'x','a',claims.origin],[token,'b',claims.origin],[token,'a','https://b.test']]) {
    await assert.rejects(() => verifyToken(value, secret, site, origin));
  }
  await assert.rejects(() => verifyToken('', secret, 'a', claims.origin));
  const expired = await signToken({ ...claims, exp: Date.now()-1 }, secret);
  await assert.rejects(() => verifyToken(expired, secret, 'a', claims.origin));
});

test('timing validation rejects inflated, negative and malformed counters', () => {
  const valid = { seq: 1, elapsedMs: 1000, slideMs: [500,500], events: [] };
  assert.deepEqual(validateSnapshot(valid, 2, 1000), valid);
  for (const data of [{...valid,slideMs:[1001,0]}, {...valid,slideMs:[-1,0]}, {...valid,slideMs:[1]}, {...valid,elapsedMs:99999999}]) {
    assert.throws(() => validateSnapshot(data, 2, 1000));
  }
});

test('visible focused time pauses when hidden, attributes slide changes, and survives long gaps conservatively', () => {
  let now = 0;
  const clock = new ExposureClock(2, () => now);
  clock.setActive(true);
  now = 1000; clock.setSlide(1);
  now = 2500; clock.setActive(false);
  now = 20000; clock.setActive(true);
  now = 21000;
  assert.deepEqual(clock.snapshot(), [1000,2500]);
  now = 100000;
  assert.deepEqual(clock.snapshot(), [1000,7500]);
});
