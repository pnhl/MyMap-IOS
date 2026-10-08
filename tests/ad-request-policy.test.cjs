const test = require('node:test');
const assert = require('node:assert/strict');
const {loadPure} = require('./helpers.cjs');
const {AdRequestPolicy, classifyAdFailure, getAdRequestPolicy} = loadPure('src/services/adRequestPolicy.ts');

test('no-fill recognizes bridge and native error codes without treating it as invalid configuration', () => {
  assert.equal(classifyAdFailure({code:'googleMobileAds/no-fill'}), 'no-fill');
  assert.equal(classifyAdFailure({userInfo:{nativeCode:3}}), 'no-fill');
  assert.equal(classifyAdFailure({code:'invalid-request'}), 'invalid-request');
  assert.equal(classifyAdFailure({code:'network-error'}), 'transient');
});

test('no-fill backs off across more than three failures and recovers when inventory returns', () => {
  const policy = new AdRequestPolicy();
  let now = 1000;
  for (const delay of [60000, 120000, 240000, 300000, 300000, 300000]) {
    assert.equal(policy.begin(now), true);
    assert.equal(policy.begin(now), false, 'only one native request may be pending');
    policy.fail({code:'no-fill'}, now);
    assert.equal(policy.waitMs(now), delay);
    assert.equal(policy.begin(now + delay - 1), false);
    now += delay;
  }
  assert.equal(policy.begin(now), true);
  policy.succeed();
  assert.equal(policy.waitMs(now), 0);
  assert.equal(policy.begin(now), true);
  policy.fail({code:'no-fill'}, now);
  assert.equal(policy.waitMs(now), 60000, 'success resets the backoff');
});

test('invalid requests stop until configuration changes; network failures can retry', () => {
  const policy = new AdRequestPolicy();
  policy.begin(0);
  policy.fail({code:'network-error'}, 0);
  assert.equal(policy.waitMs(0), 30000);
  assert.equal(policy.begin(30000), true);
  policy.fail({code:'googleMobileAds/invalid-request'}, 30000);
  assert.equal(policy.waitMs(999999999), Infinity);
  assert.equal(policy.begin(999999999), false);
});

test('screens sharing an ad unit share its cooldown, while another unit can load independently', () => {
  const first = getAdRequestPolicy('unit-shared');
  const second = getAdRequestPolicy('unit-shared');
  const other = getAdRequestPolicy('unit-other');
  assert.equal(first.begin(1000), true);
  assert.equal(second.begin(1000), false);
  first.fail({code:'no-fill'}, 1000);
  assert.equal(second.waitMs(31000), 30000);
  assert.equal(other.begin(1000), true);
  other.release();
  assert.equal(other.begin(1000), true, 'cancelled consent preparation releases the lock');
});
