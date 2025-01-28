import { Logger, PlatformAccessory } from 'homebridge';

import { ChildInfo } from '../api/@types/ChildListInfo';
import DeviceInfo from '../api/@types/DeviceInfo';
import TPLink from '../api/TPLink';
import Platform from '../platform';
import Context from './Context';
import { TapoAccessoryType } from './TapoAccessoryType';

export enum ChildType {
  Unknown = 'Unknown',
  Button = 'LightBulb',
  Contact = 'Contact',
  MotionSensor = 'MotionSensor'
}

abstract class TapoAccessory {
  protected readonly tpLink: TPLink;
  protected readonly model: string;
  protected readonly mac: string;

  /**
   * Get the type of the device with the Tapo device info
   * @param deviceInfo
   * @returns 
   */
  public static getType(deviceInfo: DeviceInfo): TapoAccessoryType {
    if (deviceInfo?.type?.includes('BULB')) {
      return TapoAccessoryType.LightBulb;
    }

    if (deviceInfo?.type?.includes('PLUG')) {
      return TapoAccessoryType.Outlet;
    }

    if (deviceInfo?.type?.includes('HUB')) {
      return TapoAccessoryType.Hub;
    }

    return TapoAccessoryType.Unknown;
  }

  public static GetChildType(deviceInfo: ChildInfo): ChildType {
    if (deviceInfo?.type?.includes('SENSOR')) {
      if (deviceInfo?.category?.includes('button')) {
        return ChildType.Button;
      }

      if (deviceInfo?.category?.includes('contact-sensor')) {
        return ChildType.Contact;
      }

      if (deviceInfo?.category?.includes('motion-sensor')) {
        return ChildType.MotionSensor;
      }
    }

    return ChildType.Unknown;
  }

  public abstract get UUID(): string;

  constructor(
    protected readonly platform: Platform,
    protected readonly accessory: PlatformAccessory<Context>,
    protected readonly log: Logger,
    protected readonly deviceInfo: DeviceInfo | ChildInfo
  ) {
    this.tpLink = accessory.context.tpLink;
    this.model = deviceInfo.model;
    this.mac = deviceInfo.mac;
  }
}

export default TapoAccessory;
