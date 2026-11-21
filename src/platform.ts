import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic
} from 'homebridge';

import TapoAccessory, { ChildType } from './@types/TapoAccessory';
import { TapoAccessoryType } from './@types/TapoAccessoryType';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import DeviceInfo from './api/@types/DeviceInfo';
import Context from './@types/Context';
import TPLink from './api/TPLink';
import delay from './utils/delay';

import HubAccessory, { HubContext } from './accessories/Hub';
import LightBulbAccessory from './accessories/LightBulb';
import OutletAccessory from './accessories/Outlet';
import { ChildInfo } from './api/@types/ChildListInfo';
import ButtonAccessory from './accessories/Button';
import ContactAccessory from './accessories/Contact';
import MotionSensorAccessory from './accessories/MotionSensor';
import NetworkDeviceLocator from './network/network-device-locator';
import { NetworkAddressConfig } from './@types/network-address-config';
import { NetworkAddressValidator } from './network/network-address-validator';
import { TapoDevice } from './tapo/tapo-device';

export default class Platform implements DynamicPlatformPlugin {
  private readonly TIMEOUT_TRIES = 20;

  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory<Context | HubContext>[] = [];
  public readonly registeredDevices: TapoAccessory[] = [];
  public readonly hubs: HubAccessory[] = [];

  private readonly deviceRetry: { [key: string]: number; } = {};

