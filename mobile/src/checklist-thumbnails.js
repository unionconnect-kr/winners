  // Evidence remains authenticated. Only visible rows fetch images, two at a time.
  // Cache small previews in memory only; full-size review always revalidates on the server.
  let m160ThumbScope=null,m160ThumbActive=0;
  const m160ThumbQueue=[];
  function m160ThumbnailKey(){return JSON.stringify([state.authProfile?.user_id,state.role,currentStoreId(),state.checklistViewDate]);}
  function m160ThumbnailScope(){
    const key=m160ThumbnailKey();
    if(!m160ThumbScope||m160ThumbScope.key!==key||!m160ThumbScope.alive()){
      if(m160ThumbScope){m160ThumbScope.cancelled=true;m160ThumbScope.observer?.disconnect();m160ThumbScope.cache.clear();}
      m160ThumbScope={key,sid:currentStoreId(),alive:businessContextGuard(),cache:new Map(),pending:new Map(),failed:new Set()};
    }
    return m160ThumbScope;
  }
  function m160ThumbnailLive(scope,id){
    return scope===m160ThumbScope&&scope.key===m160ThumbnailKey()&&!scope.cancelled&&scope.alive()&&Object.entries(state.checkMeta||{}).some(([item,meta])=>state.checks[item]&&meta.photo_id===id);
  }
  function m160ResizeThumbnail(url){
    return new Promise((resolve,reject)=>{
      const img=document.createElement('img');
      const timer=setTimeout(()=>{img.src='';reject(Error('thumbnail timeout'));},10000);
      img.onerror=()=>{clearTimeout(timer);reject(Error('invalid photo'));};
      img.onload=()=>{
        clearTimeout(timer);
        try{
          if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw Error('invalid dimensions');
          const canvas=document.createElement('canvas');canvas.width=112;canvas.height=112;
          const size=Math.min(img.naturalWidth,img.naturalHeight),ctx=canvas.getContext('2d');
          ctx.drawImage(img,(img.naturalWidth-size)/2,(img.naturalHeight-size)/2,size,size,0,0,112,112);
          const thumb=canvas.toDataURL('image/jpeg',0.7);
          if(!thumb.startsWith('data:image/jpeg;base64,')||thumb.length>32000)throw Error('invalid thumbnail');
          resolve(thumb);
        }catch(e){reject(e);}
      };
      img.src=url;
    });
  }
  function m160PumpThumbnails(){
    while(m160ThumbActive<2&&m160ThumbQueue.length){
      const job=m160ThumbQueue.shift(),{scope,id,resolve}=job;
      if(!m160ThumbnailLive(scope,id)){scope.pending.delete(id);resolve(null);continue;}
      m160ThumbActive++;
      (async()=>{
        try{
          const r=await db.rpc('manee_checklist_photo',{p_store_id:scope.sid,p_photo_id:id});
          if(!m160ThumbnailLive(scope,id))return null;
          const url=!r.error&&r.data?.id===id?m157Image(r.data.image_type,r.data.image_base64):null;
          if(!url)throw Error('photo unavailable');
          const thumb=await m160ResizeThumbnail(url);
          if(!m160ThumbnailLive(scope,id))return null;
          scope.cache.set(id,thumb);
          while(scope.cache.size>40)scope.cache.delete(scope.cache.keys().next().value);
          return thumb;
        }catch{if(m160ThumbnailLive(scope,id))scope.failed.add(id);return null;}
      })().then(resolve).finally(()=>{scope.pending.delete(id);m160ThumbActive--;m160PumpThumbnails();});
    }
  }
  function m160Thumbnail(scope,id){
    if(!m160ThumbnailLive(scope,id)||scope.failed.has(id))return Promise.resolve(null);
    if(scope.cache.has(id))return Promise.resolve(scope.cache.get(id));
    if(scope.pending.has(id))return scope.pending.get(id);
    let resolve;const pending=new Promise(r=>{resolve=r;});scope.pending.set(id,pending);
    m160ThumbQueue.push({scope,id,resolve});m160PumpThumbnails();return pending;
  }
  const m160RenderChecklist=renderSector4Checklist;
  renderSector4Checklist=function(){
    let html=m160RenderChecklist();const scope=m160ThumbnailScope();
    for(const [id,meta] of Object.entries(state.checkMeta||{})){
      if(!state.checks[id]||!meta.photo_id)continue;
      const needle='data-s4="check" data-id="'+s4Escape(id)+'"',pos=html.indexOf(needle);
      if(pos<0)continue;
      const start=html.lastIndexOf('<button',pos),end=html.indexOf('</button>',pos)+9;
      if(start<0||end<9)continue;
      const p=state.checklistPhotoMeta?.[meta.photo_id],thumb=scope.cache.get(meta.photo_id);
      const status=p?.reviewed_at?'사장님 확인 완료':state.checklistPhotoLoadFailed?'사진 확인 상태 불러오기 실패':'사진 첨부 · 확인 대기';
      const row=html.slice(start,end).replace('</small>','<span class="m160-review-status">'+status+'</span></small>');
      const button='<button type="button" class="m160-photo-thumb" data-s4="check-photo" data-id="'+s4Escape(meta.photo_id)+'" data-photo-thumb="'+s4Escape(meta.photo_id)+'" aria-label="'+s4Escape((m157FindItem(id)?.label||'체크리스트')+' 완료 사진 크게 보기')+'">'+(thumb?'<img src="'+thumb+'" alt="" width="56" height="56">':'<span aria-hidden="true">사진<br>보기</span>')+'</button>';
      html=html.slice(0,start)+'<div class="m160-check-photo-row">'+row+button+'</div>'+html.slice(end);
    }
    return html;
  };
  const m160BindSector4=bindSector4;
  bindSector4=function(){
    m160BindSector4();const scope=m160ThumbnailScope();scope.observer?.disconnect();
    const buttons=[...document.querySelectorAll('[data-photo-thumb]')];
    const load=button=>{
      const id=button.dataset.photoThumb;
      m160Thumbnail(scope,id).then(thumb=>{
        if(!thumb||!button.isConnected||!m160ThumbnailLive(scope,id))return;
        const img=document.createElement('img');img.src=thumb;img.alt='';img.width=56;img.height=56;button.replaceChildren(img);
      });
    };
    if(typeof IntersectionObserver==='function'){
      scope.observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){scope.observer.unobserve(e.target);load(e.target);}},{rootMargin:'80px'});
      buttons.forEach(button=>scope.observer.observe(button));
    }else buttons.forEach(load);
  };
