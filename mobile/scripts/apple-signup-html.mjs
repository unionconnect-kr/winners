// Apply only to the iOS release after the shared signup/email transforms.
export function installAppleSignup(source) {
 let html=source;
 const once=(before,after)=>{
  if(html.split(before).length!==2)throw Error('Apple signup anchor changed: '+before.slice(0,80));
  html=html.replace(before,()=>after);
 };
 once("    const socialVerification=window.MANEE_EMAIL_UI.bindSocialSignup(dialog,context,provider);", `    if(provider==='apple'){
      // Do not request name/email again. Names are optional display data; the
      // server derives the email from the authenticated Apple identity.
      const name=form.elements.displayName;
      const supplied=String(context.appleDisplayName||context.displayName||'').trim();
      name.value=supplied.length<=50&&!/[<>\\u0000-\\u001f\\u007f]/.test(supplied)&&supplied?supplied:'Apple 사용자';
      name.required=false;name.closest('label').hidden=true;
      dialog.querySelector('[data-manee-email-signup="social"]')?.remove();
      const note=document.createElement('p');note.className='mee-note';
      note.textContent='Apple 계정 정보로 가입해요. 이름과 이메일을 다시 입력하지 않아도 돼요.';
      form.prepend(note);
    }
    const socialVerification=window.MANEE_EMAIL_UI.bindSocialSignup(dialog,context,provider);`);
 once("if(chosenRole==='owner')await offerSignupSubscription();void window.MANEE_EMAIL_UI?.afterSignup();", "if(chosenRole==='owner')await offerSignupSubscription();if(provider!=='apple')void window.MANEE_EMAIL_UI?.afterSignup();");
 return html;
}
