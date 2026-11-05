// Store-confirmed offers only. This view never starts or restores a purchase itself.
export function createSubscriptionSheet(document,{id,title,storeName}){
 const el=(tag,text,parent,style='')=>{const node=document.createElement(tag);if(text)node.textContent=text;node.style.cssText=style;parent?.append(node);return node;};
 const sheet=el('dialog',null,null,'border:1px solid #e2ebe5;border-radius:24px;padding:24px;width:calc(100% - 32px);max-width:420px;max-height:calc(100dvh - 48px);overflow-y:auto;box-sizing:border-box;background:#fff;color:#203c30;font-family:inherit;font-size:15px;line-height:1.55;box-shadow:0 20px 70px #163c2d30;text-align:left');sheet.id=id;sheet.setAttribute('aria-label',title);
 el('p','MANEE',sheet,'margin:0 0 6px;color:#16774c;font-size:12px;font-weight:800;letter-spacing:1.8px');
 const heading=el('h2',title,sheet,'margin:0;color:#173f2e;font-size:25px;font-weight:800;letter-spacing:-.8px;line-height:1.3');
 el('p',storeName||'선택한 매장',sheet,'margin:8px 0 20px;color:#748078;font-size:13px');
 const card=el('section',null,sheet,'padding:20px;border:1px solid #dcebe1;border-radius:16px;background:#f1f8f4');
 const label=el('p','구독 요금을 확인하고 있어요',card,'margin:0 0 6px;color:#16774c;font-size:13px;font-weight:700');
 const price=el('p','잠시만 기다려 주세요',card,'margin:0;color:#173f2e;font-size:27px;font-weight:800;letter-spacing:-1px;line-height:1.35');
 const after=el('p','',card,'margin:8px 0 0;font-size:14px;font-weight:600;color:#52675b');
 const summary=el('p','',sheet,'margin:16px 0 10px;color:#52675b;font-size:14px');
 const status=el('p','상품을 확인하고 있어요…',sheet,'margin:8px 0 16px;color:#67766d;font-size:13px;line-height:1.55;word-break:keep-all');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const details=el('details',null,sheet,'margin:0 0 18px;color:#6a786f;font-size:12px;line-height:1.7');
 el('summary','구독·해지 안내',details,'cursor:pointer;padding:8px 0;font-weight:600;min-height:24px');
 const terms=el('p','',details,'margin:4px 0 8px');
 const actions=el('div',null,sheet,'display:grid;gap:10px');
 const footer=el('div',null,sheet,'display:flex;flex-wrap:wrap;justify-content:center;gap:4px 16px;margin-top:10px');
 return {sheet,heading,card,label,price,after,summary,status,details,terms,actions,footer,el};
}
export function subscriptionButton(view,label,onClick,kind='primary'){
 const styles={primary:'background:#16774c;border:1px solid #16774c;color:#fff;font-weight:750;',secondary:'background:#fff;border:1px solid #dbe5df;color:#52675b;font-weight:600;',link:'background:transparent;border:0;color:#6c7c72;font-size:12px;text-decoration:underline;min-height:44px;padding:8px 4px;'};
 const node=view.el('button',label,kind==='link'?view.footer:view.actions,'appearance:none;box-sizing:border-box;cursor:pointer;font-family:inherit;font-size:15px;line-height:1.5;border-radius:13px;width:100%;min-height:52px;padding:13px 16px;word-break:keep-all;'+styles[kind]+(kind==='link'?'width:auto;':''));node.type='button';node.onclick=onClick;return node;
}
export function setSubscriptionOffer(view,{trialDays=0,trialMonths=0,price='9,900원',active=false}){
 const trial=trialDays?trialDays+'일':trialMonths?trialMonths+'개월':'';
 view.label.textContent=active?'이용 중인 구독':trial?'신규 구독 혜택':'월 정기 구독';
 view.price.textContent=trial?trial+' 무료체험':'월 '+price;
 view.after.textContent=trial?'이후 월 '+price+' · 매월 갱신 · 부가세 포함':'부가세 포함 · 매월 갱신';
 return trial?trial+' 무료체험 후 월 '+price+' 구독':'월 '+price+'으로 구독하기';
}
export function setSubscriptionPromotion(view,{platform='android',checking=true}={}){
 view.label.textContent='신규 구독 혜택';
 view.price.textContent=platform==='ios'?'2개월 무료체험':'60일 무료체험';
 view.after.textContent='체험 후 월 9,900원 정기구독 · 부가세 포함';
 view.status.textContent=checking?'스토어에서 무료체험 대상과 구독 상품을 확인하고 있어요…':'무료체험은 스토어에서 대상자로 확인된 계정에 적용돼요.';
}
export function createSubscriptionStatusSheet(document,{storeName,platform='android'}){
 const view=createSubscriptionSheet(document,{id:'manee-subscription-status',title:'계정 이용권',storeName});
 view.label.textContent='이용권 상태';view.price.textContent='상태를 확인하고 있어요';
 view.price.style.cssText+=';font-size:21px;letter-spacing:-.5px';
 view.after.textContent='';view.status.textContent='';view.details.hidden=true;
 view.summary.textContent='사장님 아이디 하나로 연결된 모든 매장을 이용해요.';
 const promotion=view.el('p',(platform==='ios'?'신규 구독 2개월 무료체험':'신규 구독 60일 무료체험')+' · 이후 월 9,900원\n무료체험 대상 여부는 스토어에서 확인해요.',view.card,'margin:12px 0 0;padding-top:12px;border-top:1px solid #dcebe1;color:#52675b;font-size:12px;white-space:pre-line;line-height:1.7');
 return {...view,promotion};
}
