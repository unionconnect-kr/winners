import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

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
    async open(raw) {
      const url = new URL(raw);
      if (url.origin !== origin || !url.pathname.startsWith('/auth/v1/') || url.username || url.password)
        throw Error('로그인 주소를 확인하지 못했어요.');
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
  window.MANEE_SOCIAL_NATIVE = createSocialNative({app:App,browser:Browser,
    scheme:'kr.co.manee.app.staging',origin:new URL(config.supabaseUrl).origin});
}
