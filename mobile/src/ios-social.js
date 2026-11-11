import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { iosOAuthUrl } from './ios-oauth-url.js';
import { nativeSocialScheme } from './native-environment.mjs';
const AppleSignIn = registerPlugin('ManeeAppleSignIn');

export function createSocialNative({app, browser, scheme, origin}) {
  let listener;
  function callback(raw) {
    try {
      const url = new URL(raw);
      return url.protocol === scheme + ':' && url.host === 'auth' &&
        url.pathname === '/callback' && !url.username && !url.password;
    } catch { return false; }
  }
  return {
    scheme,
    async open(raw, {provider, intent} = {}) {
      const url = iosOAuthUrl(raw, origin, provider, intent);
      await browser.open({url:url.href});
    },
    async listen(handler) {
      if (listener) await listener.remove();
      const receive = async ({url}) => {
        if (!callback(url)) return;
        try { await browser.close(); } catch {}
        await handler(url);
      };
      listener = await app.addListener('appUrlOpen', receive);
      const launch = await app.getLaunchUrl();
      if (launch?.url) await receive(launch);
    },
  };
}

export function installIosSocial(config) {
  const native = createSocialNative({app:App,browser:Browser,
    scheme:nativeSocialScheme(config),origin:new URL(config.supabaseUrl).origin});
  if (Capacitor.isPluginAvailable('ManeeAppleSignIn')) native.appleSignIn = () => AppleSignIn.authorize();
  window.MANEE_SOCIAL_NATIVE = native;
}
