// Transform only current candidate output; historical baselines stay immutable.
export function launch143Html(source,platform){
 if(!['android','ios'].includes(platform))throw Error('Unsupported platform');
 const period=platform==='ios'?'2개월':'60일';
 let html=source.replaceAll(/매니 1\.(39|40|41|42)/g,'매니 1.43');
 const start=html.indexOf('  function renderOwnerSignupOffer('),end=html.indexOf('  function ownerSignupDraft(',start);
 if(start<0||end<0)throw Error('Missing signup offer boundary');
 const block=html.slice(start,end);
 if(!block.includes('처음 가입하면 1개월 무료체험'))throw Error('Unexpected signup offer');
 const next=block.replaceAll('처음 가입하면 1개월 무료체험',`신규 구독 시 ${period} 무료체험`)
  .replaceAll('1개월 무료체험 안내',`${period} 무료체험 안내`)
  .replaceAll('처음 가입하면 <em>1개월 무료체험</em>',`신규 구독 시 <em>${period} 무료체험</em>`)
  .replaceAll('신규 사장님 가입 혜택','신규 구독 프로모션')
  .replace('회원가입만으로는 결제되지 않아요. 구독을 신청할 때 결제 화면에서 시작일·무료 혜택·자동 갱신 조건을 확인하고 동의해 주세요.',
   `회원가입만으로 체험 구독이나 결제가 시작되지 않아요. 가입 후 스토어에서 구독을 신청하고 무료체험 대상 여부·첫 결제일·월 요금을 확인해 주세요. ${period} 체험 후 월 9,900원(부가세 포함)으로 전환되며, 국내 스토어의 유료 전환 동의 절차가 적용돼요. 체험 대상이 아닌 경우 결제 화면에 표시된 요금이 적용돼요. 취소는 스토어 구독 관리에서 할 수 있어요.`);
 html=html.slice(0,start)+next+html.slice(end);
 return html;
}
