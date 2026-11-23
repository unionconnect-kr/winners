import {createPrivateKey,createPublicKey,diffieHellman,hkdfSync,createDecipheriv} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {makeToken} from '../mobile/scripts/check-apple-connection.mjs';

const app='6820833544',version='1.56',account='todtod07';
const branch='refs/heads/codex/ios-purchase-account-testflight-20261123';
const workflow=`unionconnect-kr/winners/.github/workflows/app-review-info.yml@${branch}`;
const origin='https://api.appstoreconnect.apple.com';
export function decryptReviewPayload(envelope,pem){
 if(envelope?.format!=='manee-review-info-v1'||typeof envelope.reviewId!=='string'||!/^[-a-zA-Z0-9]+$/.test(envelope.reviewId))throw Error('REVIEW_INVALID_ENVELOPE');
 const aad=Buffer.from(`manee-review-info:${app}:${version}:${envelope.reviewId}`);
 const privateKey=createPrivateKey(pem),publicKey=createPublicKey(Buffer.from(envelope.ephemeralPublicKey,'base64'));
 if(privateKey.asymmetricKeyType!=='ec'||publicKey.asymmetricKeyType!=='ec'||publicKey.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('REVIEW_INVALID_ENVELOPE');
 const salt=Buffer.from(envelope.salt,'base64'),iv=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64');
 if(salt.length!==32||iv.length!==12||tag.length!==16)throw Error('REVIEW_INVALID_ENVELOPE');
 const shared=diffieHellman({privateKey,publicKey});
 const key=Buffer.from(hkdfSync('sha256',shared,salt,aad,32));
 const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(aad);decipher.setAuthTag(tag);
 const clear=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);
 shared.fill(0);key.fill(0);
 try{return JSON.parse(clear.toString('utf8'));}finally{clear.fill(0);}
}
export async function reviewInfo(env,{request=fetch,token=()=>makeToken(env),envelope=null}={}){
 if(env.GITHUB_REPOSITORY!=='unionconnect-kr/winners'||env.GITHUB_REF!==branch||env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_WORKFLOW_REF!==workflow)throw Error('REVIEW_NOT_REQUESTED');
 async function api(path,body){
  const response=await request(origin+path,{method:body?'PATCH':'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token(),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error('REVIEW_HTTP_'+response.status);return await response.json();
 }
 const identity=await api('/v1/apps/'+app+'?fields%5Bapps%5D=bundleId');
 if(identity.data?.id!==app||identity.data.attributes?.bundleId!=='kr.co.manee.app')throw Error('REVIEW_WRONG_APP');
 const versions=await api('/v1/apps/'+app+'/appStoreVersions?filter%5Bplatform%5D=IOS&filter%5BversionString%5D='+version+'&limit=10');
 const matches=versions.data?.filter(v=>v.attributes?.versionString===version&&v.attributes?.platform==='IOS');
 if(matches?.length!==1||!/^[-a-zA-Z0-9]+$/.test(matches[0].id))throw Error('REVIEW_VERSION_UNAVAILABLE');
 const v=matches[0],detail=await api('/v1/appStoreVersions/'+v.id+'/appStoreReviewDetail');
 if(detail.data?.type!=='appStoreReviewDetails'||!/^[-a-zA-Z0-9]+$/.test(detail.data.id))throw Error('REVIEW_DETAIL_UNAVAILABLE');
 const id=detail.data.id,before=detail.data.attributes;
 if(before.demoAccountName!==account)throw Error('REVIEW_ACCOUNT_CHANGED');
 const result={appId:app,version,versionId:v.id,versionState:v.attributes.appStoreState||v.attributes.appVersionState,reviewId:id,demoAccountName:account,passwordPresent:typeof before.demoAccountPassword==='string'&&before.demoAccountPassword.length>0,notesLength:String(before.notes||'').length,contactPhonePresent:!!before.contactPhone,contactEmailPresent:!!before.contactEmail,reviewSubmitted:false,buildSelected:false};
 if(!envelope){
  const publicKey=createPublicKey(createPrivateKey(env.ASC_PRIVATE_KEY));
  return {...result,updated:false,encryptionPublicKey:publicKey.export({type:'spki',format:'pem'}).toString()};
 }
 if(envelope.reviewId!==id)throw Error('REVIEW_DETAIL_CHANGED');
 const payload=decryptReviewPayload(envelope,env.ASC_PRIVATE_KEY);
 if(payload.appId!==app||payload.version!==version||payload.reviewId!==id||payload.demoAccountName!==account||
   typeof payload.password!=='string'||payload.password.length<8||payload.password.length>72||
   typeof payload.notesAppend!=='string'||payload.notesAppend.length>2500)throw Error('REVIEW_INVALID_PAYLOAD');
 const marker='\n\nMANEE device verification update (2026-11-23)\n';
 let notes=String(before.notes||'').split(marker)[0];
 if(before.demoAccountPassword&&before.demoAccountPassword!==payload.password)notes=notes.replaceAll(before.demoAccountPassword,payload.password);
 notes+=marker+payload.notesAppend;
 if(notes.length>4000)throw Error('REVIEW_NOTES_TOO_LONG');
 const attrs={demoAccountName:account,demoAccountPassword:payload.password,demoAccountRequired:true,notes};
 await api('/v1/appStoreReviewDetails/'+id,{data:{type:'appStoreReviewDetails',id,attributes:attrs}});
 const after=await api('/v1/appStoreReviewDetails/'+id);
 if(after.data?.id!==id||after.data.attributes?.demoAccountName!==account||after.data.attributes?.demoAccountPassword!==payload.password||after.data.attributes?.notes!==notes||after.data.attributes?.demoAccountRequired!==true)throw Error('REVIEW_UPDATE_NOT_VERIFIED');
 return {...result,updated:true,passwordVerified:true,notesVerified:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const path=new URL('./review-details.enc.json',import.meta.url);
  const envelope=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
  console.log(JSON.stringify(await reviewInfo(process.env,{envelope})));
 }catch(error){console.error(/^REVIEW_[A-Z_]+(?:_\d{3})?$/.test(error.message)?error.message:'REVIEW_OPERATION_FAILED');process.exitCode=1;}
}
