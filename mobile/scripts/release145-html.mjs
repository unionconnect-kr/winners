// Promote the complete, device-approved 1.44 screens without modifying their
// archived source or using the older generic native/web page bundle.
export function release145Html(source, platform, publicOrigin) {
  if (!['android', 'ios'].includes(platform) || new URL(publicOrigin).protocol !== 'https:') throw Error('Invalid release target');
  let html = source;
  const once = (before, after) => {
    if (html.split(before).length !== 2) throw Error('Release anchor mismatch: ' + before.slice(0,100));
    html = html.replace(before, after);
  };
  const banner = `<div role="status" class="${platform}-test-banner">매니 1.44${platform === 'ios' ? ' iPhone' : ''} 테스트 · 테스트 데이터만 입력해 주세요</div>`;
  once(banner, '');
  once('<p class="push-settings144-qa" role="note">이 테스트 버전에서는 휴대폰 푸시가 발송되지 않아요. 실제 알림 수신은 푸시 검증 버전에서 확인해 주세요.</p>', '');
  for (const text of [
    '    showToast("이 테스트 앱은 영수증 자동 인식을 준비 중이에요. 직접 입력해 주세요."); return;\n',
    '    showToast("이 테스트 앱은 음성 입력을 지원하지 않아요. 키보드로 입력해 주세요."); return;\n',
    '    showToast("이 테스트 앱은 AI 연결을 준비 중이에요."); return;\n',
  ]) once(text, '');
  html = html.replaceAll('https://staging-services-disabled.invalid', publicOrigin)
    .replaceAll('테스트 버전 · AI 답변 연결 준비 중', '매장 운영에 대해 물어보세요')
    .replaceAll('테스트 중 오류가 있으면 앱 버전·화면·재현 순서를 함께 알려 주세요.', '문의할 때 앱 버전·화면·재현 순서를 함께 알려 주세요.')
    .replaceAll('테스트 문의는 현재 검증 대화에 남겨 주세요.', '문의는 고객센터를 이용해 주세요.')
    .replaceAll('세부 권한 저장은 테스트 서버 업데이트 후 사용할 수 있어요. 현재는 항목 선택과 미리보기만 가능합니다. 아래 선택은 예시이며, 기존 직원 권한은 변경되지 않았어요.', '세부 권한을 불러오지 못했어요. 잠시 후 다시 시도해 주세요. 기존 직원 권한은 변경되지 않았어요.')
    .replaceAll('테스트 앱 안내', '앱 정보')
    .replaceAll('매니 1.44 · 테스트 데이터만 입력해 주세요.', '매니 1.45');
  if (html.includes('staging-services-disabled.invalid') || /class="(?:ios|android)-test-banner"/.test(html)) throw Error('QA configuration remains in release HTML');
  return html;
}
