  // Keep wage-setting and monthly settlement as separate capabilities.
  const M161_PAY_HELP={
    wage:{title:'시급·월급 설정',text:'직원별 시급 또는 월급의 기준 금액을 조회하고 변경하는 권한입니다. 이번 달 급여 확정, 지급일과 가불 처리는 월별 급여 정산에서 관리합니다.'},
    payroll:{title:'월별 급여 정산',text:'이번 달 직원 급여를 확인·확정하고 지급일, 가불과 추가·차감 내역을 관리하는 권한입니다. 시급·월급의 기준 금액 변경은 시급·월급 설정에서 관리합니다.'}
  };
  R134_PERMISSION_LABELS.wage='시급·월급 설정';R134_PERMISSION_LABELS.payroll='월별 급여 정산';
  function m161PayInfo(key){return '<button type="button" class="m161-info" data-m161-pay-info="'+key+'" aria-label="'+M161_PAY_HELP[key].title+' 용도 설명"><span aria-hidden="true">i</span></button>';}
  r135ManagerMenu=function(){
    if(!r135Scoped()||!state.managerScope.enabled)return '';
    return '<section class="category team-card"><h3>매니저 관리 메뉴</h3>'+[['wage','시급·월급 설정'],['payroll','월별 급여 정산'],['reportView','월간 리포트']].filter(([key])=>r135Cap(key)).map(([key,label])=>'<div class="m161-menu-row"><button class="s4-btn" data-r135-manager="'+key+'">'+label+' ›</button>'+(M161_PAY_HELP[key]?m161PayInfo(key):'')+'</div>').join('')+'<p class="team-sub">권한 변경·해제는 사장님의 직원관리에서 할 수 있어요.</p></section>';
  };
  const m161ManagerOpen=r135ManagerOpen;
  r135ManagerOpen=function(page,id){if(page==='wage'||page==='payroll')r134().managerSection=page;return m161ManagerOpen(page,id);};
  const m161ManagerPanel=r135ManagerPanel;
  r135ManagerPanel=function(){
    const u=r134(),p=state.managerScope;
    if(u.managerPage==='wage'||u.managerPage==='payroll'){
      const key=u.managerPage;
      return '<h3>'+M161_PAY_HELP[key].title+'</h3>'+s4Hint(state.store+' · '+monthKey())+s4Hint(M161_PAY_HELP[key].text)+(p.crew||[]).map(c=>{
        const pay=p.payroll?.find(row=>row.crew_id===c.id),amount=key==='wage'?(c.wage_type==='monthly'?'월급 ':'시급 ')+s3Money(c.wage):pay?.needs_reconfirmation?'재확인 필요':pay?'확정 급여 '+s3Money(pay.net_pay):'미확정';
        return '<button class="s3-row" data-r135-manager="person" data-id="'+escapeHtml(c.id)+'"><span>'+escapeHtml(c.name)+'</span><strong>'+amount+'</strong><i>›</i></button>';
      }).join('');
    }
    let html=m161ManagerPanel().replaceAll('직원 시급·월급 관리','시급·월급 설정').replaceAll('직원 급여 관리','월별 급여 정산');
    return html;
  };
  const m161Permissions=r134Permissions;
  r134Permissions=function(){
    const template=document.createElement('template');template.innerHTML=m161Permissions();
    for(const key of ['wage','payroll']){
      const label=template.content.querySelector('[data-r134-perm="'+key+'"]')?.closest('label');if(!label)continue;
      const row=document.createElement('div');row.className='m161-permission-row';label.replaceWith(row);row.append(label);row.insertAdjacentHTML('beforeend',m161PayInfo(key));
    }
    const c=state.crew.find(c=>c.id===r134().id);
    return (c?.salesAccess?s4Hint('현재 매출 업무 권한이 있어요. 이 화면에서 저장하면 선택한 세부 권한으로 적용됩니다.'):'')+template.innerHTML;
  };
  function m161BindPayInfo(){
    app.querySelectorAll('[data-m161-pay-info]').forEach(button=>button.onclick=event=>{
      event.preventDefault();event.stopPropagation();const help=M161_PAY_HELP[button.dataset.m161PayInfo];if(!help)return;
      document.getElementById('m161-pay-help')?.remove();
      const dialog=document.createElement('dialog');dialog.id='m161-pay-help';dialog.className='m161-help';dialog.setAttribute('aria-labelledby','m161-pay-help-title');
      const title=document.createElement('h3');title.id='m161-pay-help-title';title.textContent=help.title;
      const body=document.createElement('p');body.textContent=help.text;
      const close=document.createElement('button');close.type='button';close.className='s4-btn primary full';close.textContent='확인';close.onclick=()=>dialog.close();
      dialog.append(title,body,close);dialog.addEventListener('close',()=>{dialog.remove();if(button.isConnected)button.focus();},{once:true});document.body.append(dialog);
      if(typeof dialog.showModal==='function')dialog.showModal();else{dialog.open=true;dialog.style.cssText='position:fixed;left:50%;top:50%;margin:0;transform:translate(-50%,-50%);z-index:10000';dialog.close=()=>dialog.dispatchEvent(new document.defaultView.Event('close'));}
    });
  }
  const m161BindR134=bindR134;bindR134=function(){m161BindR134();m161BindPayInfo();};
  const m161BindR135=bindR135Manager;bindR135Manager=function(){m161BindR135();m161BindPayInfo();};
