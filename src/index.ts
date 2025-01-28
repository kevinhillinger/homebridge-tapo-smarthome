import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import Platform from './platform';

export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, Platform);
};
