'use strict';
// These are signed transaction display prices, not App Store Connect financial settlements.
function transactionRecord(t){
 const amount=Number.isSafeInteger(t.price)&&t.price>=0&&/^[A-Z]{3}$/.test(t.currency||'')?BigInt(t.price):null;
 const decimal=(n,scale)=>`${n/scale}.${(n%scale).toString().padStart(scale.toString().length-1,'0')}`;
 const revoked=Number.isSafeInteger(t.revocationDate);
 const type=t.revocationType;
 const status=!revoked?'paid':type==='REFUND_PRORATED'?'partial_refund':['FAMILY_REVOKE','ASSIGNMENT_REVOKE'].includes(type)?'revoked':'refunded';
 let refundAmount=revoked?null:'0';
 if(amount!==null&&revoked&&type==='REFUND_FULL')refundAmount=decimal(amount,1000n);
 if(amount!==null&&revoked&&type==='REFUND_PRORATED'&&Number.isInteger(t.revocationPercentage)&&t.revocationPercentage>=0&&t.revocationPercentage<=100000)refundAmount=decimal(amount*BigInt(t.revocationPercentage),100000000n);
 if(!Number.isSafeInteger(t.purchaseDate)||!Number.isSafeInteger(t.signedDate))throw Error('invalid_transaction_time');
 return {provider:'apple',environment:t.environment,transactionId:t.transactionId,binding:t.appAccountToken?.toLowerCase(),productId:t.productId,
  amount:amount===null?null:decimal(amount,1000n),currency:amount===null?null:t.currency,refundAmount,status,
  purchasedAt:new Date(t.purchaseDate).toISOString(),updatedAt:new Date(t.signedDate).toISOString(),refundAt:revoked?new Date(t.revocationDate).toISOString():null};
}
async function saveLedger(db,records){
 let ok=true;
 for(const record of records.filter(Boolean)){
  try{const result=await db.rpc('manee_hq_record_transaction',{p_record:record});if(result.error||result.data!==true)ok=false;}catch{ok=false;}
 }
 // A reporting failure must never reject a valid purchase or alter entitlement.
 try{await db.rpc('manee_hq_apple_ledger_health',{p_ok:ok});}catch{}
 return ok;
}
module.exports={transactionRecord,saveLedger};