  deviceLocator: NetworkDeviceLocator;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {

    this.deviceLocator = new NetworkDeviceLocator(log, this.api.hap.uuid.generate);
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    
    this.deviceLocator = new NetworkDeviceLocator(log, this.api.hap.uuid.generate);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.log.debug('Finished initializing platform:', this.config?.name);

      return this.discoverDevices();
    });
  }

  /**
   * REQUIRED - Homebridge will call the "configureAccessory" method once for every cached
   * accessory restored
   */
  configureAccessory(accessory: PlatformAccessory<Context>) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private async discoverDevices() {
    try {
      const { email, password, addresses } = this.config ?? {};
      if (
        typeof email !== 'string' || !email.trim() ||
        typeof password !== 'string' || !password
      ) {
        this.log.warn(
          'Keeping cached Tapo accessories. Set the Tapo account email and password to enable discovery.'
        );
        return;
      }

      if (
        !Array.isArray(addresses) ||
        addresses.some((address) =>
          typeof address?.value !== 'string' || !NetworkAddressValidator.validate(address)
        )
      ) {
        this.log.warn(
          'Keeping cached Tapo accessories. Set "addresses" to an array with a valid "type" (IP or MAC) and "value" for each device.'
        );
        return;
      }

      if (addresses.length === 0) {
        if (this.accessories.length > 0) {
          this.api.unregisterPlatformAccessories(
            PLUGIN_NAME,
            PLATFORM_NAME,
            this.accessories
          );
        }

        return;
      }

      const configuredUUIDs = await Promise.all(
        addresses.map((address) => this.loadDevice(address, email, password))
      );
      const inventoriedHubs = new Set<string>();
      const discoveredChildUUIDs = new Set<string>();
      await Promise.all(
        this.hubs.map(async (hub) => {
          const devices = await hub.getChildDevices();
          if (!Array.isArray(devices)) {
            return;
          }

          const children = devices.filter((device): device is ChildInfo =>
            typeof device?.device_id === 'string' && device.device_id.length > 0
          );
          if (children.length === devices.length) {
            inventoriedHubs.add(hub.UUID);
          }
          await Promise.all(children.map((device) => {
            discoveredChildUUIDs.add(this.api.hap.uuid.generate(device.device_id));
            return this.loadChildDevice(device.device_id, device, hub);
          }));
        })
      );

      // A failed lookup may belong to an existing accessory, especially when configured by IP.
      if (configuredUUIDs.every((uuid): uuid is string => uuid !== undefined)) {
        this.checkOldDevices(new Set(configuredUUIDs), inventoriedHubs, discoveredChildUUIDs);
      } else {
        this.log.warn('Keeping cached Tapo accessories because some configured addresses could not be resolved.');
      }
    } catch (err: any) {
      this.log.error('Failed to discover devices:', err.message);
    }
  }

  private async loadDevice(address: NetworkAddressConfig, email: string, password: string): Promise<string | undefined> {
    const networkDevice = await this.deviceLocator.find(address);

    if (!networkDevice) {
      return;
    }
    const uuid = networkDevice.uuid;

    if (this.deviceRetry[uuid] === undefined) {
      this.deviceRetry[uuid] = this.TIMEOUT_TRIES;
    } else if (this.deviceRetry[uuid] <= 0) {
      this.log.info('Retry timeout:', networkDevice.ip, '|', networkDevice.mac);
      return uuid;
    } else {
      this.log.info('Retry to connect in 10s', ':', networkDevice.ip);
      await delay(10 * 1000);

      this.log.info('Try for', networkDevice.ip,':',`${this.deviceRetry[uuid]}/${this.TIMEOUT_TRIES}`);
    }

    try {
      const tapoDevice = new TapoDevice(networkDevice, async (mac: string) => {
        const device = await this.deviceLocator.findByMac(mac);
        if (!device) {
          throw new Error(`Device with MAC ${mac} not found`);
        }
        return device.ip;
      }, this.log);

      const tpLink = await new TPLink(tapoDevice, email, password, this.log).setup();
      const deviceInfo = await tpLink.getInfo();
      if (Object.keys(deviceInfo || {}).length === 0) {
        this.log.error('Failed to get info about:', networkDevice.ip);
        this.deviceRetry[uuid] -= 1;
        return await this.loadDevice(address, email, password);
      }

      const deviceName = Buffer.from(
        deviceInfo?.nickname || 'Tm8gTmFtZQ==',
        'base64'
      ).toString('utf-8');

      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid
      );

      if (existingAccessory) {
        this.log.info(
          'Restoring existing accessory from cache:',
          existingAccessory.displayName
        );
        existingAccessory.context = {
          name: deviceName,
          tpLink,
          child: false
        };

        const tapoAccessory = this.createTapoAccessory(existingAccessory, deviceInfo);

        if (!tapoAccessory) {
          this.log.error(
            'Failed to register accessory "%s" of type "%s" (%s)',
            deviceName,
            TapoAccessory.getType(deviceInfo),
            deviceInfo?.type
          );
          return uuid;
        }

        this.registeredDevices.push(tapoAccessory);
        return uuid;
      }

      this.log.info('Adding new accessory:', deviceName);
      const accessory = new this.api.platformAccessory<Context>(
        deviceName,
        uuid
      );
      accessory.context = {
        name: deviceName,
        tpLink,
        child: false
      };

      const registeredAccessory = this.createTapoAccessory(accessory, deviceInfo);
      if (!registeredAccessory) {
        this.log.error(
          'Failed to register accessory "%s" of type "%s" (%s)',
          deviceName,
          TapoAccessory.getType(deviceInfo),
          deviceInfo?.type
        );
        return uuid;
      }

      this.registeredDevices.push(registeredAccessory);

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      return uuid;
    } catch (err: any) {
      this.log.error('Failed to get info about:', address, '|', err.message);
      this.deviceRetry[uuid] -= 1;
      return await this.loadDevice(address, email, password);
    }
  }

  private async loadChildDevice(
    id: string,
    deviceInfo: ChildInfo,
    parent: HubAccessory
  ) {
    const uuid = this.api.hap.uuid.generate(id);
    if (this.deviceRetry[uuid] === undefined) {
      this.deviceRetry[uuid] = this.TIMEOUT_TRIES;
    } else if (this.deviceRetry[uuid] <= 0) {
      this.log.info('Retry timeout:', id);
      return;
    } else {
      this.log.info('Retry to connect in 10s', ':', id);
      await delay(10 * 1000);
      this.log.info(
        'Try for',
        id,
        ':',
        `${this.deviceRetry[uuid]}/${this.TIMEOUT_TRIES}`
      );
    }

    try {
      const deviceName = Buffer.from(
        deviceInfo.nickname || 'Tm8gTmFtZQ==',
        'base64'
      ).toString('utf-8');

      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid
      );

      if (existingAccessory) {
        this.log.info(
          'Restoring existing child accessory from cache:',
          existingAccessory.displayName
        );
        existingAccessory.context = {
          name: deviceName,
          child: true,
          parent: parent.UUID
        };

        const registeredAccessory = this.registerChild(
          existingAccessory,
          deviceInfo,
          parent
        );

        if (!registeredAccessory) {
          this.log.error(
            'Failed to register child accessory "%s" of type "%s" (%s)',
            deviceName,
            TapoAccessory.GetChildType(deviceInfo),
            deviceInfo?.type
          );
          return;
        }

        this.registeredDevices.push(registeredAccessory);
        return;
      }

      this.log.info('Adding new child accessory:', deviceName);
      const accessory = new this.api.platformAccessory<HubContext>(
        deviceName,
        uuid
      );
      accessory.context = {
        name: deviceName,
        child: true,
        parent: parent.UUID
      };

      const registeredAccessory = this.registerChild(
        accessory,
        deviceInfo,
        parent
      );
      if (!registeredAccessory) {
        this.log.error(
          'Failed to register child accessory "%s" of type "%s" (%s)',
          deviceName,
          TapoAccessory.GetChildType(deviceInfo),
          deviceInfo?.type
        );
        return;
      }

      this.registeredDevices.push(registeredAccessory);

      return this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory
      ]);
    } catch (err: any) {
      this.log.error('Failed to get info about child:', id, '|', err.message);
      this.deviceRetry[uuid] -= 1;
      return await this.loadChildDevice(id, deviceInfo, parent);
    }
  }

  private checkOldDevices(
    configuredUUIDs: ReadonlySet<string>,
    inventoriedHubs: ReadonlySet<string>,
    discoveredChildUUIDs: ReadonlySet<string>
  ) {
    for (const accessory of this.accessories) {
      const uuid = accessory.UUID.toString();
      const { context } = accessory;
      const deleteDevice = context.child
        ? !configuredUUIDs.has(context.parent) ||
          (inventoriedHubs.has(context.parent) && !discoveredChildUUIDs.has(uuid))
        : !configuredUUIDs.has(uuid);

      if (deleteDevice) {
        this.log.info('Remove cached accessory:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  private readonly accessoryClasses = {
    [TapoAccessoryType.LightBulb]: LightBulbAccessory,
    [TapoAccessoryType.Outlet]: OutletAccessory,
    [TapoAccessoryType.Hub]: HubAccessory
  };

  private createTapoAccessory(accessory: PlatformAccessory<Context | HubContext>, deviceInfo: DeviceInfo): TapoAccessory | null {
    const AccessoryType = this.accessoryClasses[TapoAccessory.getType(deviceInfo)];
    if (!AccessoryType) {
      return null;
    }

    const instance = new AccessoryType(this, accessory, this.log, deviceInfo);

    if (instance instanceof HubAccessory) {
      this.hubs.push(instance);
    }

    return instance;
  }

  private readonly childClasses = {
    [ChildType.Button]: ButtonAccessory,
    [ChildType.Contact]: ContactAccessory,
    [ChildType.MotionSensor]: MotionSensorAccessory,
  };

  private registerChild(
    accessory: PlatformAccessory<Context | HubContext>,
    deviceInfo: ChildInfo,
    parent: HubAccessory
  ): TapoAccessory | null {
    const ChildClass = this.childClasses[TapoAccessory.GetChildType(deviceInfo)];
    if (!ChildClass) {
      return null;
    }

    return new ChildClass(parent, this, accessory, this.log, deviceInfo);
  }
}
