export type NetworkAddressType = 'IP' | 'MAC';

export type NetworkAddressConfig = {
    value: string;
    type: NetworkAddressType;
};