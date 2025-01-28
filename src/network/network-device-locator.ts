import find from 'local-devices';
import { Logger } from 'homebridge';
import { NetworkAddressConfig } from '../@types/network-address-config';
import { NetworkDevice } from '../@types/network-device';
import { NetworkAddressValidator } from './network-address-validator';

class NetworkDeviceLocator {
    constructor(private readonly log: Logger, private readonly uuidFactory: (address: string) => string){
    }

    public async find(address: NetworkAddressConfig): Promise<NetworkDevice | null> {
        // Implement the logic to find the network device here
        // You can use the `findIpByMac` method to find the IP address of a device by its MAC address
        // You can use the `ping` method to check if a device is reachable on the network
        if (!address) {
            this.log.error('No address provided');
            return null;
        }

        let networkDevice: NetworkDevice | null = null;

        if (address.type === 'IP') {
            networkDevice = await this.findByIp(address.value);
        } else if (address.type === 'MAC') {
            networkDevice = await this.findByMac(address.value);
        }

        this.log.error('Unsupported address type:', address.type);
        return networkDevice;
    }

    /**
     * Use local-devices library to find a device on the network by its IP address
     * @param ipAddress 
     * @returns 
     */
    private async findByIp(ipAddress: string): Promise<NetworkDevice | null> {
        try {
            this.log.info('Locating device by IP address:', ipAddress);
            const devices = await find();
            const device = devices.find(d => d.ip === ipAddress);

            if (device) {
                this.log.debug('Device found: %s', device);
            } else {
                this.log.error('Failed to find device for IP:', ipAddress);
            }

            return device ? <NetworkDevice>{ ip: device.ip, mac: device.mac, uuid: this.uuidFactory(device.mac) } : null;
        } catch (error) {
            console.error('Error finding device by IP address:', error);
            return null;
        }
    }
    
    /**
     * Use local-devices library to find devices on the network
     * The ARP (Address Resolution Protocol) table is automatically managed by the operating system
     * @param macAddress 
     * @returns 
     */
    public async findByMac(macAddress: string): Promise<NetworkDevice | null> {
        try {
            this.log.info('Locating device by MAC address:', macAddress);

            const devices = await find();

            const device = devices.find(d => {
                return d.mac.toLowerCase() === macAddress.toLowerCase() ? d : null;
            });

            if (device) { 
                this.log.debug('Device found: %s', device);
            } else {
                this.log.error('Failed to find IP for:', macAddress);
            }

            return device ? <NetworkDevice>{ 
                ip: device.ip, 
                mac: device.mac, 
                uuid: this.uuidFactory(device.mac)
            } : null;
        } catch (error) {
            console.error('Error finding IP by MAC address:', error);
            return null;
        }
    }

    private createNetworkDevice(device: find.IDevice): NetworkDevice {
        return <NetworkDevice>{ 
            ip: device.ip,
            mac: device.mac,
            uuid: this.uuidFactory(device.mac),
            refresh: async () => {
                const updatedDevice = await this.findByMac(device.mac);
                if (updatedDevice) {
                }
            }
        }
    }
}

export default NetworkDeviceLocator;