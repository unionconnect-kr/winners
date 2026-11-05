// Synthetic page inventory. Never uses a live account or sends SMS/server writes.
export const pageCases=[];
const add=(kind,id,extra={})=>pageCases.push({name:[kind,id,extra.role,extra.variant].filter(Boolean).join('-'),kind,id,...extra});
for(const role of ['owner','staff']){
 for(const id of ['choose','password','signup'])add('entry',id,{role});
 for(const id of ['account-recovery','phone-bind','password-change','legacy-password-upgrade'])add('recovery',id,{role});
 for(const variant of ['default','duplicate','verified','expired','busy'])if(role==='staff')add('staff-signup','form',{role,variant});
}
for(const role of ['owner','staff'])for(const variant of ['available','unavailable','error'])add('entry','choose',{role,variant});
for(const role of ['staff','manager'])for(const variant of ['linked','unavailable'])add('team','account',{role,variant});
for(let id=0;id<5;id++)add('owner-signup',String(id));
for(const variant of ['duplicate','verified','expired','busy'])add('owner-signup','2',{variant});
for(const id of ['request-pending','request-rejected','auth-account'])add('recovery',id,{role:'owner'});
for(const id of ['location','cutoff','vendors','fixed','invite','checklist','preferences','review'])for(const variant of ['empty','populated'])add('setup',id,{variant});
for(const id of ['owner','owner-multiple','staff-long-name'])add('shell',id);
for(const id of ['Home','People','Sales','Operations','More'])for(const variant of ['empty','populated','error'])add('owner',id,{variant});
for(const id of ['attendance','calendar','crew','pay'])add('people-tab',id);
for(const id of ['sales','expenses','report'])add('sales-tab',id);
for(const id of ['checklist','reservations','announce','settings','alerts'])add('owner-route',id);
for(const id of ['vat','fixed-costs','cost-review','profile-changes','attendance-confirm'])add('more-page',id);
for(const id of ['employee','employee-edit','employee-new','employee-manage','invite','code','joins','manage','resigned','attendance-record','attendance-edit','attendance-new','attendance-requests','pay-detail','pay-actual','pay-adjust','pay-records','pay-help'])add('people',id);
for(const id of ['day','calendar','expenses','day-expenses','expense-group','review-expenses','adjustments','monthly-sales','labor','payroll','day-attendance','fixed','review-fixed','fixed-manage','costs','vendors','vendor-new','vendor-edit','vendor-delete','expense-new','expense-edit','stage-new','stage-edit'])add('s3',id);
for(const id of ['manage-checks','item-new','item-edit','close-checks','history','history-detail','res-detail','res-new','res-edit','res-cancel','notice-detail','notice-readers','notice-new','notice-edit','account','password','support'])add('s4',id);
for(const id of ['location','calendar','notifications','cutoff','manager','labor','food'])add('setting',id);
for(const role of ['staff','manager']){
 for(const id of ['home','schedule','reservations','expenses','checklist','announcements','sales','me','more','salesCalendar','salesReport'])for(const variant of ['empty','populated'])add('staff',id,{role,variant});
 for(const id of ['work','personal','personal-edit','connection','notifications','account','password','settings','help'])if(role==='manager'||id!=='settings')add('team',id,{role});
 for(const variant of ['fail','done','edit','loading','confirm'])add('team','personal-edit',{role,variant});
 for(const id of ['expense-new','expense-edit','expense-detail','stores','receipt'])add('expense',id,{role});
}
for(const id of ['permissions','permission-preview','contract','contract-view','manager'])for(const variant of ['ready','error'])add('r134',id,{variant});
for(const id of ['sale','report','wage','payroll','person'])add('manager',id);
for(const id of ['connection','personal','account'])add('team',id,{role:'staff',variant:'error'});
for(const id of ['settings','subscription'])add('native',id);
for(const id of ['insurance4','insurance2','tax33'])add('info',id);
for(const id of ['confirm','lightbox','add-store','sales-form','ai','info','guide','phone-bind','sms-verified','sms-expired'])add('extra',id);

for(const variant of ['confirmed','other-user'])add('expense','expense-detail',{role:'staff',variant});

