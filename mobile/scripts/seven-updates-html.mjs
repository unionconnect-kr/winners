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
 once("+s2Check('근무 확인 완료','confirmed',d.confirmed)+", "+'<p class=\"owner-note\">저장 후 근무 확인에서 급여 적용 시간을 지정해 주세요.</p>'+" );
 once("pay?s3Money(pay.net_pay):'미확정'", "pay?.needs_reconfirmation?'재확인 필요':pay?s3Money(pay.net_pay):'미확정'");
 once('  initializeSocialLogin();',readFileSync(new URL('../src/seven-updates.js',import.meta.url),'utf8')+'\n  initializeSocialLogin();');
 return html;
}
