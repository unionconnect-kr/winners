import {readFileSync} from 'node:fs';
export function installSevenUpdates(source){
 let html=source;const once=(a,b)=>{if(html.split(a).length!==2)throw Error('Next update anchor changed: '+a.slice(0,90));html=html.replace(a,()=>b);};
 const start=html.indexOf("    html += '<div class=\"s-card\"><p class=\"s-label\">오늘 근무 확인</p>';");
 const end=html.indexOf("    html += '<div class=\"s-card\">';",start+1);if(start<0||end<start)throw Error('Missing today work form');
 html=html.slice(0,start)+"    html += '<section class=\"s-card\"><h3>오늘 근무 확인</h3>'+m163WorkRows(dateStr)+'</section>';\n\n"+html.slice(end);
 html=html.replaceAll('a.checkInExact||a.checkIn','a.payCheckIn||a.checkInExact||a.checkIn').replaceAll('a.checkOutExact||a.checkOut','a.payCheckOut||a.checkOutExact||a.checkOut');
 html=html.replaceAll('r.checkInExact||r.checkIn','r.payCheckIn||r.checkInExact||r.checkIn').replaceAll('r.checkOutExact||r.checkOut','r.payCheckOut||r.checkOutExact||r.checkOut');
 // Keep original clock times and actual duration in exports; only the pay-hours column uses approval.
 once('a.payCheckIn||a.checkInExact||a.checkIn, a.payCheckOut||a.checkOutExact||a.checkOut, Number(hoursBetween(a.payCheckIn||a.checkInExact||a.checkIn,a.payCheckOut||a.checkOutExact||a.checkOut).toFixed(4))','a.checkInExact||a.checkIn, a.checkOutExact||a.checkOut, Number(hoursBetween(a.checkInExact||a.checkIn,a.checkOutExact||a.checkOut).toFixed(4))');
 html=html.replaceAll("checkInExact:r.check_in,checkOutExact:r.check_out,","payCheckIn:r.pay_check_in,payCheckOut:r.pay_check_out,checkInExact:r.check_in,checkOutExact:r.check_out,");
 html=html.replaceAll("date,check_in,check_out,confirmed'","date,check_in,check_out,confirmed,pay_check_in,pay_check_out'");
 once("confirmed:!!confirmed,...(r?{time_edited:true", "confirmed:false,...(r?{time_edited:true");
 once('date,check_in:checkIn,check_out:checkOut,confirmed:true','date,check_in:checkIn,check_out:checkOut,confirmed:false,pay_approval_required:true');
 once('수기로 출퇴근을 추가하고 확정했어요','수기로 출퇴근을 추가했어요. 급여 적용 시간을 30분 단위로 지정한 뒤 확인해 주세요.');
 once('수기 출퇴근 추가 (바로 확정)','수기 출퇴근 추가 (저장 후 시간 확인)');
 html=html.replaceAll('시간은 HH:MM 형식으로 입력해 주세요 (예: 09:30).','실제 출퇴근 시간을 확인해 주세요. 급여 적용 시간은 근무 확인에서 30분 단위로 지정해 주세요.');
 once("+s2Check('근무 확인 완료','confirmed',d.confirmed)+", "+'<p class=\"owner-note\">저장 후 근무 확인에서 급여 적용 시간을 지정해 주세요.</p>'+" );
 once("pay?s3Money(pay.net_pay):'미확정'", "pay?.needs_reconfirmation?'재확인 필요':pay?s3Money(pay.net_pay):'미확정'");
 once('  initializeSocialLogin();',readFileSync(new URL('../src/seven-updates.js',import.meta.url),'utf8')+'\n  initializeSocialLogin();');
 return html;
}
