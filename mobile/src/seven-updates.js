  // A single RPC owns the atomic half-hour confirmation. Raw clock values are never overwritten.
  function m163Key(date){return (state.authProfile?.user_id||'')+':'+currentStoreId()+':'+date;}
  function m163Work(date){const key=m163Key(date);if(state.m163Work?.key!==key)state.m163Work={key,date,rows:null,busy:false,error:null};return state.m163Work;}
  async function m163LoadWork(date,force=false){
    const u=m163Work(date);if(u.busy||u.rows&&!force)return;u.busy=true;u.error=null;
    try{const r=await db.rpc('manee_manager_work',{p_store:currentStoreId(),p_date:date});if(r.error)throw r.error;if(u.key!==m163Key(date))return;u.rows=r.data||[];}
    catch(e){if(u.key===m163Key(date))u.error=e.message||'근무를 불러오지 못했어요.';}
    finally{u.busy=false;if(u.key===m163Key(date))render();}
  }
  function m163TimeSelect(name,value){let h='<select name="'+name+'" required aria-label="급여 적용 '+(name==='start'?'출근':'퇴근')+'"><option value="">시간 선택</option>';for(let i=0;i<48;i++){const v=String(Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00');h+='<option value="'+v+'"'+(v===value?' selected':'')+'>'+v+'</option>';}return h+'</select>';}
  function m163WorkRows(date,only){
    const u=m163Work(date);
    if(!u.rows&&!u.busy&&!u.error)void Promise.resolve().then(()=>m163LoadWork(date));
    if(u.error)return '<p role="alert">'+escapeHtml(u.error)+'</p><button type="button" data-m163-work-retry="'+date+'">다시 불러오기</button>';
    if(!u.rows)return '<p role="status">근무를 불러오고 있어요…</p>';
    const rows=u.rows.filter(r=>!only||r.id===only);if(!rows.length)return '<p>퇴근 처리된 직원이 없어요.</p>';
    return rows.map(r=>'<form class="m163-work" data-m163-att="'+r.id+'" data-date="'+date+'"><h4>'+escapeHtml(r.name)+'</h4><p>실제 기록 '+escapeHtml(r.check_in.slice(0,5))+' ~ '+escapeHtml(r.check_out.slice(0,5))+'</p>'+(r.confirmed?'<p class="owner-note">확인 완료'+(r.pay_check_in?' · 급여 적용 '+r.pay_check_in.slice(0,5)+' ~ '+r.pay_check_out.slice(0,5):' · 기존 확정 기록')+'</p>':'')+'<label>급여 적용 출근 '+m163TimeSelect('start',u.drafts?.[r.id]?.start??r.pay_check_in?.slice(0,5))+'</label><label>급여 적용 퇴근 '+m163TimeSelect('end',u.drafts?.[r.id]?.end??r.pay_check_out?.slice(0,5))+'</label><p class="owner-note">급여 적용 시간을 30분 단위로 선택해 주세요. 예: 09:00, 09:30. 퇴근 시간이 이르면 다음 날로 계산해요.</p><p role="alert" data-m163-error></p><button class="s4-btn primary full" type="submit"'+(u.saving?' disabled':'')+'>'+ (u.saving?'저장 중…':'급여 적용 시간 확인')+'</button></form>').join('');
  }
  async function m163ConfirmWork(form){
    const u=m163Work(form.dataset.date),a=u.rows?.find(r=>r.id===form.dataset.m163Att);if(!a||u.saving)return;
    const f=new FormData(form),start=String(f.get('start')),end=String(f.get('end')),status=form.querySelector('[data-m163-error]');
    if(!/^([01]\d|2[0-3]):(00|30)$/.test(start)||!/^([01]\d|2[0-3]):(00|30)$/.test(end)||start===end){status.textContent='급여 적용 출근·퇴근 시간을 30분 단위로 다르게 선택해 주세요.';return;}
    const previous=Object.fromEntries(['check_in','check_out','confirmed','pay_check_in','pay_check_out'].map(k=>[k,a[k]??null]));u.saving=true;form.querySelector('button[type=submit]').disabled=true;
    try{const r=await db.rpc('manee_manager_work',{p_store:currentStoreId(),p_date:u.date,p_action:'confirm',p_att:a.id,p_start:start,p_end:end,p_previous:previous});if(r.error)throw r.error;if(u.key!==m163Key(u.date))return;
      u.rows=r.data;if(u.drafts)delete u.drafts[a.id];const row=u.rows?.find(r=>r.id===a.id);if(row){const saved={...row,store_id:currentStoreId()};applyStaffAttendance(saved);}invalidateFinancialViews();if(state.role==='storeOwner')await loadMonthlyNetPayroll(state.store,monthKey());else if(state.managerScope)await r135LoadManager();if(u.key!==m163Key(u.date))return;showToast('급여 적용 시간을 확인했어요.');
      u.saving=false;render();
    }catch(e){if(u.key===m163Key(u.date)){status.textContent=e.code==='40001'?'다른 기기에서 근무가 변경됐어요. 다시 불러와 확인해 주세요.':e.message||'저장하지 못했어요. 입력 내용은 유지돼요.';if(e.code==='40001')u.rows=null;}}
    finally{u.saving=false;if(form.isConnected)form.querySelector('button[type=submit]').disabled=false;}
  }
  const m163OriginalToggleAttendance=toggleAttendanceConfirm;
  toggleAttendanceConfirm=async function(id){const a=state.attendance.find(r=>r.id===id);if(!a||!a.checkOut)return;state.m163WorkModal={date:a.date,id,key:m163Key(a.date)};render();};
  const m163ClockIn=clockIn,m163ClockOut=clockOut;
  function m163AskClock(direction){if(state.staffClockBusy||state.m163ClockConfirm)return;state.m163ClockContext=m163Key('clock');state.m163ClockConfirm=direction;render();}
  clockIn=()=>m163AskClock('in');clockOut=()=>m163AskClock('out');
  function m163ClockSheet(){const d=state.m163ClockConfirm;if(!d)return '';return '<div class="s3 s3-overlay"><section class="s3-sheet" role="dialog" aria-modal="true" aria-labelledby="m163-clock-title"><header><h3 id="m163-clock-title">'+(d==='in'?'출근하셨나요?':'퇴근하시겠어요?')+'</h3><button type="button" class="s3-x" data-m163-clock-cancel aria-label="취소하고 닫기">×</button></header><div class="s3-body"><p>'+(d==='in'?'오늘도 즐거운 하루 되세요!':'오늘도 수고하셨어요!')+'</p><button type="button" class="s4-btn primary full" data-m163-clock-ok>확인</button></div></section></div>';}
  const m163ExportPay=exportExcelAttendance;exportExcelAttendance=function(){const all=state.crew;try{if(!state.m163RetiredPay)state.crew=all.filter(isCrewActive);return m163ExportPay();}finally{state.crew=all;}};
  const m163PayDetail=renderSector2PayDetail;renderSector2PayDetail=function(c){state.m163RetiredPay=!!c&&!isCrewActive(c);return m163PayDetail(c);};
  const m163Pay=renderSector2Pay;
  renderSector2Pay=function(){state.m163RetiredPay=false;const all=state.crew;try{state.crew=all.filter(isCrewActive);return m163Pay()+'<p class="owner-note">재직자 급여 합계입니다. 퇴사자 정산은 직원관리 → 관리 메뉴 → 퇴사자관리에서 확인하세요. 월간 리포트 인건비에는 퇴사자의 해당 월 급여도 포함됩니다.</p>';}finally{state.crew=all;}};
  const m163StaffDetail=renderSector2Employee;
  renderSector2Employee=function(c){return m163StaffDetail(c)+(c&&!isCrewActive(c)?'<section class="day-panel"><h3>퇴사자 급여·최종 정산</h3>'+s2Button('급여 이력·미지급액 확인','pay-detail',c.id,true)+'</section>':'');};
  const m163ManagerPanel=r135ManagerPanel;
  r135ManagerPanel=function(){const p=state.managerScope,u=r134();if(!p)return m163ManagerPanel();const all=p.crew;try{if(['wage','payroll'].includes(u.managerPage))p.crew=(all||[]).filter(c=>!c.resign_date||c.resign_date>todayKey());let h=m163ManagerPanel();if(u.managerPage==='person'&&r135Cap('wage')&&u.managerSection!=='payroll'){const c=all?.find(c=>c.id===u.id);if(c){const flags=[['tax33','3.3% 원천징수'],['insurance4','4대보험'],['insurance2','2대보험'],['weekly_allowance','주휴수당 포함'],['probation','수습 적용']].map(([k,l])=>'<label class="s2-check"><input type="checkbox" name="'+k+'"'+(c[k]?' checked':'')+'>'+l+'</label>').join('');h=h.replace('<button class="s4-btn full" type="submit">시급·월급 저장</button>',flags+'<p class="owner-note">변경하면 사장님에게 알림이 전송됩니다. 3.3%·4대보험·2대보험은 한 가지만 선택하세요.</p><button class="s4-btn full" type="submit">시급·월급 저장</button>');}}if(u.managerPage==='payroll')h+='<p class="owner-note">퇴사자는 사장님의 퇴사자관리에서 정산합니다.</p>';return h;}finally{p.crew=all;}};
  r135ManagerWrite=async function(form,action){const u=r134(),c=state.managerScope?.crew?.find(c=>c.id===u.id);if(!c||u.busy)return;const f=new FormData(form);let payload,previous;
    if(action==='wage'){payload={wage:Number(f.get('wage')),wage_type:f.get('wage_type')};previous={wage:c.wage,wage_type:c.wage_type};for(const k of ['tax33','insurance4','insurance2','weekly_allowance','probation']){payload[k]=f.has(k);previous[k]=c[k]===true;}if(['tax33','insurance4','insurance2'].filter(k=>payload[k]).length>1){showToast('3.3%·4대보험·2대보험 중 한 가지만 선택해 주세요.');return;}}
    else if(action==='payroll'){payload={net_pay:Number(f.get('net_pay')),paid_on:f.get('paid_on')||null};previous={updated_at:state.managerScope.payroll?.find(p=>p.crew_id===c.id)?.updated_at||''};}
    else{if(f.get('type')==='가불'&&f.get('direction')==='add'){showToast('가불은 차감으로 등록해 주세요.');return;}payload={id:form.dataset.requestId||(form.dataset.requestId=crypto.randomUUID()),type:f.get('type'),amount:Number(f.get('amount'))*(f.get('direction')==='add'?1:-1),date:f.get('date'),note:String(f.get('note')||'').trim()};}
    const alive=businessContextGuard();u.busy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
    try{const r=await db.rpc('manee_manager_write_v2',{p_store_id:currentStoreId(),p_month_key:monthKey(),p_action:action,p_crew_id:c.id,p_payload:payload,p_previous:previous||null});if(r.error)throw r.error;if(!alive())return;await r135LoadManager();showToast('저장했어요.');u.busy=false;render();}
    catch(e){if(alive())showToast(e.message||'저장하지 못했어요. 입력 내용은 유지돼요.');}finally{u.busy=false;if(form.isConnected)button.disabled=false;}
  };
  async function m163LoadActivity(){if(state.role!=='storeOwner')return;const key=m163Key('activity'),u=state.m163Activity;if(u?.key===key&&(u.busy||Date.now()-u.at<30000))return;const entry=state.m163Activity={key,busy:true,at:Date.now(),rows:u?.key===key?u.rows:[]};try{const r=await db.rpc('manee_owner_activity_read',{p_store:currentStoreId()});if(r.error)throw r.error;if(key!==m163Key('activity'))return;entry.rows=r.data||[];entry.error=null;}catch{entry.error='업무 변경 알림을 불러오지 못했어요.';}finally{entry.busy=false;if(key===m163Key('activity'))render();}}
  function m163Activity(){if(state.role!=='storeOwner')return '';void Promise.resolve().then(m163LoadActivity);const u=state.m163Activity;if(u?.key!==m163Key('activity'))return '';return '<section class="s4-card"><h3>매니저 업무 변경 알림</h3>'+(u.error?'<p role="alert">'+u.error+'</p>':(u.rows||[]).map(r=>'<article class="day-panel"><p>'+escapeHtml(r.message)+'</p><small>'+escapeHtml(new Date(r.created_at).toLocaleString('ko-KR'))+'</small></article>').join('')||'<p>새 업무 변경 알림이 없어요.</p>')+'</section>';}
  const m163Groups=getNotifGroups;getNotifGroups=function(){const groups=m163Groups();if(state.role==='storeOwner'){void Promise.resolve().then(m163LoadActivity);const u=state.m163Activity;if(u?.key===m163Key('activity')&&u.rows?.length)groups.push({key:'manager-changes',label:'매니저 업무 변경 '+u.rows.length+'건'});}return groups;};
  const m163Notifications=renderNotifDetails;renderNotifDetails=function(){return m163Activity()+m163Notifications();};
  const m163Back=window.MANEE_HANDLE_BACK;window.MANEE_HANDLE_BACK=function(){if(state.m163ClockConfirm){state.m163ClockConfirm=null;render();return true;}if(state.m163WorkModal&&!state.m163Work?.saving){state.m163WorkModal=null;render();return true;}return m163Back?.()||false;};
  const m163Render=render;render=function(){if(state.m163ClockConfirm&&state.m163ClockContext!==m163Key('clock'))state.m163ClockConfirm=null;m163Render();if(!state||!app)return;
    if(state.m163WorkModal?.key&&state.m163WorkModal.key!==m163Key(state.m163WorkModal.date))state.m163WorkModal=null;const m=state.m163WorkModal;if(m)app.insertAdjacentHTML('beforeend','<div class="s3 s3-overlay"><section class="s3-sheet" role="dialog" aria-modal="true" aria-label="급여 적용 시간 확인"><header><h3>급여 적용 시간 확인</h3><button type="button" class="s3-x" data-m163-work-close aria-label="닫기">×</button></header><div class="s3-body">'+m163WorkRows(m.date,m.id)+'</div></section></div>');
    if(state.m163ClockConfirm)app.insertAdjacentHTML('beforeend',m163ClockSheet());
    app.querySelector('[data-m163-clock-cancel]')?.addEventListener('click',()=>{state.m163ClockConfirm=null;render();});
    app.querySelector('[data-m163-clock-ok]')?.addEventListener('click',async e=>{if(!state.m163ClockConfirm||state.staffClockBusy)return;const d=state.m163ClockConfirm;state.m163ClockConfirm=null;e.currentTarget.disabled=true;render();await (d==='in'?m163ClockIn:m163ClockOut)();});
    app.querySelector('[data-m163-work-close]')?.addEventListener('click',()=>{if(!state.m163Work?.saving){state.m163WorkModal=null;render();}});
    app.querySelectorAll('[data-m163-work-retry]').forEach(b=>b.onclick=()=>m163LoadWork(b.dataset.m163WorkRetry,true));
    app.querySelectorAll('form[data-m163-att]').forEach(f=>{const b=f.querySelector('[type=submit]');const valid=()=>{b.disabled=!!state.m163Work?.saving||!f.elements.start.value||!f.elements.end.value||f.elements.start.value===f.elements.end.value;};f.onchange=()=>{const u=m163Work(f.dataset.date);(u.drafts||={})[f.dataset.m163Att]={start:f.elements.start.value,end:f.elements.end.value};valid();};valid();f.onsubmit=e=>{e.preventDefault();void m163ConfirmWork(f);};});
    app.querySelectorAll('.m163-work,.s3-sheet').forEach(el=>el.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.m163ClockConfirm){e.preventDefault();state.m163ClockConfirm=null;render();}}));
  };
