function replaceOnce(html, before, after) {
  const at = html.indexOf(before);
  if (at < 0 || html.indexOf(before, at + before.length) >= 0) {
    throw new Error('Expected one sales report source match: ' + before.slice(0, 80));
  }
  return html.slice(0, at) + after + html.slice(at + before.length);
}

export function bindSalesAmount(input) {
  if (input.type !== 'number' || input.readOnly || input.disabled) return;
  input.addEventListener('focus', () => {
    if (input.value !== '' && input.valueAsNumber === 0) {
      input.value = '';
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }
  });
  input.addEventListener('blur', () => {
    if (input.value === '' && !input.validity.badInput) {
      input.value = '0';
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }
  });
}

export function installSalesReportEditing(html) {
  const oldAuthorGuard = "if(r&&r.crewId!==state.myCrewId){showToast('다른 직원의 매출보고는 수정할 수 없어요.');return;}";
  html = replaceOnce(html, oldAuthorGuard, "if(state.reportDataFailed?.has('매출')){showToast('기존 매출보고를 불러오지 못했어요. 매출보고를 다시 열어 주세요.');return;}");
  html = replaceOnce(html, "if(!r135Cap('salesWrite')||r.crewId!==state.myCrewId)", "if(!r135Cap('salesWrite'))");
  html = replaceOnce(html, "if(caps.view!=='sales')state.salesReports=caps.salesWrite?(state.salesReports||[]).filter(r=>r.crewId===state.myCrewId):[];",
    "if(caps.view!=='sales'&&!caps.salesWrite)state.salesReports=[];");
  html = replaceOnce(html, "r135Scoped()?'manee_manager_save_sales':'manee_sector3_save'", "'manee_sector3_save'");
  html = replaceOnce(html, "'내가 작성한 매출보고'", "'매장 매출보고'");
  html = replaceOnce(html, 'id="go-salesreport-btn">오늘 매출·지출 등록하기', 'id="go-salesreport-btn">날짜를 선택해 매출보고 작성·수정');
  html = replaceOnce(html, '본인이 작성한 마감 전 보고와 같은 날 지출을 등록해요.',
    '마감 전에는 같은 매장의 매출보고를 작성·수정하고 지출을 등록해요.');
  html = replaceOnce(html, '매출 작성 권한이 있으면 본인이 입력하는 금액은 볼 수 있어요. 다른 직원의 보고와 매장 전체 매출은 숨깁니다.',
    '매출 작성 권한이 있으면 이 매장의 날짜별 보고를 열어 수정할 수 있어요. 매장 요약은 선택한 조회 권한을 따릅니다.');
  html = replaceOnce(html, '정산표 사진 (먼저 찍으면 아래 숫자가 자동으로 채워져요)',
    '정산표 사진 (사진을 추가한 뒤 ‘사진으로 자동입력’을 눌러 주세요)');
  const bind = '    app.querySelectorAll(".sr-input").forEach(inp=>{';
  html = replaceOnce(html, bind, '    ' + bindSalesAmount.toString() + '\n' + bind + '\n      bindSalesAmount(inp);');
  // The committed database change writes both the inbox and native push. An old
  // client posted a second, generic Web Push message even when values had not changed.
  const start = '    if(wasEditing && state.role !== "storeOwner" && storeId){';
  const end = '\n  }\n\n  async function autoCloseChecklistForDate';
  const from = html.indexOf(start), until = html.indexOf(end, from);
  if (from < 0 || until < from || !html.slice(from, until).includes('sales-report-edited-')) {
    throw new Error('Missing sales edit notification boundary');
  }
  html = html.slice(0, from) + html.slice(until);
  html = replaceOnce(html, '매니저 업무 변경 알림</h3>', '매장 업무 변경 알림</h3>');
  html = replaceOnce(html, "label:'매니저 업무 변경 '+u.rows.length", "label:'매장 업무 변경 '+u.rows.length");
  return html;
}