export function seedPage(){
 const q=window.qa,s=q.state,date=q.todayKey(),month=q.monthKey();
 const c={id:'c',name:'테스트 직원',phone:'01012345678',position:'홀',isManager:false,salesAccess:true,wageType:'hourly',wage:11000,hireDate:month+'-01',active:true,notes:'테스트 메모',weeklyHours:20,workCondition:'주5일'};
 const res={id:'r',date,time:'18:00',customerName:'예약 테스트',phone:'01012345678',partySize:4,memo:'창가 좌석 요청',status:'confirmed',version:1};
 Object.assign(s,{role:'storeOwner',loading:false,splashDone:true,store:'매니 테스트점',myUsername:'qa_owner',storeList:['매니 테스트점'],myStores:['매니 테스트점'],storeIdMap:{'매니 테스트점':'s'},authProfile:{user_id:'u',username:'qa_owner',display_name:'테스트 사용자',status:'active'},authMemberships:[{store_id:'s',store_name:'매니 테스트점',role:'owner',crew_id:'c'}],crew:[c,{...c,id:'c2',name:'주방 직원',position:'주방'}],myCrewId:'c',selectedDate:date,selectedSalesDate:date,salesEditDate:date,dashboardData:[],dashboardLoading:false,homeStore:'매니 테스트점',items:{morning:[{id:'cat',name:'오픈 업무',title:'오픈 업무',items:[{id:'task',label:'매장 청소와 온도 확인',schedule:{kind:'daily'}}]}],afternoon:[],routine:[]},checks:{},attendance:[{id:'a',crewId:'c',date,checkIn:'10:00',checkOut:'18:30',confirmed:true}],shifts:[{id:'sh',crewId:'c',date,start:'10:00',end:'18:00'}],fixedSchedules:[],salesReports:[{id:'sale',date,crewId:'c',managerName:c.name,totalSales:1000000,netSales:980000,discount:10000,refund:10000,cashSales:300000,cardSales:680000,actualCash:290000,expense:10000,bankTransfer:0,cardExpense:20000,emoneySales:0,till:100000,deliveryBaemin:0,deliveryCoupang:0,deliveryYogiyo:0,cashExpenseItems:[],bankTransferItems:[],cardExpenseItems:[],settlementPhotos:[],receiptPhotos:[],notePhotos:[]}],expenseEntries:[{id:'e',date,vendorId:'v',description:'식자재 거래처',category:'food',amount:20000,paymentMethod:'card',paymentStatus:'paid',note:'테스트 지출',createdByName:c.name}],vendors:[{id:'v',name:'식자재 거래처',defaultCategory:'food'}],fixedExpenses:[{id:'f',name:'월세',amount:500000}],monthlyPayrolls:[],payAdjustments:[],announcements:[{id:'n',title:'이번 주 운영 안내',body:'직원 여러분, 출근 전 스케줄을 확인해 주세요.',audience:'all',reads:{c:true},createdAt:Date.now(),source:'store',version:1}],reservations:[res],upcomingReservations:[res],todayReservations:[res],dashboardReservations:[res],staffLinkRequests:[],ownerStaffAccess:{storeId:'s',store_join_code:'ABCD2345',requests:[{id:'join',name:'연결 요청 직원',display_name:'연결 요청 직원',username:'qa_new',status:'pending'}],links:[],attendance_edits:[],crew:[]},storeCutoffMap:{'매니 테스트점':6},storeLaborLimitMap:{'매니 테스트점':23},storeFoodLimitMap:{'매니 테스트점':43},storeLocationMap:{'매니 테스트점':{lat:37.5,lng:127}},storeManagerDashboardMap:{'매니 테스트점':true},storeOnboardingMap:{'매니 테스트점':true},teamProfile:{status:'ready',data:{profile:{person_name:c.name,phone:c.phone,source:'self'},stores:[]}},teamProfileLoading:false,teamProfileError:false,teamEdit:{step:'edit',name:c.name,phone:c.phone,form:{person_name:c.name,phone:c.phone},base:{person_name:c.name,phone:c.phone},conflict:{},fromStore:{},chips:{},confirm:{},stores:[],source:{person_name:c.name,phone:c.phone}},pendingStoreForOwner:'매니 테스트점'});
 s.checklistViewDate=q.bizToday();s.checklistLogMonth=q.bizToday().slice(0,7);s.homeChecklistItems=structuredClone(s.items);
 s.dashboardData=[{store:s.store,salesSum:1000000,salesReportCount:1,foodExpenseSum:20000,expenseSum:20000,fixedExpenseSum:500000,laborPay:93500,payrollEstimatedCount:1,unclassifiedExpenseSum:0,loadFailures:[],prevComparableSalesSum:800000,comparisonSalesSum:1000000,comparisonAvailable:true}];
 s.ownerWork={...s.ownerWork,loadedOnce:true,expanded:{},stores:{[s.store]:{bizDate:date,okAt:Date.now(),sched:{count:2},work:{checks:[]},sales:{ok:true,from:q.r138RecentDays()[0],to:date,days:{[date]:1000000}},attendance:{ok:true,arrived:[{id:'c',name:c.name,checkIn:'10:00'}],pending:[],missing:[]}}}};
 const recentDays=q.r138RecentDays();q.sector3().recent7={key:recentDays.join(','),loading:false,error:false,rows:s.salesReports};
 const u=q.sector4();u.reservations=[res];u.resLoaded=u.reservationDate;u.history=[{date,revision:1,done:1,total:1,reason:'마감 확인',items:s.items,checks:{task:true}}];
 const e=q.r136();e.vendors=s.vendors;e.entries=[{id:'e',date,category:'food',amount:20000,vendor_id:'v',vendor_name:'식자재 거래처',description:'식자재 거래처',payment_method:'card',payment_status:'paid',created_by_user_id:'u',created_by_name:'테스트 사용자',staff_revision:1,owner_confirmed_at:null,memo:'식자재 구매'}];e.loaded=true;
 q.sector3().staged=[{date,amount:10000,description:'식자재 거래처',vendorId:'v',category:'food',paymentMethod:'card',paymentStatus:'paid'}];
 window.qaBase=structuredClone(s);
}

