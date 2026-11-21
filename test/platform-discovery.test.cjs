const assert = require('node:assert/strict');
const { setImmediate } = require('node:timers/promises');
const test = require('node:test');

require('ts-node').register({
  compilerOptions: { module: 'CommonJS' },
  transpileOnly: true
});

const Platform = require('../src/platform').default;
const { PLATFORM_NAME, PLUGIN_NAME } = require('../src/settings');

const credentials = { email: 'owner@example.test', password: 'test-password' };
const configuredAddress = { type: 'MAC', value: '02:00:00:00:00:01' };

function prepareLaunch(config) {
  const warnings = [];
  const lookups = [];
  const unregistered = [];
  const errors = [];
  const generate = (value) => `uuid-${value}`;
  const cached = [configuredAddress.value, '02:00:00:00:00:02'].map((value) => ({
    UUID: generate(value),
    displayName: 'Cached Tapo device',
    context: { child: false }
  }));
  let finishLaunching;
  const platform = new Platform({
    debug() {},
    info() {},
    warn(message) { warnings.push(message); },
    error(...args) { errors.push(args); }
  }, config, {
    hap: { uuid: { generate } },
    on(event, callback) {
      assert.equal(event, 'didFinishLaunching');
      finishLaunching = callback;
    },
    unregisterPlatformAccessories(plugin, platformName, accessories) {
      assert.equal(plugin, PLUGIN_NAME);
      assert.equal(platformName, PLATFORM_NAME);
      unregistered.push(...accessories);
    }
  });
  cached.forEach((accessory) => platform.configureAccessory(accessory));
  platform.deviceLocator.find = async (address) => {
    lookups.push(address);
    return null;
  };

  return {
    cached, lookups, unregistered, warnings,
    async launch() {
      finishLaunching();
      await setImmediate();
      assert.deepEqual(errors, []);
    }
  };
}

for (const [description, config, warning] of [
  ['missing configuration', undefined, /email and password/],
  ['missing credentials', { addresses: [] }, /email and password/],
  ['non-string password', { ...credentials, password: [], addresses: [] }, /email and password/],
  ['missing address list', credentials, /addresses/],
  ['non-array address list', { ...credentials, addresses: configuredAddress }, /addresses/],
  ['missing address entry', { ...credentials, addresses: [null] }, /addresses/],
  ['malformed address alongside a valid one', {
    ...credentials,
    addresses: [configuredAddress, { type: 'IP', value: 'invalid' }]
  }, /addresses/]
]) {
  test(`keeps cached accessories with ${description}`, async () => {
    const { launch, lookups, unregistered, warnings } = prepareLaunch(config);
    await launch();
    assert.deepEqual(unregistered, []);
    assert.deepEqual(lookups, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], warning);
  });
}

test('removes all cached accessories for an explicit empty address list', async () => {
  const { launch, cached, lookups, unregistered, warnings } = prepareLaunch({ ...credentials, addresses: [] });
  await launch();
  assert.deepEqual(unregistered, cached);
  assert.deepEqual(lookups, []);
  assert.deepEqual(warnings, []);
});

test('discovers configured addresses and removes only the stale cached accessory', async () => {
  const addresses = [configuredAddress, { type: 'IP', value: '192.0.2.1' }];
  const { launch, cached, lookups, unregistered, warnings } = prepareLaunch({
    ...credentials,
    addresses
  });
  await launch();
  assert.deepEqual(lookups, addresses);
  assert.deepEqual(unregistered, [cached[1]]);
  assert.deepEqual(warnings, []);
});
