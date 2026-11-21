import assert from 'node:assert/strict';
import test from 'node:test';
import entryPoint from '../dist/index.js';
import platformModule from '../dist/platform.js';
import tpLinkModule from '../dist/api/TPLink.js';
import settings from '../dist/settings.js';

const Platform = platformModule.default;
const TPLink = tpLinkModule.default;
const { PLATFORM_NAME, PLUGIN_NAME } = settings;
const credentials = { email: 'owner@example.test', password: 'test-password' };
const configuredAddress = { type: 'MAC', value: '02:00:00:00:00:01' };
const ipAddress = { type: 'IP', value: '192.0.2.1' };
const networkDevice = { ip: ipAddress.value, mac: configuredAddress.value, uuid: `uuid-${configuredAddress.value}` };

function stubDeviceInfo(t) {
  t.mock.method(TPLink.prototype, 'setup', async function () { return this; });
  t.mock.method(TPLink.prototype, 'getInfo', async () => ({ nickname: '' }));
}

function prepareLaunch(config, { resolveDevice = false, childInventory = null, cacheChild = false } = {}) {
  const warnings = [];
  const lookups = [];
  const unregistered = [];
  const errors = [];
  const loadedChildren = [];
  const generate = (value) => `uuid-${value}`;
  const cached = [configuredAddress.value, '02:00:00:00:00:02'].map((value) => ({
    UUID: generate(value),
    displayName: 'Cached Tapo device',
    context: { child: false }
  }));
  if (cacheChild) {
    cached.push({
      UUID: generate('fixture-child'),
      displayName: 'Cached hub child',
      context: { child: true, parent: networkDevice.uuid }
    });
  }
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
  platform.createTapoAccessory = () => ({});
  platform.loadChildDevice = async (id) => { loadedChildren.push(id); };
  if (childInventory !== null) {
    platform.hubs.push({ UUID: networkDevice.uuid, getChildDevices: async () => childInventory });
  }
  platform.deviceLocator.find = async (address) => {
    lookups.push(address);
    const knownAddress = address.value === networkDevice.ip || address.value === networkDevice.mac;
    return resolveDevice && knownAddress ? networkDevice : null;
  };

  return {
    cached, lookups, unregistered, warnings, loadedChildren,
    async launch() {
      await finishLaunching();
      assert.deepEqual(errors, []);
    }
  };
}

test('registers the platform from the compiled plugin entry point', () => {
  const registered = [];
  entryPoint.default({
    registerPlatform(name, constructor) { registered.push([name, constructor]); }
  });
  assert.deepEqual(registered, [[PLATFORM_NAME, Platform]]);
});

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

test('removes only the stale cached device after a complete address lookup', async (t) => {
  stubDeviceInfo(t);
  const addresses = [configuredAddress];
  const { launch, cached, lookups, unregistered, warnings } = prepareLaunch({
    ...credentials,
    addresses
  }, { resolveDevice: true });
  await launch();
  assert.deepEqual(lookups, addresses);
  assert.deepEqual(unregistered, [cached[1]]);
  assert.deepEqual(warnings, []);
});

test('keeps an IP-configured accessory under its resolved MAC-based identity', async (t) => {
  stubDeviceInfo(t);
  const { launch, cached, unregistered } = prepareLaunch({
    ...credentials,
    addresses: [ipAddress]
  }, { resolveDevice: true });
  await launch();
  assert.deepEqual(unregistered, [cached[1]]);
});

test('preserves the cache if a configured address cannot be resolved', async () => {
  const { launch, unregistered } = prepareLaunch({
    ...credentials,
    addresses: [ipAddress]
  }, { cacheChild: true });
  await launch();
  assert.deepEqual(unregistered, []);
});

test('defers removal when only some configured addresses resolve', async (t) => {
  stubDeviceInfo(t);
  const { launch, lookups, unregistered, warnings } = prepareLaunch({
    ...credentials,
    addresses: [configuredAddress, { type: 'IP', value: '192.0.2.2' }]
  }, { resolveDevice: true });
  await launch();
  assert.equal(lookups.length, 2);
  assert.deepEqual(unregistered, []);
  assert.match(warnings[0], /addresses could not be resolved/);
});

for (const [description, childInventory, shouldRemoveChild, expectedChildIds] of [
  ['the hub was not inventoried', null, false, []],
  ['the hub did not return a list', {}, false, []],
  ['the hub returned an incomplete inventory', [{}], false, []],
  ['the hub confirmed it has no children', [], true, []],
  ['the hub confirmed the cached child still exists', [{ device_id: 'fixture-child' }], false, ['fixture-child']]
]) {
  test(`reconciles cached children when ${description}`, async (t) => {
    stubDeviceInfo(t);
    const { launch, cached, unregistered, loadedChildren } = prepareLaunch({
      ...credentials,
      addresses: [configuredAddress]
    }, { resolveDevice: true, childInventory, cacheChild: true });
    await launch();
    assert.deepEqual(unregistered, shouldRemoveChild ? [cached[1], cached[2]] : [cached[1]]);
    assert.deepEqual(loadedChildren, expectedChildIds);
  });
}
