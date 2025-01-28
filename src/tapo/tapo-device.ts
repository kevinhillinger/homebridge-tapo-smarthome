import { Logger } from 'homebridge';
import { NetworkDevice } from '../@types/network-device';

export class TapoDevice implements NetworkDevice {
    uuid: string;
    mac: string;
    ip: string;
    deviceLocator: any;

    constructor(networkDevice: NetworkDevice, private readonly findIp: (mac: string) => Promise<string>, private readonly log: Logger) {
        this.ip = networkDevice.ip;
        this.mac = networkDevice.mac;
        this.uuid = networkDevice.uuid;
    }

    async refresh(): Promise<void> {
        const ip = await this.findIp(this.mac);
        if (ip && ip !== this.ip) {
            this.log.info('Device IP address changed from %s to %s', this.ip, ip);
            this.ip = ip;
        }
    }

    toString(): string {
        return this.ip;
    }
}