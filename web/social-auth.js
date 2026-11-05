/* Shared by the web and packaged apps. OAuth sessions stay isolated until the
 * server has verified the callback; the normal MANEE session owns all data. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MANEE_SOCIAL_AUTH = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const PROVIDERS = ['kakao', 'naver'];
  const AUTH_PROVIDERS = { kakao: 'kakao', naver: 'custom:naver' };
  function iosOAuthUrl(raw, origin, provider, intent = 'signin') {
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
  const endpoints = { kakao: 'https://kauth.kakao.com/oauth/authorize', naver: 'https://nid.naver.com/oauth2.0/authorize' };
  if (intent !== 'link' || url.origin + url.pathname !== endpoints[provider] || !one('state') ||
      !one('client_id') || one('response_type') !== 'code' || !one('redirect_uri')) return reject();
  let callback;
  try { callback = new URL(url.searchParams.get('redirect_uri')); } catch { return reject(); }
  if (callback.origin !== origin || callback.pathname !== '/auth/v1/callback' || callback.username ||
      callback.password || callback.hash) return reject();
  return url;
}
  const TERMS_VERSION = '2026-10-26';
  const MAX_AGE = 15 * 60 * 1000;
  function failure(code, message) { return Object.assign(new Error(message), { code }); }
  function providerOf(user, provider) {
    return !!AUTH_PROVIDERS[provider] && !!user?.identities?.some(identity => identity.provider === AUTH_PROVIDERS[provider]);
  }
  function createController(options) {
    const { supabase, db, config, storage, getLocation, open, applySession } = options;
    const now = options.now || Date.now;
    const random = options.random || (() => crypto.randomUUID());
    const prefix = 'manee-' + config.projectRef + '-social';
    const pendingKey = prefix + '-pending';
    const memory = new Map();
    let busy = false, completing = false, ready = null;
    const oauthStorage = {
      getItem(key) { return key.endsWith('-code-verifier') ? storage.getItem(key) : memory.get(key) || null; },
      setItem(key, value) { if (key.endsWith('-code-verifier')) storage.setItem(key, value); else memory.set(key, value); },
      removeItem(key) { if (key.endsWith('-code-verifier')) storage.removeItem(key); else memory.delete(key); }
    };
    const oauth = supabase.createClient(config.supabaseUrl, config.publishableKey, {
      auth: { flowType: 'pkce', storageKey: prefix, storage: oauthStorage,
        detectSessionInUrl: false, autoRefreshToken: false, persistSession: true }
    });
    function pending() {
      try { return JSON.parse(storage.getItem(pendingKey) || 'null'); } catch { return null; }
    }
    function cancel() {
      storage.removeItem(pendingKey);
      oauthStorage.removeItem(prefix + '-code-verifier');
      memory.clear();
      busy = false;
    }
    async function providers() {
      if (ready) return ready;
      const response = await (options.fetch || fetch)(config.supabaseUrl + '/auth/v1/settings', {
        headers: { apikey: config.publishableKey }, signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw failure('settings_failed', '로그인 방법을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
      const settings = await response.json();
      // GoTrue settings does not include custom providers. Enable Naver only in
      // environments where its custom:naver provider has been provisioned.
      ready = { kakao: settings.external?.kakao === true, naver: config.socialProviders?.naver === true };
      return ready;
    }
    async function currentUserId() {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      return data?.session?.user?.id || null;
    }
    async function account(expectedUserId) {
      const { data, error } = await db.auth.getUser();
      const user = data?.user;
      if (error || !expectedUserId || !user || user.id !== expectedUserId ||
          await currentUserId() !== expectedUserId) {
        throw failure('account_lookup_failed', '연결 상태를 확인하지 못했어요. 다시 시도해 주세요.');
      }
      if (!Array.isArray(user.identities)) {
        throw failure('identities_missing', '연결된 계정 정보를 확인하지 못했어요. 다시 시도해 주세요.');
      }
      return { userId: user.id, linked: Object.fromEntries(PROVIDERS.map(p => [p, providerOf(user, p)])) };
    }
    function callbackUrl(flow) {
      const loc = new URL(getLocation());
      const url = options.nativeScheme ? new URL(options.nativeScheme + '://auth/callback') : new URL('/', loc.origin);
      url.searchParams.set('manee_auth', 'callback');
      url.searchParams.set('flow', flow);
      return url.href;
    }
    async function begin(provider, { intent = 'signin', role = 'owner', remember = true } = {}) {
      if (!PROVIDERS.includes(provider) || !['signin', 'link'].includes(intent) || !['owner', 'staff'].includes(role)) {
        throw failure('invalid_request', '로그인 방법을 다시 선택해 주세요.');
      }
      if (busy || completing) throw failure('in_progress', '이미 로그인을 진행 중이에요.');
      busy = true;
      try {
        if (!(await providers())[provider]) throw failure('provider_unavailable', '이 로그인 방법은 아직 사용할 수 없어요. 아이디로 로그인해 주세요.');
        const mainUserId = await currentUserId();
        if (intent === 'link') {
          const { data, error } = await db.auth.getUser();
          if (error || !mainUserId || data?.user?.id !== mainUserId) throw failure('authentication_required', '기존 매니 계정으로 먼저 로그인해 주세요.');
          const { data: sessionData, error: sessionError } = await db.auth.getSession();
          if (sessionError || sessionData?.session?.user?.id !== mainUserId) throw failure('account_changed', '계정이 바뀌었어요. 다시 시작해 주세요.');
          const result = await oauth.auth.setSession({ access_token: sessionData.session.access_token, refresh_token: sessionData.session.refresh_token });
          if (result.error) throw result.error;
        }
        const flow = random();
        const redirectTo = callbackUrl(flow);
        const record = { flow, provider, intent, role, remember: remember !== false, mainUserId, startedAt: now(), redirectTo };
        storage.setItem(pendingKey, JSON.stringify(record));
        // GoTrue's default Kakao scopes include email and profile images. This
        // app uses only an optional nickname; email requires separate Kakao approval.
        const params = { provider: AUTH_PROVIDERS[provider], options: { redirectTo, skipBrowserRedirect: true,
          ...(provider === 'kakao' ? { queryParams: { scope: 'profile_nickname' } } : {}) } };
        const { data, error } = intent === 'link' ? await oauth.auth.linkIdentity(params) : await oauth.auth.signInWithOAuth(params);
        if (error) throw error;
        const authorize = iosOAuthUrl(data?.url || '', new URL(config.supabaseUrl).origin, provider, intent);
        await open(authorize.href, {provider,intent});
        return record;
      } catch (error) { cancel(); throw error; }
      finally { busy = false; }
    }
    async function complete(rawUrl) {
      let url;
      try { url = new URL(rawUrl); } catch { return { handled: false }; }
      if (url.searchParams.get('manee_auth') !== 'callback') return { handled: false };
      if (completing) return { handled: true, duplicate: true };
      const record = pending();
      if (!record) throw failure('missing_flow', '진행 중인 로그인이 없어요. 다시 시작해 주세요.');
      const expected = new URL(record.redirectTo);
      if (url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname ||
          url.username || url.password || url.searchParams.get('flow') !== record.flow) {
        throw failure('callback_mismatch', '로그인 요청을 확인하지 못했어요. 다시 시작해 주세요.');
      }
      completing = true;
      try {
        if (now() - record.startedAt > MAX_AGE || now() < record.startedAt) throw failure('expired_flow', '로그인 시간이 지났어요. 다시 시작해 주세요.');
        if (await currentUserId() !== record.mainUserId) throw failure('account_changed', '계정이 바뀌었어요. 다시 로그인해 주세요.');
        if (url.searchParams.has('error')) throw failure('oauth_cancelled', '간편 로그인을 완료하지 않았어요. 다시 선택해 주세요.');
        // PKCE authorization codes only. Never accept bearer tokens from links.
        const code = url.searchParams.get('code');
        if (!code || url.searchParams.getAll('code').length !== 1 || url.hash) throw failure('invalid_callback', '로그인 응답을 확인하지 못했어요.');
        const { data, error } = await oauth.auth.exchangeCodeForSession(code);
        if (error || !data?.session) throw error || failure('exchange_failed', '로그인을 완료하지 못했어요.');
        const verified = await oauth.auth.getUser(data.session.access_token);
        const user = verified.data?.user;
        if (verified.error || !user || user.id !== data.session.user?.id || !providerOf(user, record.provider)) throw failure('identity_mismatch', '로그인 계정을 확인하지 못했어요.');
        if (await currentUserId() !== record.mainUserId || (record.intent === 'link' && user.id !== record.mainUserId)) throw failure('account_changed', '기존 계정에 연결하지 못했어요. 다시 시작해 주세요.');
        const session = { access_token: data.session.access_token, refresh_token: data.session.refresh_token, user: { id: user.id } };
        // Only the existing session adapter may commit an explicit sign-in.
        await applySession(session, record);
        return { handled: true, user, ...record };
      } finally { cancel(); completing = false; }
    }
    return { begin, complete, cancel, providers, account, pending, isBusy: () => busy || completing };
  }
  return { createController, providerOf, TERMS_VERSION, PROVIDERS };
});
