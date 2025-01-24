import find from 'local-devices';
import { Logger } from 'homebridge';

class NetworkDeviceLocator {
    private readonly log: Logger;

    constructor(log: Logger) {
        this.log = log;
    }

    /**
     * Use local-devices library to find devices on the network
     * The ARP (Address Resolution Protocol) table is automatically managed by the operating system
     * @param macAddress 
     * @returns 
     */
    public async findIpByMac(macAddress: string): Promise<string | null> {
        try {
            this.log.info('Locating IP by MAC address:', macAddress);

            const devices = await find();

            const device = devices.find(d => {
                return d.mac.toLowerCase() === macAddress.toLowerCase() ? d : null;
            });

            if (device) { 
                this.log.debug('Device found: %s', device);
            } else {
                this.log.error('Failed to find IP for:', macAddress);
            }

            return device ? device.ip : null;
        } catch (error) {
            console.error('Error finding IP by MAC address:', error);
            return null;
        }
    }
}

export default NetworkDeviceLocator;