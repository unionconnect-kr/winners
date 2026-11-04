// Apply to complete candidate assets only. Historical release baselines are
// immutable; a changed anchor fails the build instead of silently omitting signup.
export function signupCheckoutHtml(source) {
  if(source.includes('async function offerSignupSubscription('))throw Error('Signup checkout anchor already transformed');
  let html=source;
  const replace=(from,to)=>{
    if(html.split(from).length!==2)throw Error('Signup checkout anchor mismatch');
    html=html.replace(from,to);
  };
  const hook="\n      await offerSignupSubscription();";
  replace('      await enterAuthenticatedOwner(data.user.username, data.store.name);',
    '      await enterAuthenticatedOwner(data.user.username, data.store.name);'+hook);
  replace('socialSignupChoice(context,provider,null);dialog.close();await resolveIdentity();',
    "socialSignupChoice(context,provider,null);dialog.close();await resolveIdentity();if(chosenRole==='owner')await offerSignupSubscription();");
  replace('  async function submitOwnerRequest(){',`  async function offerSignupSubscription(){
    try{
      const result=await window.MANEE_NATIVE.afterOwnerSignup?.();
      if(result?.status==='unavailable')showToast('가입은 완료됐어요. 구독 연결은 더보기의 이용권에서 확인해 주세요.');
    }catch{
      // Account creation succeeded. Never tell users to sign up again because
      // billing is unavailable, cancelled or interrupted.
      showToast('가입은 완료됐어요. 구독 연결을 다시 확인해 주세요.');
    }
  }

  async function submitOwnerRequest(){`);
  return html;
}
