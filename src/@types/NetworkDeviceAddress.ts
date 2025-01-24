export type NetworkDeviceAddressType = 'IP' | 'MAC';

export type NetworkDeviceAddress = {
    value: string;
    type: NetworkDeviceAddressType;
};