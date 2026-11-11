// linkIdentity returns a provider URL; signInWithOAuth returns GoTrue's URL.
// Both layers validate it without trusting arbitrary hosts or redirect targets.
export function iosOAuthUrl(raw, origin, provider, intent = 'signin') {
  const reject = () => { throw Error('로그인 주소를 확인하지 못했어요.'); };
  let url;
  try { url = new URL(raw); } catch { return reject(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return reject();
  const providers = { kakao: 'kakao', naver: 'custom:naver' };
  const one = key => url.searchParams.getAll(key).length === 1 && url.searchParams.get(key);
  if (url.origin === origin && url.pathname === '/auth/v1/authorize') {
    const p = one('provider');
    if (!p || (provider ? p !== providers[provider] : !Object.values(providers).includes(p))) return reject();
    return url;
  }
  const endpoints = {
    kakao: 'https://kauth.kakao.com/oauth/authorize',
    naver: 'https://nid.naver.com/oauth2.0/authorize',
  };
  if (intent !== 'link' || url.origin + url.pathname !== endpoints[provider] || !one('state') ||
      !one('client_id') || one('response_type') !== 'code' || !one('redirect_uri')) return reject();
  let callback;
  try { callback = new URL(url.searchParams.get('redirect_uri')); } catch { return reject(); }
  if (callback.origin !== origin || callback.pathname !== '/auth/v1/callback' || callback.username ||
      callback.password || callback.hash) return reject();
  return url;
}
