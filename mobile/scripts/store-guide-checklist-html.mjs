import {readFileSync} from 'node:fs';

// Applied only to the next release, after the approved 1.56 build pipeline.
export function installStoreGuideChecklist(source) {
  let html=source;
  const once=(a,b)=>{if(html.split(a).length!==2)throw Error('1.57 update anchor changed: '+a.slice(0,100));html=html.replace(a,()=>b);};
  once('<button type="button" class="ml-id-login" data-auth-view="password">아이디로 로그인</button>', '<button type="button" class="ml-id-login" data-auth-view="password"><span class="m159-login-icon" aria-hidden="true">\'+loginIcon(\'user\')+\'</span><span>아이디로 로그인하기</span></button>');
  once("<h4>'+esc+'</h4>","<h4><span class=\"m157-store-icon\" aria-hidden=\"true\">'+navIcon('store')+'</span>'+esc+'</h4>");
  once('    html+=renderOwnerWork();', '    html+=renderOwnerWork();\n    html+=\'<section class="oh-card m157-home-guide">\'+s4Line(\'사장님 사용법\',\'필요한 기능을 영상으로 확인하세요\',\'owner-guide\')+\'</section>\';');
  once("<h3 class=\"s4-section-label\">도움말</h3><div class=\"owner-menu\">'", "<h3 class=\"s4-section-label\">도움말</h3><div class=\"owner-menu\">'+s4Line('사장님 사용법','기능별 영상 안내 · 매니 공식 유튜브','owner-guide')");
  once("day:String(item?.schedule?.day??1)});", "day:String(item?.schedule?.day??1),photoRequired:item?.photoRequired===true});");
  once('<summary>권한·급여 조건</summary>', '<summary>급여·근무조건</summary>');
  once("'<p class=\"owner-note\">매니저 권한은 직원 상세의 ‘매니저 권한 설정’에서 관리해요.</p>'+s2Check('매출·리포트 조회 권한','salesAccess',e.salesAccess)+",'');
  // Editing employment conditions must never silently revoke a stored access flag.
  once('if(c)delete patch.is_manager;else patch.is_manager=false;', 'delete patch.sales_access;\n    if(c)delete patch.is_manager;else patch.is_manager=false;');
  once("if(r135Cap('wage'))h+='<form id=\"r135-wage-form\">'", "if(r135Cap('wage')&&u.managerSection!=='payroll')h+='<form id=\"r135-wage-form\">'");
  once("if(r135Cap('payroll')){h+='<h4>이번 달 급여</h4>'", "if(r135Cap('payroll')&&u.managerSection!=='wage'){h+='<h4>이번 달 급여</h4>'");
  once('if(c.isManager||u.data?.enabled)h+=', 'if(c.isManager||c.salesAccess||u.data?.enabled)h+=');
  once("      h+=s4SaveLabel()+'</form>';", "      h+='<label class=\"s4-check-label\"><input name=\"photoRequired\" type=\"checkbox\"'+(d.photoRequired?' checked':'')+'> 완료 사진 받기</label>'+s4Hint('켜면 사진을 첨부해야 완료할 수 있어요. 끄면 체크만으로 완료해요.')+s4SaveLabel()+'</form>';");
  once("label:d.label.trim(),schedule:{kind:d.kind,", "label:d.label.trim(),photoRequired:d.photoRequired===true,schedule:{kind:d.kind,");
  const loaderStart=html.indexOf('  async function loadChecklist(store, dateStr){');
  const loaderEnd=html.indexOf('  async function loadChecklistLog(',loaderStart);
  if(loaderStart<0||loaderEnd<loaderStart)throw Error('Checklist loader anchors changed');
  html=html.slice(0,loaderStart)+readFileSync(new URL('../src/checklist-load.js',import.meta.url),'utf8')+'\n'+html.slice(loaderEnd);
  const setupStart=html.indexOf("    }else if(step==='checklist'){");
  const setupEnd=html.indexOf("    }else if(step==='preferences'){",setupStart);
  if(setupStart<0||setupEnd<setupStart)throw Error('Checklist setup anchors changed');
  html=html.slice(0,setupStart)+"    }else if(step==='checklist'){\n      html+=m159OnboardingChecklist();\n"+html.slice(setupEnd);
  once('app.innerHTML = renderOnboardingWizard() + renderConfirmOverlay()', 'app.innerHTML = renderOnboardingWizard() + renderSector4Sheet() + renderConfirmOverlay()');
  once('bindOnboardingWizardEvents(); bindConfirmOverlay();','bindOnboardingWizardEvents(); bindSector4(); bindConfirmOverlay();');
  once("    if(manage)h+='<div class=\"s4-manage-bar\">'+s4Button('⚙ 체크리스트 관리','manage-checks','','full')+'</div>';",'');
  once("if(sector4().key===key){if(e.code==='40001')showToast(e.message);else businessError(e);}","if(sector4().key===key){const t=s4Top();if(t)t.error=m159ChecklistError(e);if(e.code==='P4402')window.MANEE_NATIVE?.subscriptionDenied?.();if(e.code==='40001')showToast(e.message);else businessError(e);}");
  // History snapshots reference immutable evidence, rather than copying image bytes.
  once("+s4Escape(it.label)+'</div>').join('');", "+s4Escape(it.label)+(r.photos?.[it.id]?s4Button('완료 사진'+(r.photo_sets?.[it.id]?.length?' '+r.photo_sets[it.id].length+'장':'')+' 보기','check-photo',r.photos[it.id]):'')+'</div>').join('');");
  once("    else if(action==='check')await s4CheckWrite('check',{item_id:id,checked:!state.checks[id]});", `    else if(action==='check'){
      const it=m157FindItem(id);
      if(!state.checks[id]&&it?.photoRequired===true)return s4Open('check-photo-upload',id);
      await s4CheckWrite('check',{item_id:id,checked:!state.checks[id]});
    }else if(action==='check-photo')return m157OpenPhoto(id);
    else if(action==='check-photo-review')return m157ReviewPhoto(id);
    else if(action==='check-photo-remove'){const t=s4Top();if(t?.type==='check-photo-upload'&&!t.reading){t.photos?.splice(Number(id),1);t.draft={photoCount:t.photos?.length||0};t.error=null;render();}return;}
    else if(action==='check-photo-prev'||action==='check-photo-next'){const t=s4Top();if(t?.type==='check-photo-view'){const ids=t.photoIds||[t.id],next=ids.indexOf(t.id)+(action==='check-photo-prev'?-1:1);if(ids[next])return m161LoadPhoto(t,ids[next]);}return;}
    else if(action==='check-photo-save')return m157SubmitPhoto();`);
  // Wrap existing sheet and checklist rendering inside the existing authenticated app scope.
  once('  initializeSocialLogin();',readFileSync(new URL('../src/store-guide-checklist.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../src/checklist-thumbnails.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../src/checklist-editor.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../src/manager-clarity.js',import.meta.url),'utf8')+'\n  initializeSocialLogin();');
  once('</head>','<link rel="stylesheet" href="/store-guide-checklist.css">\n</head>');
  return html;
}
