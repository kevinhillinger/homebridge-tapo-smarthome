# Homebridge Tapo (TP-Link) Smart Home

[![Build and Lint](https://github.com/kevinhillinger/homebridge-tapo-smarthome/actions/workflows/build.yml/badge.svg)](https://github.com/kevinhillinger/homebridge-tapo-smarthome/actions/workflows/build.yml)
[![CodeQL](https://github.com/kevinhillinger/homebridge-tapo-smarthome/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/kevinhillinger/homebridge-tapo-smarthome/actions/workflows/codeql-analysis.yml)

![Snyk Vulnerabilities for npm package](https://img.shields.io/snyk/vulnerabilities/npm/homebridge-tapo-smarthome)
![npm](https://img.shields.io/npm/dm/homebridge-tapo-smarthome)

Tapo Smart Home Plugin for [Homebridge](https://github.com/homebridge/homebridge).

This is a fork of the archived plugin [`homebridge-tp-link-tapo`](https://github.com/RaresAil/homebridge-tp-link-tapo) originally authored by 
[Nicolae Rares Ailincai](https://github.com/RaresAil).


|  |  |
|---------|-------------|
| Platform Name | `HomebridgeTapoSmartHome` |
| | |

## Installation 

> CHILD BRIDGE: While not required, install this plugin as a Child Bridge for the best performance. Most of the time the response time between the app and the device is 80ms. With the official app, response times were 1-2 seconds.

### Current device types

- Socket/Outlet (For devices with power measurement, they have a contact sensor, open means the current is > 0 and closed is 0)
- Hub (As alarm)
- Button S200
- Contact Sensor (T110)
- Light Bulb
- LED Strip

For other device type just open a issue.

### Config

You can add multiple devices bulbs with a single platform.

```json
{
  "platforms": [
    {
      "platform": "HomebridgeTapoSmarthome",
      "name": "Tapo Smart Home",
      "email": "tplink-account-email",
      "password": "tplink-account-password",
      "devices": [
        {
          "name": "Tapo device",
          "address": {
            "value": "24-2F-D1-9C-00-42 (the MAC address of the device)",
            "type": "IP | MAC"
          }
        }
      ]
    }
  ]
}
```

## Credits

- [Kevin Hillinger](https://github.com/RaresAil) - plugin maintainer

- [Nicolae Rares Ailincai](https://github.com/RaresAil) - original author of the [`homebridge-tp-link-tapo`](https://github.com/RaresAil/homebridge-tp-link-tapo) plugin, which this plugin is forked from (*He is not affiliated nor contributes to this plugin*)
