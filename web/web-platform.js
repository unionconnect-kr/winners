// Browser services for the shared 1.45 screens. Native store purchases and
// keychain plugins are intentionally not loaded by the public web application.
(function (root) {
  'use strict';
  let getContext = () => null;
  const sheets = new Set();
  function element(tag, text, parent) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    parent?.append(node);
    return node;
  }
  function sheet(id, title) {
    if (document.getElementById(id)) return null;
    const dialog = element('dialog', null, document.body);
    dialog.id = id;
    dialog.className = 'manee-web-sheet';
    const heading = element('h2', title, dialog);
    heading.id = id + '-title';
    dialog.setAttribute('aria-labelledby', heading.id);
    sheets.add(dialog);
    dialog.addEventListener('close', () => { sheets.delete(dialog); dialog.remove(); }, {once: true});
    return dialog;
  }
  function button(dialog, label, action) {
    const node = element('button', label, dialog);
    node.type = 'button'; node.onclick = action;
    return node;
  }
  function openSettings() {
    const dialog = sheet('manee-web-info', '매니');
    if (!dialog) return;
    element('p', '웹 버전 1.45', dialog);
    element('p', '매출·직원·비용을 한곳에서 관리하세요.', dialog);
    button(dialog, '닫기', () => dialog.close());
    dialog.showModal();
  }
  function openSubscriptionStatus() {
    const context = getContext();
    if (!context?.userId || !context.storeId || context.role !== 'storeOwner') return;
    const dialog = sheet('manee-web-subscription', '매니 구독');
    if (!dialog) return;
    element('p', context.storeName || '선택한 매장', dialog);
    const status = element('p', '', dialog); status.setAttribute('role', 'status');
    element('p', '구독 신청·구매 복원은 같은 계정으로 로그인한 매니 앱에서 진행해 주세요. 기존 구독의 취소·변경은 결제한 스토어에서 관리할 수 있어요.', dialog);
    const refresh = button(dialog, '상태 새로고침', () => { void load(); });
    button(dialog, '닫기', () => dialog.close());
    let sequence = 0;
    const current = () => {
      const next = getContext();
      return dialog.isConnected && next?.role === 'storeOwner' && next.userId === context.userId && next.storeId === context.storeId;
    };
    async function load() {
      const request = ++sequence; refresh.disabled = true;
      status.textContent = '이용 상태를 확인하고 있어요…';
      try {
        const {data, error} = await context.db.rpc('manee_store_billing_access', {p_store_id: context.storeId});
        if (request !== sequence || !current()) { if (dialog.isConnected) dialog.close(); return; }
        if (error || typeof data?.enforced !== 'boolean') throw Error('unavailable');
        status.textContent = data.enforced === false
          ? '현재 이 매장에는 구독 상태에 따른 입력 제한이 적용되지 않았어요.'
          : data.canWrite === true ? '현재 이 매장의 업무 입력·수정을 이용할 수 있어요.'
          : '기존 기록은 조회할 수 있어요. 업무 입력·수정을 계속하려면 매니 앱에서 구독 상태를 확인해 주세요.';
      } catch {
        if (current() && request === sequence) status.textContent = '이용 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
      } finally { if (current() && request === sequence) refresh.disabled = false; }
    }
    dialog.showModal(); void load();
  }
  function addStaffLookup() {
    const context = getContext();
    const detail = document.querySelector('[data-s2-go="employee-manage"]');
    if (context?.role !== 'storeOwner' || !context.userId || !context.storeId ||
        !detail?.dataset.s2Id || document.getElementById('manee-staff-lookup-button')) return;
    const crewId = detail.dataset.s2Id;
    const name = document.querySelector('.s2-identity h3')?.textContent;
    if (!name) return;
    const trigger = element('button', '직원 아이디 찾기 승인');
    trigger.type = 'button'; trigger.className = 's2-button'; trigger.id = 'manee-staff-lookup-button';
    detail.before(trigger);
    trigger.onclick = () => {
      const dialog = sheet('manee-staff-lookup', '직원 아이디 찾기 승인');
      if (!dialog) return;
      const current = () => {
        const active = getContext();
        return dialog.isConnected && detail.isConnected && active?.role === 'storeOwner' &&
          active.userId === context.userId && active.storeId === context.storeId;
      };
      element('p', context.storeName + ' · ' + name, dialog);
      element('p', '직원 본인을 직접 확인하고, 직원의 아이디 찾기 화면에 표시된 접수번호를 입력해 주세요. 문자 인증번호는 직원 본인이 입력합니다.', dialog);
      const form = element('form', null, dialog);
      const label = element('label', '접수번호', form);
      const input = element('input', null, label);
      input.className = 'field-input'; input.placeholder = 'ABCD-EF01-2345';
      input.maxLength = 14; input.autocomplete = 'off'; input.required = true; input.spellcheck = false;
      const approve = element('button', '본인 확인 후 승인', form);
      approve.type = 'submit';
      const status = element('p', '', dialog); status.setAttribute('role', 'status');
      button(dialog, '닫기', () => dialog.close());
      form.onsubmit = async event => {
        event.preventDefault();
        if (!current() || approve.disabled) return;
        const reference = input.value.trim().replace(/-/g, '').toLowerCase();
        if (!/^[a-f0-9]{12}$/.test(reference)) {
          status.textContent = '직원 화면에 표시된 영문과 숫자 12자리를 확인해 주세요.'; input.focus(); return;
        }
        approve.disabled = true;
        try {
          const {data, error} = await context.db.rpc('manee_approve_staff_id_lookup', {
            p_store_id: context.storeId, p_crew_id: crewId, p_reference: reference
          });
          if (!current()) return;
          if (error) throw error;
          if (data === true) {
            form.hidden = true;
            status.textContent = '승인했어요. 직원이 같은 화면에서 문자 인증을 마치면 기존 아이디가 표시돼요.';
          } else {
            status.textContent = '승인하지 못했어요. 직원과 매장, 새 접수번호, 3분 유효시간을 확인해 주세요.';
          }
        } catch {
          if (current()) status.textContent = '승인 결과를 확인하지 못했어요. 같은 접수번호로 다시 확인해 주세요.';
        } finally { if (current()) approve.disabled = false; }
      };
      dialog.showModal(); input.focus();
    };
  }
  root.MANEE_WEB = Object.freeze({
    configure(context) { getContext = context; },
    refresh: addStaffLookup,
    openSettings, openSubscriptionStatus,
    subscriptionDenied() { openSubscriptionStatus(); },
    afterOwnerSignup: async () => ({status: 'web'}),
    async prepareLogout() { for (const dialog of [...sheets]) dialog.close(); },
  });
})(window);
