import './native-android.js';
import {App} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import {createSocialNative} from './ios-social.js';
import {guardAndroidSocial} from './android-social-guard.js';

// Source-built replacement for the archived Android bridge: retain all native
// capabilities while packaging the current billing clients and offer validation.
const origin=new URL(window.MANEE_CONFIG.supabaseUrl).origin;
window.MANEE_SOCIAL_NATIVE=createSocialNative({app:App,browser:Browser,
  scheme:ANDROID_PRODUCTION?'kr.co.manee.app':'kr.co.manee.app.staging',origin});
guardAndroidSocial(window.MANEE_SOCIAL_NATIVE,origin);
if(!ANDROID_PRODUCTION){
  window.MANEE_NATIVE.openSubscriptionStatus=()=>window.MANEE_NATIVE.openSettings();
  window.MANEE_NATIVE.subscriptionDenied=()=>window.MANEE_NATIVE.openSettings();
}
