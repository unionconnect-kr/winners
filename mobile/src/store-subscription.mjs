// The database is the sole authority for write access. Sandbox purchases are
// displayed separately and never presented as a paid Production entitlement.
export function subscriptionView(access, billing) {
  const testActive = billing?.testOnly === true && billing?.testActive === true;
  if (access?.enforced === true) {
    if (access.canWrite === true) return {title:'매장 이용권 이용 중',message:'이 매장의 입력·수정이 가능합니다.',testActive};
    return {title:'매장 이용권 확인 필요',message:'이 매장의 기록은 볼 수 있지만 입력·수정은 제한됩니다. 사장님이 구독 상태를 확인해 주세요. 출퇴근 기록은 계속 사용할 수 있습니다.',testActive};
  }
  if (access?.enforced === false) return {title:'매장 이용권 준비 중',message:'현재 이 매장에는 이용권에 따른 입력 제한이 적용되지 않았습니다. 정식 결제 안내를 준비하고 있습니다.',testActive};
  return {title:'이용권 상태를 확인할 수 없어요',message:'잠시 후 새로고침해 주세요. 입력 가능 여부는 서버에서 확인합니다.',testActive};
}
