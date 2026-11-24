  // Owner tutorials are separate from the employee help entry. No video ID is invented.
  const M157_GUIDE_CHANNEL='https://youtube.com/@manee-official';
  const M157_GUIDES=[['start','매장 설정과 시작하기','가입 후 처음 할 일'],['staff','직원 등록과 권한 설정','직원 · 매니저 초대와 관리'],['schedule','근무 일정과 급여 확인','근무표 등록부터 예상 급여까지'],['sales','매출 · 지출 등록','하루 매출과 비용 기록하기'],['report','월말 리포트 확인','매장 현황 확인과 자료 내보내기']];
  function m157GuideUrl(value){try{const u=new URL(value);if(u.protocol==='https:'&&['youtube.com','www.youtube.com','youtu.be'].includes(u.hostname)&&!u.username&&!u.password)return u.href;}catch{}return null;}
  function m157FindItem(id){return Object.values(state.items||{}).flatMap(c=>c||[]).flatMap(c=>c.items||[]).find(it=>it.id===id);}
  function m157Image(type,data){return ['image/jpeg','image/png','image/webp'].includes(type)&&typeof data==='string'&&data.length<=1398104&&/^[A-Za-z0-9+/]+={0,2}$/.test(data)?'data:'+type+';base64,'+data:null;}
  function m157Guide(){
    const links=window.MANEE_GUIDE_LINKS||{};
    return '<p class="m157-guide-intro">궁금한 기능부터 골라 보세요.</p><div>'+M157_GUIDES.map(([key,title,desc])=>{const url=m157GuideUrl(links[key]);return '<a class="m157-guide-row" href="'+s4Escape(url||M157_GUIDE_CHANNEL)+'" target="_blank" rel="noopener noreferrer"><span><b>'+s4Escape(title)+'</b><small>'+s4Escape(desc)+(url?'':' · 공식 채널에서 찾기')+'</small></span><span aria-hidden="true">▷</span></a>';}).join('')+'</div><a class="m157-guide-channel" href="'+M157_GUIDE_CHANNEL+'" target="_blank" rel="noopener noreferrer">매니 공식 유튜브 채널 ↗</a>';
  }
  const m157RenderChecklist=renderSector4Checklist;
  renderSector4Checklist=function(){
    let html=m157RenderChecklist();
    for(const [id,meta] of Object.entries(state.checkMeta||{})){
      if(!state.checks[id]||!meta.photo_id)continue;
      const p=state.checklistPhotoMeta?.[meta.photo_id],needle='data-id="'+s4Escape(id)+'"',start=html.indexOf(needle);if(start<0)continue;
      const end=html.indexOf('</button>',start)+9;if(end<9)continue;
      html=html.slice(0,end)+'<div class="m157-evidence-row">'+s4Button('완료 사진 보기','check-photo',meta.photo_id)+'<small>'+(p?.reviewed_at?'사장님 확인 완료':'사장님 확인 대기')+'</small></div>'+html.slice(end);
    }
    return html;
  };
  const m157RenderSheet=renderSector4Sheet;
  renderSector4Sheet=function(){
    const t=s4Top();if(!t||!['owner-guide','check-photo-upload','check-photo-view'].includes(t.type))return m157RenderSheet();
    let title='',body='';
    if(t.type==='owner-guide'){
      title='사장님 사용법';body=state.role==='storeOwner'?m157Guide():s4Hint('사장님 계정에서 이용할 수 있어요.');
    }else if(t.type==='check-photo-upload'){
      title=m157FindItem(t.id)?.label||'완료 사진';
      const url=t.photo?m157Image(t.photo.type,t.photo.data):null;
      body=s4Hint('사진을 첨부하고 완료하면 사장님이 확인할 수 있어요.')+'<label class="m157-photo-upload">완료 사진 (필수)<input type="file" id="m157-check-file" accept="image/*"'+(sector4().busy?' disabled':'')+'></label>'+(url?'<img class="m157-check-image" src="'+url+'" alt="완료 사진 미리보기">':'')+(t.reading?s4Hint('사진을 준비하고 있어요…'):'')+s4Button('사진과 함께 완료','check-photo-save','','primary full');
    }else{
      title='완료 사진';const p=t.photo,url=p?m157Image(p.image_type,p.image_base64):null;
      body=t.loading?s4Hint('사진을 불러오고 있어요…'):url?'<img class="m157-check-image" src="'+url+'" alt="'+s4Escape(p.item_label||'체크리스트 완료 사진')+'">'+s4Hint(p.reviewed_at?'사장님 확인 완료':'사장님 확인 대기')+(state.role==='storeOwner'&&!p.reviewed_at?s4Button('확인 완료','check-photo-review',t.id,'primary full'):''):s4Hint('사진을 불러오지 못했어요. 닫고 다시 시도해 주세요.');
    }
    return '<div class="s4 s4-overlay"><section class="s4-sheet" role="dialog" aria-modal="true" aria-labelledby="s4-title"><header><h3 id="s4-title" tabindex="-1">'+s4Escape(title)+'</h3><button data-s4="close" class="s4-x" aria-label="닫기"'+(sector4().busy?' disabled':'')+'>×</button></header><div class="s4-body">'+(t.error?'<div class="s4-error" role="alert">'+s4Escape(t.error)+'</div>':'')+body+'</div></section></div>';
  };
  const m157BindSector4=bindSector4;
  bindSector4=function(){
    m157BindSector4();
    const input=document.getElementById('m157-check-file');if(!input)return;
    input.onchange=async()=>{
      const t=s4Top(),u=sector4(),f=input.files?.[0];if(!f||t?.type!=='check-photo-upload'||u.busy)return;
      const alive=businessContextGuard();const seq=t.readSequence=(t.readSequence||0)+1;t.reading=true;t.error=null;render();
      try{
        if(!f.type.startsWith('image/')||f.type==='image/svg+xml'||f.size>20*1024*1024)throw Error('20MB 이하의 사진을 선택해 주세요.');
        const dataUrl=await compressImage(f,1280,0.72),data=dataUrl.split(',')[1];
        if(!data||data.length>1398104)throw Error('사진 용량이 커요. 작은 사진으로 다시 시도해 주세요.');
        if(!alive()||u!==sector4()||s4Top()!==t||seq!==t.readSequence)return;
        t.photo={type:'image/jpeg',data};t.draft={photoSelected:true};t.original='{}';
      }catch(e){if(alive()&&u===sector4()&&s4Top()===t&&seq===t.readSequence)t.error=e.message||'사진을 읽지 못했어요.';}
      finally{if(alive()&&u===sector4()&&s4Top()===t&&seq===t.readSequence){t.reading=false;render();}}
    };
  };
  async function m157SubmitPhoto(){
    const t=s4Top();if(t?.type!=='check-photo-upload'||sector4().busy||t.reading)return;
    if(!t.photo){t.error='완료 사진을 첨부해 주세요.';render();return;}
    const sid=currentStoreId(),date=state.checklistViewDate||bizToday(),u=sector4();
    if(await s4CheckWrite('check',{item_id:t.id,checked:true,photo:t.photo,expected_items:state.items})){
      if(u===sector4()&&sid===currentStoreId()&&date===(state.checklistViewDate||bizToday())&&s4Top()===t){s4Close(true);showToast('사진과 함께 완료했어요.');}
    }
  }
  async function m157OpenPhoto(id){
    s4Open('check-photo-view',id);const u=sector4(),t=s4Top(),alive=businessContextGuard(),sid=currentStoreId();t.loading=true;render();
    try{const r=await db.rpc('manee_checklist_photo',{p_store_id:sid,p_photo_id:id});if(r.error)throw r.error;if(!r.data?.id)throw Error('사진을 확인하지 못했어요.');if(alive()&&u===sector4()&&s4Top()===t)t.photo=r.data;}
    catch(e){if(alive()&&u===sector4()&&s4Top()===t)t.error=e.message||'사진을 불러오지 못했어요.';}
    finally{if(alive()&&u===sector4()&&s4Top()===t){t.loading=false;render();}}
  }
  async function m157ReviewPhoto(id){
    const t=s4Top(),u=sector4(),alive=businessContextGuard();if(state.role!=='storeOwner'||u.busy||t?.id!==id)return;
    const sid=currentStoreId(),date=state.checklistViewDate||bizToday();u.busy=true;t.error=null;render();
    try{const r=await callAuthChecklist('review-photo',sid,date,{photo_id:id});if(!alive()||u!==sector4()||s4Top()!==t)return;t.photo=r.photo;state.checklistPhotoMeta=state.checklistPhotoMeta||{};state.checklistPhotoMeta[id]=r.photo;showToast('사진을 확인했어요.');}
    catch(e){if(alive()&&u===sector4()&&s4Top()===t)t.error=e.message||'확인 결과를 저장하지 못했어요.';}
    finally{if(alive()&&u===sector4()){u.busy=false;render();}}
  }
