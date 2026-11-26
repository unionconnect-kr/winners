import './native.js';
import { installIosSocial } from './ios-social.js';
import {App} from '@capacitor/app';
import {registerPlugin} from '@capacitor/core';
import {installNativeUpdatePolicy} from './update-policy.mjs';
installNativeUpdatePolicy({App,native:window.MANEE_NATIVE,platform:'ios',store:registerPlugin('ManeeAppUpdate')});
installIosSocial(window.MANEE_CONFIG);

import {installVersionReporter} from './client-version.mjs';
installVersionReporter({App,native:window.MANEE_NATIVE,platform:'ios'});
