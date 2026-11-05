export function installPasswordFeedback(html){
 const owner="}catch(e){\n      if(e && e.code==='invalid_franchise_code')";
 const staff="}catch(e){\n      if(e.code==='42501')";
 if(html.split(owner).length!==2||html.split(staff).length!==2)throw Error('Password feedback anchors changed');
 return html.replace(owner,()=>"}catch(e){\n      if(e && ['weak_password','invalid_password'].includes(e.code)){\n        if(state.ownerSignupDraft)state.ownerSignupDraft.step=2;render();\n        queueMicrotask(()=>window.MANEE_PASSWORD_CHECK?.reject('owner',e.message));return;\n      }\n      if(e && e.code==='invalid_franchise_code')")
 .replace(staff,()=>"}catch(e){\n      if(e && ['weak_password','invalid_password'].includes(e.code))queueMicrotask(()=>window.MANEE_PASSWORD_CHECK?.reject('staff',e.message));\n      if(e.code==='42501')");
}
