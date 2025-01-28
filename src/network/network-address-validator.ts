import { NetworkAddressConfig } from "../@types/network-address-config";


class NetworkAddressValidator {
    static validate(address: NetworkAddressConfig): boolean {
        if (address.type === 'IP') {
            return this.validateIP(address.value);
        } else if (address.type === 'MAC') {
            return this.validateMAC(address.value);
        }
        return false;
    }

    private static validateIP(ip: string): boolean {
        const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }

    private static validateMAC(mac: string): boolean {
        const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        return macRegex.test(mac);
    }
}

export { NetworkAddressValidator, NetworkAddressConfig as NetworkDeviceAddress };