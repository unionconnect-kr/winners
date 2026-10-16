import {makeToken} from './ios-qa-connection.mjs';
import {pathToFileURL} from 'node:url';
const origin='https://api.appstoreconnect.apple.com',app='6820833544';
const present=v=>typeof v==='string'&&v.trim().length>0;
const safeId=v=>{if(!/^[a-zA-Z0-9-]+$/.test(v||''))throw Error('RELEASE_AUDIT_INVALID_ID');return v;};
export async function auditRelease(env,{request=fetch,token=()=>makeToken(env)}={}){
 async function get(path){
  if(!path.startsWith('/v1/')||path.includes('://'))throw Error('RELEASE_AUDIT_INVALID_PATH');
  const response=await request(origin+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token(),Accept:'application/json'}});
  return response.ok?{status:response.status,...await response.json()}:{status:response.status};
 }
 const identity=await get('/v1/apps/'+app+'?fields%5Bapps%5D=bundleId,primaryLocale,contentRightsDeclaration,subscriptionStatusUrl,subscriptionStatusUrlForSandbox');
 if(identity.data?.id!==app||identity.data?.attributes?.bundleId!=='kr.co.manee.app')throw Error('RELEASE_AUDIT_WRONG_APP');
 const output={appId:app,checkedAt:new Date().toISOString(),app:{primaryLocale:identity.data.attributes.primaryLocale,contentRightsDeclaration:identity.data.attributes.contentRightsDeclaration,productionNotificationUrlPresent:present(identity.data.attributes.subscriptionStatusUrl),sandboxNotificationUrlPresent:present(identity.data.attributes.subscriptionStatusUrlForSandbox)},versions:[],appInfo:[],subscriptions:[],writesPerformed:false};
 const versions=await get('/v1/apps/'+app+'/appStoreVersions?filter%5Bplatform%5D=IOS&limit=5');
 output.versionsHttpStatus=versions.status;
 for(const row of (versions.data||[]).slice(0,5)){
  const id=safeId(row.id),a=row.attributes||{};
  const result={id,version:a.versionString,state:a.appStoreState,releaseType:a.releaseType,copyrightPresent:present(a.copyright),localizations:[]};
  const build=await get('/v1/appStoreVersions/'+id+'/build');
  result.build={httpStatus:build.status,version:build.data?.attributes?.version,processingState:build.data?.attributes?.processingState};
  const review=await get('/v1/appStoreVersions/'+id+'/appStoreReviewDetail');
  result.review={httpStatus:review.status,demoAccountRequired:review.data?.attributes?.demoAccountRequired,usernamePresent:present(review.data?.attributes?.demoAccountName),passwordPresent:present(review.data?.attributes?.demoAccountPassword),notesPresent:present(review.data?.attributes?.notes),contactPresent:present(review.data?.attributes?.contactEmail)};
  const locales=await get('/v1/appStoreVersions/'+id+'/appStoreVersionLocalizations?limit=50');
  for(const locale of (locales.data||[]).slice(0,10)){
   const l=locale.attributes||{},sets=await get('/v1/appStoreVersionLocalizations/'+safeId(locale.id)+'/appScreenshotSets?include=appScreenshots&limit=50');
   result.localizations.push({id:locale.id,locale:l.locale,descriptionPresent:present(l.description),keywordsPresent:present(l.keywords),supportUrl:l.supportUrl,marketingUrl:l.marketingUrl,outdatedTrialCopy:/40\s*(일|days)/i.test(l.description||''),screenshotHttpStatus:sets.status,screenshotSets:(sets.data||[]).map(set=>({id:set.id,displayType:set.attributes?.screenshotDisplayType,count:(set.relationships?.appScreenshots?.data||[]).length})),screenshotStates:(sets.included||[]).filter(x=>x.type==='appScreenshots').map(x=>({state:x.attributes?.assetDeliveryState?.state,fileSize:x.attributes?.fileSize}))});
  }
  output.versions.push(result);
 }
 const infos=await get('/v1/apps/'+app+'/appInfos?limit=10');
 for(const info of (infos.data||[]).slice(0,5)){
  const locales=await get('/v1/appInfos/'+safeId(info.id)+'/appInfoLocalizations?limit=50');
  output.appInfo.push({id:info.id,state:info.attributes?.appStoreState,localizations:(locales.data||[]).map(x=>({locale:x.attributes?.locale,name:x.attributes?.name,privacyPolicyUrl:x.attributes?.privacyPolicyUrl}))});
 }
 const catalog=await get('/v1/apps/'+app+'/subscriptionGroups?include=subscriptions&limit=50');
 output.catalogHttpStatus=catalog.status;output.groupCount=catalog.data?.length||0;
 for(const sub of (catalog.included||[]).filter(x=>x.type==='subscriptions').slice(0,10)){
  const id=safeId(sub.id),a=sub.attributes||{};
  const locales=await get('/v1/subscriptions/'+id+'/subscriptionLocalizations?limit=50');
  const offers=await get('/v1/subscriptions/'+id+'/introductoryOffers?filter%5Bterritory%5D=KOR&include=territory&limit=200');
  const prices=await get('/v1/subscriptions/'+id+'/prices?filter%5Bterritory%5D=KOR&include=subscriptionPricePoint,territory&limit=200');
  const screenshot=await get('/v1/subscriptions/'+id+'/appStoreReviewScreenshot');
  output.subscriptions.push({id,productId:a.productId,state:a.state,period:a.subscriptionPeriod,familySharable:a.familySharable,reviewNotePresent:present(a.reviewNote),localizations:(locales.data||[]).map(x=>({id:x.id,locale:x.attributes?.locale,name:x.attributes?.name,descriptionPresent:present(x.attributes?.description)})),offersHttpStatus:offers.status,koreanOffers:(offers.data||[]).filter(x=>x.relationships?.territory?.data?.id==='KOR').map(x=>({id:x.id,offerMode:x.attributes?.offerMode,duration:x.attributes?.duration,numberOfPeriods:x.attributes?.numberOfPeriods,startDate:x.attributes?.startDate,endDate:x.attributes?.endDate})),offersTruncated:!!offers.links?.next,pricesHttpStatus:prices.status,koreanPrices:(prices.data||[]).map(x=>({startDate:x.attributes?.startDate,preserved:x.attributes?.preserved,pricePointId:x.relationships?.subscriptionPricePoint?.data?.id})),pricePoints:(prices.included||[]).filter(x=>x.type==='subscriptionPricePoints').map(x=>({id:x.id,customerPrice:x.attributes?.customerPrice})),reviewScreenshot:{httpStatus:screenshot.status,present:!!screenshot.data,state:screenshot.data?.attributes?.assetDeliveryState?.state}});
 }
 const groups=await get('/v1/apps/'+app+'/betaGroups?limit=50');
 output.betaGroups=(groups.data||[]).map(x=>({id:x.id,name:x.attributes?.name,internal:x.attributes?.isInternalGroup}));
 output.contracts='Account-holder agreement status requires App Store Connect Business verification.';
 return output;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await auditRelease(process.env),null,2));}
 catch(e){console.error(/^RELEASE_AUDIT_[A-Z_]+$/.test(e.message)?e.message:'RELEASE_AUDIT_FAILED');process.exitCode=1;}
}
