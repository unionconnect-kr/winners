(function(root){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let current;
 function close(){if(current){current.dialog.remove();current.unsubscribe?.();current=null;}}
 function open({db,userId,isAlive}){
  close();const dialog=document.createElement('dialog');dialog.className='manee-support-dialog';document.body.append(dialog);
  const c=current={dialog,tickets:[],thread:null,busy:false,error:'',form:false,requestId:crypto.randomUUID(),userId};
  const alive=()=>current===c&&isAlive()&&dialog.isConnected;
  const sub=db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user?.id&&session.user.id!==userId)close();});c.unsubscribe=()=>sub.data?.subscription?.unsubscribe();
  const status={open:'접수',in_progress:'답변 도착',resolved:'해결'};
  async function rpc(action,payload={}){if(!alive()){close();throw Error('다시 로그인해 주세요.');}const r=await db.rpc('manee_support',{p_action:action,p_payload:payload});if(!alive())throw Error('로그인이 변경되었어요.');if(r.error)throw Error(r.error.message?.includes('rate_limited')?'접수 가능한 문의 수를 초과했어요. 잠시 후 다시 시도해 주세요.':'문의를 처리하지 못했어요. 다시 시도해 주세요.');return r.data;}
  const form=(reply=false)=>`<form data-support-form="${reply?'reply':'new'}">${reply?'':`<label>문의 유형<select name="category">${[['account','계정'],['billing','구독·결제'],['store','매장'],['staff','직원·급여'],['report','리포트'],['other','기타']].map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>제목<input name="title" required maxlength="120"></label>`}<label>${reply?'추가 내용':'문의 내용'}<textarea name="body" required maxlength="4000" rows="5"></textarea></label><p>비밀번호·인증번호·주민번호·계좌번호는 적지 마세요.</p><button type="submit" ${c.busy?'disabled':''}>${reply?'추가 문의 보내기':'문의 접수'}</button></form>`;
  function draw(){if(!alive())return;dialog.innerHTML=`<header><h2>매니 1:1 문의</h2><button type="button" data-support="close" aria-label="문의 창 닫기">닫기</button></header><div class="manee-support-body"><p role="status">${escape(c.error||'답변은 이 화면의 내 문의에서 확인할 수 있어요.')}</p>${c.thread?`<button type="button" data-support="list">← 내 문의</button><h3>${escape(c.thread.ticket.title)}</h3><p>${escape(status[c.thread.ticket.status])}</p>${c.thread.messages.map(m=>`<article class="manee-support-message"><b>${m.sender_type==='hq'?'매니 본사':'나'}</b><small>${escape(new Date(m.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</small><p>${escape(m.body)}</p></article>`).join('')}${form(true)}`:c.form?`<button type="button" data-support="list">← 내 문의</button>${form()}`:`<button type="button" data-support="new">새 문의 작성</button><button type="button" data-support="list">새로고침</button><div class="manee-support-list">${c.tickets.map(t=>`<button type="button" data-thread="${escape(t.id)}"><strong>${escape(t.title)}</strong><span>${escape(status[t.status])}${t.unread?' · 새 답변':''}</span><small>${escape(new Date(t.updated_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}))}</small></button>`).join('')||'<p>접수한 문의가 없어요.</p>'}</div>`}</div>`;}
  async function list(){const r=await rpc('list');c.tickets=r.tickets||[];c.thread=null;c.form=false;c.error='';draw();}
  async function read(id){const r=await rpc('read',{id});c.thread=r;c.requestId=crypto.randomUUID();c.error='';draw();}
  dialog.onclick=async e=>{const b=e.target.closest('button');if(!b||b.disabled||c.busy)return;try{if(b.dataset.support==='close'){close();return;}if(b.dataset.support==='new'){c.form=true;c.requestId=crypto.randomUUID();draw();}if(b.dataset.support==='list')await list();if(b.dataset.thread)await read(b.dataset.thread);}catch(error){if(alive()){c.error=error.message;draw();}}};
  dialog.onsubmit=async e=>{const f=e.target;if(!f.dataset.supportForm)return;e.preventDefault();if(c.busy)return;c.busy=true;f.querySelector('button[type=submit]').disabled=true;
   try{const v=Object.fromEntries(new FormData(f));const action=f.dataset.supportForm==='reply'?'reply':'create';const id=c.thread?.ticket.id||c.requestId;await rpc(action,{...v,id,message_id:c.requestId});c.busy=false;await read(id);}
   catch(error){if(alive()){c.error=error.message;dialog.querySelector('[role=status]').textContent=c.error;}}
   finally{c.busy=false;if(alive())dialog.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=false);}
  };
  dialog.oncancel=e=>{e.preventDefault();close();};dialog.showModal();draw();list().catch(error=>{if(alive()){c.error=error.message;draw();}});
 }
 root.MANEE_SUPPORT={open,close};
})(window);
