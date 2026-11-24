  // Viewing a checklist never creates templates or needs a paid write entitlement.
  async function loadChecklist(store, dateStr){
    const d=dateStr||bizToday(),storeId=state.storeIdMap[store],alive=maneeLoadGuard('checklist');
    let items={},checks={},meta={},photos={},templateError=null,checkError=null,photoError=null;
    if(storeId){
      try{const r=await db.from('checklist_templates').select('tab,data').eq('store_id',storeId);if(r.error)throw r.error;for(const row of r.data||[])items[row.tab]=row.data;}
      catch(e){templateError=e;}
      if(!alive())return;
      if(!templateError){
        try{const r=await db.from('checklist_checks').select('item_id,checked_at,checked_by,photo_id').eq('store_id',storeId).eq('date',d).eq('checked',true);if(r.error)throw r.error;for(const row of r.data||[]){checks[row.item_id]=true;meta[row.item_id]=row;}}
        catch(e){checkError=e;}
      }
      if(!alive())return;
      const photoIds=[...new Set(Object.values(meta).map(r=>r.photo_id).filter(Boolean))];
      if(photoIds.length){
        try{const r=await db.from('manee_checklist_photos').select('id,item_id,created_at,reviewed_at,reviewed_by').eq('store_id',storeId).eq('date',d).in('id',photoIds);if(r.error)throw r.error;photos=Object.fromEntries((r.data||[]).map(p=>[p.id,p]));}
        catch(e){photoError=e;}
      }
    }
    if(!alive())return;
    state.checklistTemplateStoreId=storeId||null;
    state.checklistTemplateUserId=state.authProfile?.user_id||null;
    state.checklistTemplatesLoaded=!!storeId&&!templateError;
    state.checklistLoadFailed=!!(templateError||checkError);
    state.checklistLoadErrorCode=(templateError||checkError)?.code||null;
    state.checklistPhotoLoadFailed=!!photoError;
    state.items=templateError?{}:items;
    state.checks=checkError?{}:checks;
    state.checkMeta=checkError?{}:meta;
    state.checklistPhotoMeta=photos;
    state.checklistViewDate=d;
  }