export async function showPage(sc){
 const q=window.qa,s=q.state,app=document.getElementById('app');Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,structuredClone(window.qaBase));document.getElementById('manee-ios139-notice')?.remove();document.body.className='';app.className='app owner-ui';
 const date=q.todayKey(),month=q.monthKey();let h='';
 const asStaff=()=>{s.role='staff';s.crew[0].isManager=sc.role==='manager';s.authMemberships[0].role=sc.role==='manager'?'manager':'staff';s.managerScope={key:'u:s',configured:true,enabled:sc.role==='manager',permissions:{view:'sales',salesWrite:true,schedule:true,wage:true,payroll:true,reportView:true,reportEdit:true,export:true},crew:s.crew};};
 if(sc.variant==='empty'){s.dashboardData[0].salesSum=0;s.dashboardData[0].salesReportCount=0;s.ownerWork.stores[s.store].sales.days={};for(const k of ['attendance','shifts','salesReports','expenseEntries','vendors','fixedExpenses','announcements'])s[k]=[];q.sector4().reservations=[];q.r136().entries=[];q.r136().vendors=[];}
 if(sc.variant==='error'){s.reportDataFailed=new Set(['지출','고정지출','매출','급여']);s.ownerSetupVendorLoadError=true;s.teamProfileError=true;s.teamProfile.status='fail';s.checklistLoadFailed=true;s.ownerWork.stores[s.store].sales.ok=false;s.dashboardData[0].loadFailures=['매출','지출'];q.sector3().recent7.error=true;}
 if(sc.kind==='shell'){if(sc.id==='staff-long-name'){asStaff();s.store='매니 TestFlight 테스트점 아주 긴 매장 이름 확인';s.storeIdMap[s.store]='s';s.staffView='home';h=q.renderStaffApp();}else{s.section='dashboard';if(sc.id==='owner-multiple')s.myStores.push('매니 두 번째 테스트 매장');q.renderOwnerShell();h=app.innerHTML;}}
 if(sc.kind==='entry'){s.role='landing';s.landingMode='default';s.landingTab=sc.role==='owner'?'owner':'staff';s.authEntryView=sc.id;h=q.renderLanding();}
 if(sc.kind==='recovery'){s.role='landing';s.landingTab=sc.role==='owner'?'owner':'staff';s.landingMode=sc.id;h=q.renderLanding();}
 if(sc.kind==='staff-signup'){s.role='landing';s.landingTab='staff';s.landingMode='staff-signup';s.staffSignupUsernameCheck={username:'qa_staff',available:sc.variant!=='duplicate'};setSms('signup_staff',sc.variant);h=q.renderLanding();}
 if(sc.kind==='owner-signup'){s.role='landing';s.landingMode='request-form';s.ownerSignupDraft={step:Number(sc.id),name:'테스트 사장님',username:'qa_owner',password:'QaPassword12',confirm:'QaPassword12',store:'매니 테스트점',franchise:'',ageConfirmed:true};s.ownerRequestUsernameCheck={username:'qa_owner',available:sc.variant!=='duplicate'};s.ownerSignupBusy=sc.variant==='busy';setSms('signup_owner',sc.variant);h=q.renderLanding();}
 if(sc.kind==='setup'){s.onboardingStep=sc.id;h=q.renderOnboardingWizard();}
 if(sc.kind==='owner'){s.section={Home:'dashboard',People:'schedule',Sales:'sales',Operations:'checklist',More:'more'}[sc.id];h='<main>'+q['renderOwner'+sc.id]()+'</main>';}
 if(sc.kind==='people-tab'){s.section=sc.id==='pay'?'sales':'schedule';s.scheduleTab=sc.id;s.salesSectionTab=sc.id==='pay'?'pay':'sales';h='<main>'+q.renderOwnerPeople()+'</main>';}
 if(sc.kind==='owner-route'){s.section=sc.id;h='<main>'+(['settings','alerts'].includes(sc.id)?q.renderOwnerMore():q.renderOwnerOperations())+'</main>';}
 if(sc.kind==='more-page'){s.attConfirmPrompt={crewId:'c',date,id:'a'};h='<main>'+({vat:q.renderVatDetail,'fixed-costs':q.renderFixedExpenseManage,'cost-review':q.renderMonthlyCostReview,'profile-changes':q.renderOwnerProfileChanges,'attendance-confirm':q.renderAttConfirmPrompt}[sc.id])()+'</main>';}
 if(sc.kind==='sales-tab'){s.section='sales';s.salesSectionTab=sc.id;h='<main>'+q.renderOwnerSales()+'</main>';}
 if(sc.kind==='people'){s.section='schedule';const u=q.sector2();u.view=sc.id;u.id=sc.id.startsWith('attendance-')?'a':'c';h='<main><div class="s2">'+q.renderSector2View()+'</div></main>';}
 if(sc.kind==='s3'){const t={type:sc.id,id:sc.id==='vendor-edit'||sc.id==='vendor-delete'?'v':sc.id==='expense-edit'?'e':sc.id==='stage-edit'?'0':date};if(sc.id==='vendor-delete')t.inspection={vendor:s.vendors[0],count:1,total:20000};q.sector3().stack=[t];h=q.renderSector3Sheet();}
 if(sc.kind==='s4'||sc.kind==='setting'){const id=sc.kind==='setting'?sc.id:sc.id==='history-detail'?'0':sc.id.startsWith('item-')?JSON.stringify(['morning','cat','task']):sc.id.startsWith('notice-')?'n':'r';q.sector4().stack=[{type:sc.kind==='setting'?'setting':sc.id,id}];h=q.renderSector4Sheet();}
 if(sc.kind==='staff'||sc.kind==='team'){asStaff();s.staffView=sc.kind==='staff'?sc.id:sc.role==='manager'?'more':'me';s.teamPage=sc.kind==='team'?sc.id:null;if(sc.kind==='team'&&sc.id==='personal-edit'){s.teamEdit.step=sc.variant||'edit';if(sc.variant==='done')s.teamEdit.result={stores:[]};}h=q.renderStaffApp();}
 if(sc.kind==='expense'){asStaff();const entry=q.r136().entries[0];if(sc.variant==='confirmed')entry.owner_confirmed_at=date+'T12:00:00Z';if(sc.variant==='other-user')entry.created_by_user_id='other';const draft={date,category:'food',amount:20000,vendor_id:'v',payment_method:'card',payment_status:'paid',memo:'식자재 구매'};if(sc.id==='expense-edit')Object.assign(draft,{id:'e',revision:1});q.r136().sheet={type:sc.id,id:'e',draft,receipt:{name:'테스트 영수증',type:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII='}};h=q.r136Overlay();}
 if(sc.kind==='r134'){if(sc.id==='manager'){asStaff();s.managerScope.enabled=true;}const u=q.r134();Object.assign(u,{page:sc.id,id:'c',loading:false,error:sc.variant==='error'?'조회하지 못했어요.':null,unavailable:sc.variant==='error',draft:sc.id.includes('permission')?{view:'sales',salesWrite:true,schedule:true,wage:true,payroll:true,reportView:true,reportEdit:true,export:true}:q.r134ContractDefaults('c'),data:{enabled:true,revision:1,version:1,created_at:date+'T10:00:00Z',document:{employee:'테스트 직원',employer:'매니 테스트점'}}});h=q.r134Overlay();}
 if(sc.kind==='manager'){asStaff();s.managerScope.enabled=true;Object.assign(q.r134(),{page:'manager',managerPage:sc.id,id:sc.id==='sale'?date:'c',draft:{}});h=q.r134Overlay();}
 if(sc.kind==='info'){s.infoModalType=sc.id;h=q.renderInfoModal();}
 if(sc.kind==='native')h='<main>매니 웹</main>';
 if(sc.kind==='extra'){
  if(sc.id==='confirm'){s.pendingConfirm={message:'저장하지 않은 변경사항을 닫을까요?',onConfirm:()=>{}};h=q.renderConfirmOverlay();}
  if(sc.id==='lightbox'){s.lightboxSrc='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';h=q.renderLightbox();}
  if(sc.id==='add-store')h=q.renderAddStoreForm();
  if(sc.id==='sales-form'){s.showOwnerSalesForm=true;h=q.renderSalesReportForm();}
  if(sc.id==='ai'){s.r135AiOpen=true;h=q.r135AiSheet();}
  if(sc.id==='info'){s.infoModalType='labor';h=q.renderInfoModal();}
  if(sc.id==='guide'){s.r134GuideSelect=true;h=q.r134GuideSelector();}
  if(['phone-bind','sms-verified','sms-expired'].includes(sc.id)){s.role='landing';s.landingMode='phone-bind';setSms('bind',sc.id==='sms-verified'?'verified':sc.id==='sms-expired'?'expired':'default');h=q.renderLanding();}
 }
 app.classList.toggle('owner-ui',s.role!=='landing');app.innerHTML=h;window.scrollTo(0,0);
 if(sc.kind==='native'){if(sc.id==='settings')q.native.openSettings();else q.native.openSubscriptionStatus();}
 window.qaSocialCalls=[];
 if(app.querySelector('.ml-social-slot,[data-social-account-slot]'))await q.decorateSocialEntry({providers:async()=>{if(sc.variant==='error')throw Error('Offline provider lookup failure');return{kakao:sc.variant!=='unavailable',naver:sc.variant!=='unavailable'};},account:async userId=>({userId,linked:{kakao:sc.variant==='linked',naver:false}}),begin:async(provider,options)=>{window.qaSocialCalls.push({provider,...options});}});
 if(!h||h.includes('>null<'))throw Error('Fixture did not open an actual page: '+sc.name);
 function setSms(p,variant){s.smsAuth={[p]:{phone:'01012345678',username:p==='signup_owner'?'qa_owner':p==='signup_staff'?'qa_staff':'qa_owner',verifiedPhone:'01012345678',code:'123456',challenge_id:variant==='default'?null:'fixture',busy:variant==='busy',proof:variant==='verified'||variant==='expired'?'fixture-proof':null,proofUntil:variant==='verified'?Date.now()+60000:Date.now()-1000,message:variant==='expired'?'인증이 만료됐어요. 다시 인증해 주세요.':''}};}
}
