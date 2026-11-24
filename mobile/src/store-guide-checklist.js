  // Video titles and URLs were verified on the official channel, 2026-11-24.
  const M157_GUIDE_CHANNEL='https://youtube.com/@manee-official';
  const M157_GUIDES=[
    ['start','회원가입과 첫 매장','처음 시작하는 사장님','https://www.youtube.com/watch?v=7nJ2DIiPXlE'],
    ['staff','직원 등록과 연결 승인','직원 연결 요청 확인하기','https://www.youtube.com/watch?v=vqDjWxRdteE&pp=0gcJCTwIAYcqIYzv'],
    ['schedule','스케줄 등록 및 수정','직원 근무 일정 관리하기','https://www.youtube.com/watch?v=OB4x_djMUD4'],
    ['contract','근로계약서 작성과 PDF 저장','근로계약서 작성하기','https://www.youtube.com/watch?v=m2556VmxTGE'],
    ['permissions','매니저 지정과 권한 설정','직원별 권한 설정하기','https://www.youtube.com/watch?v=4Wz25JWhzKI'],
    ['sales','매출 등록 및 테스트','매출 기록하기','https://www.youtube.com/watch?v=Fo5V3UtxXAo'],
    ['fixed','고정비 추가','매달 발생하는 비용 등록하기','https://www.youtube.com/watch?v=TRhGbigG8O4'],
    ['reservation','예약 등록','매장 예약 기록하기','https://www.youtube.com/watch?v=DbANFdDYkV0'],
    ['staff-join','직원 가입과 매장 연결','직원이 확인할 사용법','https://www.youtube.com/watch?v=eeiJxrjNRFE'],
    ['attendance','출퇴근 기록','직원이 확인할 사용법','https://www.youtube.com/watch?v=B5nWZBWa6oU']
  ];
  function m157GuideUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)return null;const id=u.hostname==='youtu.be'?u.pathname.slice(1):['youtube.com','www.youtube.com'].includes(u.hostname)&&u.pathname==='/watch'?u.searchParams.get('v'):null;if(/^[A-Za-z0-9_-]{11}$/.test(id||''))return u.href;}catch{}return null;}
  function m157FindItem(id){return Object.values(state.items||{}).flatMap(c=>c||[]).flatMap(c=>c.items||[]).find(it=>it.id===id);}
  function m157Image(type,data){return ['image/jpeg','image/png','image/webp'].includes(type)&&typeof data==='string'&&data.length<=1398104&&/^[A-Za-z0-9+/]+={0,2}$/.test(data)?'data:'+type+';base64,'+data:null;}
  const M161_PHOTO_BUCKET='manee-checklist-evidence';
  function m161PhotoIds(id){
    for(const meta of Object.values(state.checkMeta||{})){const ids=meta.photo_ids?.length?meta.photo_ids:[meta.photo_id];if(ids.includes(id))return ids.slice(0,4);}
    for(const row of sector4().history||[])for(const ids of Object.values(row.photo_sets||{}))if(Array.isArray(ids)&&ids.includes(id))return ids.slice(0,4);
    return [id];
  }
  function m161BlobURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('사진을 읽지 못했어요.'));reader.onload=()=>{const url=String(reader.result||''),parts=url.split(',');const type=parts[0]?.match(/^data:(image\/(?:jpeg|png|webp));base64$/)?.[1],valid=m157Image(type,parts[1]);valid?resolve(valid):reject(Error('사진 형식을 확인해 주세요.'));};reader.readAsDataURL(blob);});}
  function m161PhotoPath(path,id,thumbnail){
    const sid=currentStoreId(),uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    return typeof path==='string'&&path.startsWith(sid+'/')&&new RegExp('^'+uuid+'/\\d{4}-\\d{2}-\\d{2}/'+uuid+'/'+uuid+'/'+(thumbnail?'thumb':'image')+'\\.jpg$').test(path)&&path.split('/')[3]===id;
  }
  async function m161ReadEvidence(photo,thumbnail=false){
    if(photo.image_base64)return m157Image(photo.image_type,photo.image_base64);
    const path=thumbnail?photo.thumbnail_path:photo.object_path;if(!m161PhotoPath(path,photo.id,thumbnail))throw Error('사진 경로를 확인하지 못했어요.');
    const r=await db.storage.from(M161_PHOTO_BUCKET).download(path,{}, {signal:AbortSignal.timeout(15000)});
    if(r.error||!r.data||r.data.type!=='image/jpeg'||r.data.size>(thumbnail?32768:358400))throw Error('사진을 불러오지 못했어요.');
    return m161BlobURL(r.data);
  }
  function m157Guide(){
    const links=window.MANEE_GUIDE_LINKS||{};
    return '<p class="m157-guide-intro">궁금한 기능을 누르면 해당 영상이 바로 열려요.</p><div>'+M157_GUIDES.map(([key,title,desc,verified])=>{const url=m157GuideUrl(links[key])||verified;return '<a class="m157-guide-row" href="'+s4Escape(url)+'" target="_blank" rel="noopener noreferrer"><span><b>'+s4Escape(title)+'</b><small>'+s4Escape(desc)+'</small></span><span aria-hidden="true">▷</span></a>';}).join('')+'</div><a class="m157-guide-channel" href="'+M157_GUIDE_CHANNEL+'" target="_blank" rel="noopener noreferrer">매니 공식 유튜브 채널 ↗</a>';
  }
  const m157RenderSheet=renderSector4Sheet;
  renderSector4Sheet=function(){
    const t=s4Top();if(!t||!['owner-guide','check-photo-upload','check-photo-view'].includes(t.type))return m157RenderSheet();
    let title='',body='';
    if(t.type==='owner-guide'){
      title='사장님 사용법';body=state.role==='storeOwner'?m157Guide():s4Hint('사장님 계정에서 이용할 수 있어요.');
    }else if(t.type==='check-photo-upload'){
      title=m157FindItem(t.id)?.label||'완료 사진';
      const photos=t.photos||[];
      body=s4Hint('완료 사진을 1~4장 첨부해 주세요. 사장님이 크게 확인할 수 있어요.')+'<label class="m157-photo-upload">완료 사진 '+photos.length+' / 4장<input type="file" id="m157-check-file" accept="image/*" multiple'+(sector4().busy||t.reading||photos.length>=4?' disabled':'')+'></label><div class="m161-upload-grid">'+photos.map((p,i)=>'<div><img src="'+m157Image(p.type,p.data)+'" alt="완료 사진 '+(i+1)+' 미리보기">'+s4Button('삭제','check-photo-remove',String(i))+'</div>').join('')+'</div>'+(t.reading?s4Hint('사진을 압축하고 있어요…'):'')+(t.uploading?s4Hint('사진을 안전하게 저장하고 있어요…'):'')+s4Button('사진과 함께 완료','check-photo-save','','primary full');
    }else{
      const p=t.photo,url=p?.displayUrl||(p?m157Image(p.image_type,p.image_base64):null),ids=t.photoIds||[t.id],index=ids.indexOf(t.id);title=p?.item_label||'완료 사진';
      body=(ids.length>1?'<div class="m161-photo-nav">'+(index>0?s4Button('‹ 이전','check-photo-prev'):'<span></span>')+'<span>'+(index+1)+' / '+ids.length+'</span>'+(index<ids.length-1?s4Button('다음 ›','check-photo-next'):'<span></span>')+'</div>':'')+(t.loading?s4Hint('사진을 불러오고 있어요…'):url?s4Hint('완료 사진')+'<img class="m157-check-image m160-photo-large" src="'+url+'" alt="'+s4Escape(p.item_label||'체크리스트 완료 사진')+'">'+s4Hint(p.reviewed_at?'사장님 확인 완료':'사장님 확인 대기')+(state.role==='storeOwner'&&!p.reviewed_at?s4Button('이 사진 확인 완료','check-photo-review',t.id,'primary full'):''):s4Hint('사진을 불러오지 못했어요. 닫고 다시 시도해 주세요.'));
    }
    return '<div class="s4 s4-overlay"><section class="s4-sheet" role="dialog" aria-modal="true" aria-labelledby="s4-title"><header><h3 id="s4-title" tabindex="-1">'+s4Escape(title)+'</h3><button data-s4="close" class="s4-x" aria-label="닫기"'+(sector4().busy?' disabled':'')+'>×</button></header><div class="s4-body">'+(t.error?'<div class="s4-error" role="alert">'+s4Escape(t.error)+'</div>':'')+body+'</div></section></div>';
  };
  const m157BindSector4=bindSector4;
  bindSector4=function(){
    m157BindSector4();
    const input=document.getElementById('m157-check-file');if(!input)return;
    input.onchange=async()=>{
      const t=s4Top(),u=sector4(),files=[...input.files||[]];if(!files.length||t?.type!=='check-photo-upload'||u.busy||t.reading)return;
      if(files.length+(t.photos?.length||0)>4){t.error='완료 사진은 최대 4장까지 첨부할 수 있어요.';render();return;}
      const alive=businessContextGuard();const seq=t.readSequence=(t.readSequence||0)+1;t.reading=true;t.error=null;render();
      try{
        const photos=[];
        for(const f of files){
          if(!f.type.startsWith('image/')||f.type==='image/svg+xml'||f.size>20*1024*1024)throw Error('20MB 이하의 사진을 선택해 주세요.');
          let data;for(const [size,quality] of [[1280,.72],[1280,.55],[960,.5]]){data=(await compressImage(f,size,quality)).split(',')[1];if(data&&data.length<=477864)break;}
          const thumbnail=(await compressImage(f,160,.6)).split(',')[1];
          if(!data||data.length>477864||!thumbnail||thumbnail.length>43688)throw Error('사진 용량이 커요. 작은 사진으로 다시 시도해 주세요.');
          photos.push({type:'image/jpeg',data,thumbnail});
        }
        if(!alive()||u!==sector4()||s4Top()!==t||seq!==t.readSequence)return;
        t.photos=[...t.photos||[],...photos];t.draft={photoCount:t.photos.length};t.original='{}';
      }catch(e){if(alive()&&u===sector4()&&s4Top()===t&&seq===t.readSequence)t.error=e.message||'사진을 읽지 못했어요.';}
      finally{if(alive()&&u===sector4()&&s4Top()===t&&seq===t.readSequence){t.reading=false;render();}}
    };
  };
  async function m157SubmitPhoto(){
    const t=s4Top();if(t?.type!=='check-photo-upload'||sector4().busy||t.reading||t.uploading)return;
    const photos=t.photos||[];if(!photos.length||photos.length>4){t.error='완료 사진을 1~4장 첨부해 주세요.';render();return;}
    const sid=currentStoreId(),date=state.checklistViewDate||bizToday(),u=sector4(),alive=businessContextGuard(),expected=JSON.parse(JSON.stringify(state.items)),paths=[],request=crypto.randomUUID();let committed=false;
    const valid=()=>alive()&&u===sector4()&&s4Top()===t&&date===(state.checklistViewDate||bizToday());
    u.busy=true;t.uploading=true;t.error=null;render();
    try{
      const r=await db.rpc('manee_checklist_prepare_photos',{p_store_id:sid,p_date:date,p_item_id:t.id,p_count:photos.length,p_request_id:request,p_expected_items:expected});if(r.error)throw r.error;
      if(!valid())return;const tickets=r.data?.photos;
      if(!Array.isArray(tickets)||tickets.length!==photos.length)throw Error('사진 업로드를 준비하지 못했어요.');
      for(let i=0;i<tickets.length;i++){
        const ticket=tickets[i];
        if(!m161PhotoPath(ticket.object_path,ticket.id,false)||!m161PhotoPath(ticket.thumbnail_path,ticket.id,true))throw Error('사진 업로드 경로를 확인하지 못했어요.');
        if(!valid())return;paths.push(ticket.object_path,ticket.thumbnail_path);
        const upload=await db.functions.invoke('manee-checklist-photo-upload',{body:{store_id:sid,date,item_id:t.id,count:photos.length,index:i,request_id:request,expected_items:expected,image:photos[i].data,thumbnail:photos[i].thumbnail}});
        if(upload.error){let detail;try{detail=await upload.error.context?.json();}catch{}throw Object.assign(Error(detail?.message||'사진을 저장하지 못했어요.'),{code:detail?.code});}
        if(upload.data?.ok!==true||upload.data.photo_id!==ticket.id)throw Error('사진 저장 결과를 확인하지 못했어요.');
      }
      if(!valid())return;u.busy=false;
      committed=await s4CheckWrite('check',{item_id:t.id,checked:true,photos:tickets.map(p=>p.id),expected_items:expected});
      if(committed&&valid()){s4Close(true);showToast('사진과 함께 완료했어요.');}
    }catch(e){if(valid()){t.error=typeof m159ChecklistError==='function'?m159ChecklistError(e):'사진을 저장하지 못했어요. 다시 시도해 주세요.';if(e.code==='P4402')window.MANEE_NATIVE?.subscriptionDenied?.();}}
    finally{
      // Committed evidence is immutable: RLS denies removal even if a response was lost.
      if(!committed&&paths.length&&alive())try{await db.storage.from(M161_PHOTO_BUCKET).remove(paths);}catch{}
      if(u===sector4()){u.busy=false;t.uploading=false;if(valid())render();}
    }
  }
  async function m157OpenPhoto(id){
    s4Open('check-photo-view',id);const t=s4Top();t.photoIds=m161PhotoIds(id);return m161LoadPhoto(t,id);
  }
  async function m161LoadPhoto(t,id){
    const u=sector4(),alive=businessContextGuard(),sid=currentStoreId(),seq=t.sequence=(t.sequence||0)+1;t.id=id;t.photo=null;t.error=null;t.loading=true;render();
    const valid=()=>alive()&&u===sector4()&&s4Top()===t&&t.sequence===seq;
    try{const r=await db.rpc('manee_checklist_photo',{p_store_id:sid,p_photo_id:id});if(r.error)throw r.error;if(r.data?.id!==id)throw Error('사진을 확인하지 못했어요.');if(!valid())return;const displayUrl=await m161ReadEvidence(r.data);if(valid())t.photo={...r.data,displayUrl};}
    catch(e){if(valid())t.error='사진을 불러오지 못했어요. 닫고 다시 시도해 주세요.';}
    finally{if(valid()){t.loading=false;render();}}
  }
  async function m157ReviewPhoto(id){
    const t=s4Top(),u=sector4(),alive=businessContextGuard();if(state.role!=='storeOwner'||u.busy||t?.id!==id)return;
    const sid=currentStoreId(),date=state.checklistViewDate||bizToday();u.busy=true;t.error=null;render();
    try{const r=await callAuthChecklist('review-photo',sid,date,{photo_id:id});if(!alive()||u!==sector4()||s4Top()!==t||t.id!==id)return;t.photo={...r.photo,displayUrl:t.photo?.displayUrl};state.checklistPhotoMeta=state.checklistPhotoMeta||{};state.checklistPhotoMeta[id]=r.photo;showToast('사진을 확인했어요.');}
    catch(e){if(alive()&&u===sector4()&&s4Top()===t)t.error=e.message||'확인 결과를 저장하지 못했어요.';}
    finally{if(alive()&&u===sector4()){u.busy=false;render();}}
  }
