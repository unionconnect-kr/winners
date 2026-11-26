export function bindStaffLookupApproval(getContext) {
  const detailSelector = '[data-s2-go="employee-manage"][data-s2-id]';
  const detail = document.querySelector(detailSelector);
  if (!detail || document.getElementById('manee-staff-lookup-button')) return;
  const owner = {...getContext()};
  const crewId = detail.dataset.s2Id;
  const crewName = document.querySelector('.s2-identity h3')?.textContent;
  if (owner.role !== 'storeOwner' || !owner.userId || !owner.storeId || !crewId || !crewName) return;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 's2-button';
  trigger.id = 'manee-staff-lookup-button';
  trigger.textContent = '직원 아이디 찾기 승인';
  detail.before(trigger);

  function sameEmployee() {
    const current = getContext();
    return current.role === 'storeOwner' && current.userId === owner.userId &&
      current.storeId === owner.storeId && document.querySelector(detailSelector)?.dataset.s2Id === crewId;
  }

  trigger.addEventListener('click', () => {
    if (!sameEmployee() || document.getElementById('manee-staff-lookup')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'manee-staff-lookup';
    dialog.className = 'manee-id-recovery';
    dialog.setAttribute('aria-labelledby', 'manee-staff-lookup-title');
    dialog.innerHTML = `<div class="mir-heading"><h2 id="manee-staff-lookup-title">직원 아이디 찾기 승인</h2>
      <button type="button" data-close aria-label="닫기">×</button></div>
      <p data-employee></p><p>직원 본인을 직접 확인하고 직원 화면의 접수번호를 입력해 주세요. 문자 인증번호는 직원 본인이 입력합니다.</p>
      <form><label for="manee-staff-reference">접수번호</label>
        <input id="manee-staff-reference" maxlength="14" autocomplete="off" spellcheck="false" required placeholder="ABCD-EF01-2345">
        <button type="submit" class="mir-primary">본인 확인 후 승인</button></form>
      <p role="status" aria-live="polite"></p>`;
    dialog.querySelector('[data-employee]').textContent = [owner.storeName, crewName].filter(Boolean).join(' · ');
    const form = dialog.querySelector('form');
    const input = dialog.querySelector('input');
    const submit = form.querySelector('button');
    const status = dialog.querySelector('[role="status"]');
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (trigger.isConnected) trigger.focus();
    }, {once: true});
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!sameEmployee()) { dialog.close(); return; }
      if (submit.disabled) return;
      const reference = input.value.trim().replace(/-/g, '').toLowerCase();
      if (!/^[a-f0-9]{12}$/.test(reference)) {
        status.textContent = '직원 화면에 표시된 접수번호 12자리를 확인해 주세요.';
        input.focus();
        return;
      }
      submit.disabled = true;
      try {
        const {data, error} = await owner.db.rpc('manee_approve_staff_id_lookup', {
          p_store_id: owner.storeId, p_crew_id: crewId, p_reference: reference
        });
        if (!dialog.open || !sameEmployee()) return;
        if (error) throw error;
        form.hidden = data === true;
        status.textContent = data === true
          ? '승인했어요. 직원이 문자 인증을 마치면 기존 아이디를 확인할 수 있어요.'
          : '승인하지 못했어요. 직원과 매장, 접수번호의 3분 유효시간을 확인해 주세요.';
      } catch {
        if (dialog.open && sameEmployee()) status.textContent = '승인 결과를 확인하지 못했어요. 같은 접수번호로 다시 확인해 주세요.';
      } finally {
        if (dialog.open) submit.disabled = form.hidden;
      }
    });
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}
