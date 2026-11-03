import {iosOAuthUrl} from './ios-oauth-url.js';
export function androidOAuthUrl(raw,origin,provider,intent='signin') {
  if(provider!=='apple')return iosOAuthUrl(raw,origin,provider,intent);
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.origin!==origin||url.pathname!=='/auth/v1/authorize'||url.username||url.password||url.hash||url.searchParams.getAll('provider').length!==1||url.searchParams.get('provider')!=='apple')throw Error('로그인 주소를 확인하지 못했어요.');
  return url;
}
// Preserve Android plugin listeners and all existing native capabilities.
export function guardAndroidSocial(native, origin) {
  if (!native || typeof native.open !== 'function') throw Error('Android social bridge is unavailable');
  const open=native.open.bind(native);
  native.open=async(raw,{provider,intent}={})=>{
    const url=androidOAuthUrl(raw,origin,provider,intent);
    return open(url.href);
  };
  return native;
}
