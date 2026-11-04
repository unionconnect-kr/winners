// No tokens in browser storage or logs. Consent is scoped to the account/store.
export const PUSH_NOT_READY = '휴대폰 알림은 연결 준비 중이에요. 앱 안의 알림은 계속 확인할 수 있어요.';
export function createAndroidPush({ push, getContext, projectId, storage, timeoutMs = 15000 }) {
  let task;
  const key = c => `manee-android-push:${c.userId}:${c.storeId}`;
  const same = c => { const n = getContext(); return n?.userId === c.userId && n?.storeId === c.storeId; };
  const check = c => { if (!same(c)) throw Error('계정 또는 매장이 바뀌었어요. 다시 시도해 주세요.'); };
  const enabled = c => { try { return storage.getItem(key(c)) === '1'; } catch { return false; } };
  async function rpc(c, token, on) {
    check(c);
    const { data, error } = await c.db.rpc('manee_android_push', { p_store_id: c.storeId, p_token: token, p_enabled: on });
    if (error || data !== true) throw Error(on ? '알림 연결을 저장하지 못했어요. 다시 시도해 주세요.' : '알림 해제에 실패했어요. 다시 시도해 주세요.');
    check(c);
  }
  async function service(c, action) {
    check(c);
    const { data: auth, error: authError } = await c.db.auth.getSession();
    if (authError || auth?.session?.user?.id !== c.userId) throw Error('다시 로그인해 주세요.');
    check(c);
    const { data, error } = await c.db.functions.invoke('manee-android-push', { body: { action, storeId: c.storeId, projectId }, signal: AbortSignal.timeout(20000) });
    check(c);
    if (error) throw Error('알림 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
    return data;
  }
  async function token(c) {
    let timer, resolve, reject;
    const handles = [];
    const ready = new Promise((yes, no) => { resolve = yes; reject = no; });
    // Register() resolves before the token callback. Attach both listeners first.
    ready.catch(() => {});
    try {
      handles.push(await push.addListener('registration', t => {
        if (typeof t.value !== 'string' || !/^[A-Za-z0-9_:\-]{20,4096}$/.test(t.value)) reject(Error('알림 기기 정보를 확인하지 못했어요.'));
        else resolve(t.value); // FCM tokens are case-sensitive.
      }));
      handles.push(await push.addListener('registrationError', () => reject(Error('휴대폰 알림 등록에 실패했어요. 다시 시도해 주세요.'))));
      check(c);
      timer = setTimeout(() => reject(Error('알림 등록 시간이 초과됐어요. 다시 시도해 주세요.')), timeoutMs);
      await push.register();
      return await ready;
    } finally {
      clearTimeout(timer);
      await Promise.allSettled(handles.map(h => h.remove()));
    }
  }
  async function run(action) {
    const c = getContext();
    if (!c?.userId || !c?.storeId || c.role !== 'storeOwner') return { subscribed: false, message: '사장님 계정에서 알림을 연결해 주세요.' };
    if (!projectId) return { subscribed: false, ready: false, message: PUSH_NOT_READY };
    if (action === 'disable') {
      await rpc(c, null, false);
      storage.removeItem(key(c));
      await push.unregister();
      await push.removeAllDeliveredNotifications();
      return { subscribed: false, message: '휴대폰 알림을 껐어요.' };
    }
    const status = await service(c, 'status');
    if (!status?.ready || status.projectId !== projectId) return { subscribed: false, ready: false, message: PUSH_NOT_READY };
    if (action === 'test') {
      const result = await service(c, 'test');
      if (result?.sent !== true) throw Error('테스트 알림을 보내지 못했어요. 알림 연결을 다시 확인해 주세요.');
      return { subscribed: enabled(c), message: '테스트 알림을 보냈어요. 휴대폰 알림창을 확인해 주세요.' };
    }
    if (action === 'refresh' && !enabled(c)) return { subscribed: false, ready: true, message: '' };
    let permission = await push.checkPermissions();check(c);
    if (action === 'enable' && ['prompt', 'prompt-with-rationale'].includes(permission.receive)) {
      permission = await push.requestPermissions();check(c);
    }
    if (permission.receive !== 'granted') {
      if (enabled(c)) { await rpc(c, null, false);storage.removeItem(key(c)); }
      return { subscribed: false, ready: true, message: '휴대폰 설정 > 앱 > 매니 > 알림에서 알림을 허용해 주세요.' };
    }
    await push.createChannel({ id: 'manee_store', name: '매장 알림', description: '매니 매장 알림', importance: 4, visibility: 0 });check(c);
    const value = await token(c);check(c);
    await rpc(c, value, true);
    storage.setItem(key(c), '1');
    return { subscribed: true, ready: true, message: action === 'enable' ? '휴대폰 알림이 연결됐어요.' : '' };
  }
  return {
    action(action) {
      if (!['enable', 'disable', 'refresh', 'test'].includes(action)) return Promise.reject(Error('알림 요청을 확인해 주세요.'));
      if (task) return task;
      task = run(action).finally(() => { task = null; });
      return task;
    },
    async prepareLogout() {
      if (task) await task.catch(() => {});
      const c = getContext();
      if (!c?.userId || !projectId) return;
      // Do not prevent logout on offline cleanup: delivery checks live auth sessions.
      try { await rpc(c, null, false); } catch {}
      try { storage.removeItem(key(c)); } catch {}
      await Promise.allSettled([push.unregister(), push.removeAllDeliveredNotifications()]);
    },
  };
}
