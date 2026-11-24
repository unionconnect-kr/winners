import {readFileSync} from 'node:fs';

// Applied only to the next release, after the approved 1.56 build pipeline.
export function installStoreGuideChecklist(source) {
  let html=source;
  const once=(a,b)=>{if(html.split(a).length!==2)throw Error('1.57 update anchor changed: '+a.slice(0,100));html=html.replace(a,()=>b);};
  once("<h4>'+esc+'</h4>","<h4><span class=\"m157-store-icon\" aria-hidden=\"true\">'+navIcon('store')+'</span>'+esc+'</h4>");
  once('    html+=renderOwnerWork();', '    html+=renderOwnerWork();\n    html+=\'<section class="oh-card m157-home-guide">\'+s4Line(\'사장님 사용법\',\'필요한 기능을 영상으로 확인하세요\',\'owner-guide\')+\'</section>\';');
  once("<h3 class=\"s4-section-label\">도움말</h3><div class=\"owner-menu\">'", "<h3 class=\"s4-section-label\">도움말</h3><div class=\"owner-menu\">'+s4Line('사장님 사용법','기능별 영상 안내 · 매니 공식 유튜브','owner-guide')");
  once("day:String(item?.schedule?.day??1)});", "day:String(item?.schedule?.day??1),photoRequired:item?.photoRequired===true});");
  once("      h+=s4SaveLabel()+'</form>';", "      h+='<label class=\"s4-check-label\"><input name=\"photoRequired\" type=\"checkbox\"'+(d.photoRequired?' checked':'')+'> 완료 사진 받기</label>'+s4Hint('켜면 사진을 첨부해야 완료할 수 있어요. 끄면 체크만으로 완료해요.')+s4SaveLabel()+'</form>';");
  once("label:d.label.trim(),schedule:{kind:d.kind,", "label:d.label.trim(),photoRequired:d.photoRequired===true,schedule:{kind:d.kind,");
  once(".select('item_id,checked_at,checked_by').eq('store_id', storeId)", ".select('item_id,checked_at,checked_by,photo_id').eq('store_id', storeId)");
  once("    state.checklistLoadFailed=failed;",`    state.checklistPhotoMeta={};
    if(!failed&&storeId){
      try{const r=await db.from('manee_checklist_photos').select('id,item_id,created_at,reviewed_at,reviewed_by').eq('store_id',storeId).eq('date',d);if(r.error)throw r.error;if(!alive())return;state.checklistPhotoMeta=Object.fromEntries((r.data||[]).map(p=>[p.id,p]));}
      catch(e){if(!alive())return;failed=true;}
    }
    state.checklistLoadFailed=failed;`);
  // History snapshots reference immutable evidence, rather than copying image bytes.
  once("+s4Escape(it.label)+'</div>').join('');", "+s4Escape(it.label)+(r.photos?.[it.id]?s4Button('완료 사진 보기','check-photo',r.photos[it.id]):'')+'</div>').join('');");
  once("    else if(action==='check')await s4CheckWrite('check',{item_id:id,checked:!state.checks[id]});", `    else if(action==='check'){
      const it=m157FindItem(id);
      if(!state.checks[id]&&it?.photoRequired===true)return s4Open('check-photo-upload',id);
      await s4CheckWrite('check',{item_id:id,checked:!state.checks[id]});
    }else if(action==='check-photo')return m157OpenPhoto(id);
    else if(action==='check-photo-review')return m157ReviewPhoto(id);
    else if(action==='check-photo-save')return m157SubmitPhoto();`);
  // Wrap existing sheet and checklist rendering inside the existing authenticated app scope.
  once('  initializeSocialLogin();',readFileSync(new URL('../src/store-guide-checklist.js',import.meta.url),'utf8')+'\n  initializeSocialLogin();');
  once('</head>','<link rel="stylesheet" href="/store-guide-checklist.css">\n</head>');
  return html;
}
