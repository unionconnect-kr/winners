  function m159CanManageChecklist(){return state.role==='storeOwner'&&canEditChecklistItems();}
  function m159ChecklistError(error){
    if(error?.code==='P4402')return '매니 구독을 확인한 뒤 업무를 저장해 주세요.';
    if(error?.code==='55000')return '오늘 점검이 마감됐어요. 오늘 점검을 다시 연 뒤 항목을 수정해 주세요.';
    if(error?.code==='40001')return '다른 곳에서 목록이 바뀌었어요. 다시 불러온 뒤 저장해 주세요.';
    if(error?.code==='42501')return '사장님 권한과 매장 연결을 다시 확인해 주세요.';
    return '저장하지 못했어요. 입력 내용은 유지돼요. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
  }
  function m159TemplatesReady(){return state.checklistTemplatesLoaded===true&&state.checklistTemplateStoreId===currentStoreId()&&state.checklistTemplateUserId===(state.authProfile?.user_id||null);}
  function m159AddButton(label,tab='',cls='primary'){
    const button=s4Button(label,'item-create',tab,cls);
    return m159TemplatesReady()&&!sector4().busy&&!sector4().checkLoading?button:button.replace('<button ','<button disabled ');
  }
  function m159OnboardingChecklist(){
    let h='<p>오픈·마감·정기 업무를 추가하고, 항목별로 완료 사진을 받을지 설정해 주세요. 운영 메뉴에서도 계속 수정할 수 있어요.</p>';
    if(!m159TemplatesReady())return h+s4Hint('업무 목록을 불러오지 못했어요. 다시 불러온 뒤 추가해 주세요.')+s4Button('다시 불러오기','reload-checks');
    h+='<div class="m159-check-actions">'+m159AddButton('+ 업무 추가',state.tab||'morning')+s4Button('항목 설정','manage-checks')+'</div>';
    for(const tab of TABS){
      const groups=state.items[tab.id]||[];
      h+='<section class="m159-setup-checks"><div class="s4-heading"><h3>'+s4Escape(tab.id==='routine'?'정기 점검':tab.label+' 업무')+'</h3>'+m159AddButton('+ 추가',tab.id,'')+'</div>';
      let count=0;
      for(const c of groups){
        h+='<h4>'+s4Escape(c.name||c.title||'업무')+'</h4>';
        for(const it of c.items||[]){count++;h+='<div class="m159-setup-item"><span><strong>'+s4Escape(it.label)+'</strong><small>'+s4Escape(s4Schedule(it))+' · '+(it.photoRequired===true?'완료 사진 필수':'체크로 완료')+'</small></span>'+s4Button('수정','item-edit',JSON.stringify([tab.id,c.id,it.id]))+'</div>';}
      }
      if(!count)h+=s4Hint('아직 등록된 업무가 없어요. 위의 추가 버튼을 눌러 주세요.');
      h+='</section>';
    }
    return h;
  }
  const m159RenderChecklist=renderSector4Checklist;
  renderSector4Checklist=function(){
    let h=m159RenderChecklist();if(!m159CanManageChecklist())return h;
    const toolbar='<div class="m159-check-actions">'+m159AddButton('+ 업무 추가',state.tab||'morning')+(m159TemplatesReady()?s4Button('항목 설정','manage-checks'):'')+'</div>';
    const headingEnd=h.indexOf('</div>');
    if(headingEnd>=0)h=h.slice(0,headingEnd+6)+toolbar+h.slice(headingEnd+6);else h=toolbar+h;
    if(state.checklistPhotoLoadFailed)h+=s4Hint('사진 확인 상태를 불러오지 못했어요. 완료 사진은 항목에서 다시 열 수 있어요.');
    return h;
  };
  const m159RenderSheet=renderSector4Sheet;
  renderSector4Sheet=function(){
    const t=s4Top();
    if(t?.type==='manage-checks'){
      const h=m159RenderSheet();if(!m159CanManageChecklist())return h;
      return h.replace('<div class="s4-body">','<div class="s4-body"><div class="m159-check-actions">'+TABS.map(tab=>m159AddButton('+ '+(tab.id==='routine'?'정기':tab.label)+' 업무',tab.id)).join('')+'</div>');
    }
    if(t?.type!=='item-create')return m159RenderSheet();
    const tab=TABS.some(tab=>tab.id===t.id)?t.id:'morning';
    const d=s4Draft(t,{tab,category:(state.items[tab]||[])[0]?.id||'',label:'',kind:'daily',day:'1',photoRequired:false});
    const groups=state.items[d.tab]||[];
    let body='';
    if(!m159CanManageChecklist())body=s4Hint('업무 항목은 사장님이 설정할 수 있어요.');
    else if(!m159TemplatesReady())body=s4Hint('목록을 다시 불러온 뒤 추가해 주세요.');
    else{
      body='<form id="s4-form">'+s4Select('업무 구분','tab',d.tab,TABS.map(tab=>[tab.id,tab.id==='routine'?'정기 점검':tab.label+' 업무']));
      if(groups.length>1)body+=s4Select('업무 목록','category',d.category,groups.map(c=>[c.id,c.name||c.title||'업무']));
      body+=s4Field('업무 내용','label',d.label,'text','required maxlength="1000"')+s4Select('점검 주기','kind',d.kind,[['daily','매일'],['weekly','매주'],['monthly','매월']]);
      if(d.kind==='weekly')body+=s4Select('요일','day',d.day,['일','월','화','수','목','금','토'].map((label,i)=>[i,label+'요일']));
      else if(d.kind==='monthly')body+=s4Field('날짜','day',d.day,'number','required min="1" max="31"')+s4Hint('해당 날짜가 없는 달은 마지막 날에 점검해요.');
      body+='<label class="s4-check-label"><input type="checkbox" name="photoRequired"'+(d.photoRequired?' checked':'')+'> 완료 사진 받기</label>'+s4Hint('켜면 직원이 사진을 첨부해야 완료할 수 있어요. 끄면 체크만으로 완료해요.')+s4SaveLabel('업무 추가')+'</form>';
    }
    return '<div class="s4 s4-overlay"><section class="s4-sheet" role="dialog" aria-modal="true" aria-labelledby="s4-title"><header><h3 id="s4-title" tabindex="-1">체크리스트 업무 추가</h3><button data-s4="close" class="s4-x" aria-label="닫기"'+(sector4().busy?' disabled':'')+'>×</button></header><div class="s4-body">'+(t.error?'<div class="s4-error" role="alert">'+s4Escape(t.error)+'</div>':'')+body+'</div></section></div>';
  };
  async function m159CreateItem(){
    const t=s4Capture(),u=sector4();if(t?.type!=='item-create'||u.busy)return;
    if(!m159CanManageChecklist()||!m159TemplatesReady()){t.error='업무 목록과 사장님 권한을 다시 확인해 주세요.';render();return;}
    const d=t.draft||{},tab=TABS.find(tab=>tab.id===d.tab),label=String(d.label||'').trim();
    if(!tab||!label||label.length>1000||!['daily','weekly','monthly'].includes(d.kind)){t.error='업무 내용과 점검 주기를 확인해 주세요.';render();return;}
    const day=Number(d.day);
    if(d.kind!=='daily'&&(!Number.isInteger(day)||(d.kind==='weekly'?(day<0||day>6):(day<1||day>31)))){t.error='점검 날짜를 확인해 주세요.';render();return;}
    const expected=state.items,items=structuredClone(expected),groups=items[tab.id]||(items[tab.id]=[]);
    let category=groups.find(c=>c.id===d.category);
    if(!category&&groups.length===1)category=groups[0];
    if(!category&&groups.length){t.error='추가할 업무 목록을 선택해 주세요.';render();return;}
    if(!category){category={id:'c_'+s4Uuid(),name:tab.label+' 업무',items:[]};groups.push(category);}
    category.items.push({id:t.itemId||(t.itemId='s4_'+s4Uuid()),label,photoRequired:d.photoRequired===true,schedule:{kind:d.kind,...(d.kind==='daily'?{}:{day})}});
    const alive=businessContextGuard();
    if(await s4CheckWrite('templates',{items,expected_items:expected})){
      if(alive()&&u===sector4()&&s4Top()===t){s4Close(true);showToast('업무를 추가했어요.');}
    }
  }
  const m159BindSector4=bindSector4;
  bindSector4=function(){
    m159BindSector4();const form=document.getElementById('s4-form');if(!form||s4Top()?.type!=='item-create')return;
    form.onchange=e=>{const t=s4Capture();if(e.target.name==='tab'){t.draft.category=(state.items[t.draft.tab]||[])[0]?.id||'';render();}else if(e.target.name==='kind'){t.draft.day='1';render();}};
    form.onsubmit=e=>{e.preventDefault();if(form.reportValidity())m159CreateItem();};
  };
