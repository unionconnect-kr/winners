import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
const require=createRequire(import.meta.url);
const {normalizeReceiptImage}=require('../netlify/functions/lib/validated-image.cjs');
const {imageMatches}=require('../netlify/functions/lib/request-security.cjs');
const source=readFileSync(new URL('../netlify/functions/read-receipt.js',import.meta.url),'utf8');
const image=()=>sharp({create:{width:30,height:20,channels:4,background:{r:240,g:240,b:240,alpha:0.5}}});
test('JPEG, PNG and WebP are decoded and normalized without original metadata or appended content',async()=>{
 for(const format of ['jpeg','png','webp']){
  const input=await image().withExif({IFD0:{Artist:'PRIVATE-DEVICE-METADATA'}}).toFormat(format).toBuffer();
  const result=await normalizeReceiptImage(input.toString('base64'),'image/'+format);
  assert.equal(result.mediaType,'image/jpeg');const output=Buffer.from(result.base64Data,'base64'),meta=await sharp(output).metadata();
  assert.equal(meta.format,'jpeg');assert.equal(meta.width,30);assert.equal(meta.height,20);assert.equal(meta.exif,undefined);assert.equal(meta.icc,undefined);
  assert.equal(output.includes(Buffer.from('PRIVATE-DEVICE-METADATA')),false);
  assert.equal((await sharp(output).raw().toBuffer()).length,30*20*3);
 }
 const png=Buffer.concat([await image().png().toBuffer(),Buffer.from('PRIVATE-TRAILING-BYTES')]);
 const normalized=await normalizeReceiptImage(png.toString('base64'),'image/png');
 assert.equal(Buffer.from(normalized.base64Data,'base64').includes(Buffer.from('PRIVATE-TRAILING-BYTES')),false);
});
test('mislabelled, malformed, truncated, oversized and excessive-pixel images fail before provider use',async()=>{
 const png=await image().png().toBuffer();
 const fake=Buffer.concat([png.subarray(0,8),Buffer.alloc(40)]);
 const truncated=png.subarray(0,40);
 const huge=await sharp({create:{width:4001,height:4000,channels:3,background:'white'}}).png().toBuffer();
 for(const [input,mime] of [[fake,'image/png'],[truncated,'image/png'],[png,'image/jpeg'],[Buffer.from('<svg/>'),'image/png'],[huge,'image/png'],[Buffer.alloc(3*1024*1024+1),'image/png']]){
  await assert.rejects(normalizeReceiptImage(input.toString('base64'),mime));
 }
 assert.equal(imageMatches(fake.toString('base64'),'image/png'),true,'old signature check accepted this fake');
 await assert.rejects(normalizeReceiptImage('not base64','image/png'));
});
function handler(allowed=true){
 const calls=[];const exports={};
 vm.runInNewContext(source,{exports,AbortSignal,process:{env:{ANTHROPIC_API_KEY:'fixture-only'}},
 require:n=>n.includes('manee-environment')?{blockExternalService:()=>null}:n.includes('validated-image')?{normalizeReceiptImage:async(...args)=>{calls.push('decode');return normalizeReceiptImage(...args);}}:{
  reply:(statusCode,error)=>({statusCode,body:JSON.stringify({error})}),parseBody:e=>JSON.parse(e.body),authorize:async()=>{calls.push('authorize');return allowed?{}:{response:{statusCode:401}};}
 },fetch:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({content:[{type:'text',text:'{"totalSales":1000}'}]})};}});
 return {calls,run:body=>exports.handler({httpMethod:'POST',body:JSON.stringify(body)})};
}
test('handler authenticates before decoding, rejects a fake and only forwards normalized bytes',async()=>{
 const denied=handler(false);assert.equal((await denied.run({})).statusCode,401);assert.deepEqual(denied.calls,['authorize']);
 const input=await image().png().toBuffer(),body={base64Data:input.toString('base64'),mediaType:'image/png'};
 const fake=handler();assert.equal((await fake.run({...body,base64Data:input.subarray(0,40).toString('base64')})).statusCode,400);assert.deepEqual(fake.calls,['authorize','decode']);
 const valid=handler();const result=await valid.run(body);assert.equal(result.statusCode,200);assert.deepEqual(valid.calls.slice(0,2),['authorize','decode']);assert.equal(valid.calls.length,3);
 const sent=valid.calls[2].body.messages[0].content[0].source;assert.equal(sent.media_type,'image/jpeg');assert.notEqual(sent.data,body.base64Data);
 assert.equal((await sharp(Buffer.from(sent.data,'base64')).metadata()).format,'jpeg');
});
