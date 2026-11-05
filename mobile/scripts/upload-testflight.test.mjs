import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uploadTestFlight } from './upload-testflight.mjs';

const base = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
  GITHUB_REPOSITORY: 'unionconnect-kr/winners', MANEE_UPLOAD_TESTFLIGHT: 'true',
  ASC_KEY_ID: 'TESTKEY123', ASC_ISSUER_ID: 'test-issuer', ASC_PRIVATE_KEY: 'disposable-test-key' };

test('push, unapproved uploads and other branches cannot reach Apple', async () => {
  for (const overrides of [{GITHUB_EVENT_NAME:'push'}, {MANEE_UPLOAD_TESTFLIGHT:'false'},
    {GITHUB_REF:'refs/heads/another'}, {GITHUB_REPOSITORY:'other/repo'}]) {
    await assert.rejects(uploadTestFlight({...base,...overrides}, '/tmp/app.ipa', {
      check: () => assert.fail('Apple must not be contacted'), platform:'darwin',
    }), /UPLOAD_NOT_REQUESTED/);
  }
});

test('Apple validation precedes upload; private key and child environment are scoped and cleaned', async () => {
  const temp=mkdtempSync(join(tmpdir(),'manee-upload-test-'));
  try {
    for(const validationFails of [false,true]) {
      const calls=[];
      const promise=uploadTestFlight({...base,RUNNER_TEMP:temp}, '/tmp/app.ipa', {
        platform:'darwin', check:async()=>calls.push('identity'),
        run: (command,args,options) => {
          calls.push(args[1]);
          assert.equal(command,'xcrun');
          const key=join(options.cwd,'private_keys','AuthKey_TESTKEY123.p8');
          assert.equal(readFileSync(key,'utf8'),'disposable-test-key\n');
          assert.equal(statSync(key).mode & 0o777,0o600);
          assert.equal(options.env.ASC_PRIVATE_KEY,undefined);
          return {status:validationFails?1:0,stdout:'must never be logged'};
        },
      });
      if(validationFails) await assert.rejects(promise,/APPLE_IPA_VALIDATION_FAILED/);
      else assert.deepEqual(await promise,{uploaded:true,appId:'6820833544',processing:'pending',reviewSubmitted:false});
      assert.deepEqual(calls,validationFails?['identity','--validate-app']:['identity','--validate-app','--upload-app']);
      assert.deepEqual(readdirSync(temp),[]);
    }
  } finally { rmSync(temp,{recursive:true,force:true}); }
});

test('only the designated matching 1.43 workflow may upload the requested update', async()=>{
 const approved={...base,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/codex/mobile-launch-143-20261104',GITHUB_WORKFLOW_REF:'unionconnect-kr/winners/.github/workflows/mobile143.yml@refs/heads/codex/mobile-launch-143-20261104'};
 for(const overrides of [{GITHUB_WORKFLOW_REF:'other'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'pull_request'},{MANEE_UPLOAD_TESTFLIGHT:'false'}]){
  await assert.rejects(uploadTestFlight({...approved,...overrides},'/tmp/app.ipa',{platform:'darwin',check:()=>assert.fail('No Apple call')}),/UPLOAD_NOT_REQUESTED/);
 }
 const temp=mkdtempSync(join(tmpdir(),'manee143-upload-'));
 try{let checked=false;const result=await uploadTestFlight({...approved,RUNNER_TEMP:temp},'/tmp/app.ipa',{platform:'darwin',check:async()=>{checked=true;},run:()=>({status:0})});assert.equal(result.uploaded,true);assert.equal(checked,true);assert.deepEqual(readdirSync(temp),[]);}finally{rmSync(temp,{recursive:true,force:true});}
});

test('1.44 feedback upload is restricted to the exact requested branch and workflow',async()=>{
 const approved={...base,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/codex/mobile-feedback-144-20261104',GITHUB_WORKFLOW_REF:'unionconnect-kr/winners/.github/workflows/mobile144.yml@refs/heads/codex/mobile-feedback-144-20261104'};
 for(const overrides of [{GITHUB_WORKFLOW_REF:'other'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'pull_request'},{MANEE_UPLOAD_TESTFLIGHT:'false'}])await assert.rejects(uploadTestFlight({...approved,...overrides},'/tmp/app.ipa',{platform:'darwin',check:()=>assert.fail('No Apple call')}),/UPLOAD_NOT_REQUESTED/);
 const temp=mkdtempSync(join(tmpdir(),'manee144-upload-'));
 try{assert.equal((await uploadTestFlight({...approved,RUNNER_TEMP:temp},'/tmp/app.ipa',{platform:'darwin',check:async()=>{},run:()=>({status:0})})).uploaded,true);}finally{rmSync(temp,{recursive:true,force:true});}
});

test('1.48 password guidance upload is restricted to the exact requested branch and workflow',async()=>{
 const approved={...base,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/codex/mobile-release-148-20261105',GITHUB_WORKFLOW_REF:'unionconnect-kr/winners/.github/workflows/mobile148-release.yml@refs/heads/codex/mobile-release-148-20261105'};
 for(const overrides of [{GITHUB_WORKFLOW_REF:'other'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'pull_request'},{MANEE_UPLOAD_TESTFLIGHT:'false'}])await assert.rejects(uploadTestFlight({...approved,...overrides},'/tmp/app.ipa',{platform:'darwin',check:()=>assert.fail('No Apple call')}),/UPLOAD_NOT_REQUESTED/);
 const temp=mkdtempSync(join(tmpdir(),'manee148-upload-'));
 try{assert.equal((await uploadTestFlight({...approved,RUNNER_TEMP:temp},'/tmp/app.ipa',{platform:'darwin',check:async()=>{},run:()=>({status:0})})).uploaded,true);}finally{rmSync(temp,{recursive:true,force:true});}
});

test('1.49 password guidance upload is restricted to the exact requested branch and workflow',async()=>{
 const approved={...base,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/codex/mobile-release-149-20261105',GITHUB_WORKFLOW_REF:'unionconnect-kr/winners/.github/workflows/mobile149-release.yml@refs/heads/codex/mobile-release-149-20261105'};
 for(const overrides of [{GITHUB_WORKFLOW_REF:'other'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'pull_request'},{MANEE_UPLOAD_TESTFLIGHT:'false'}])await assert.rejects(uploadTestFlight({...approved,...overrides},'/tmp/app.ipa',{platform:'darwin',check:()=>assert.fail('No Apple call')}),/UPLOAD_NOT_REQUESTED/);
 const temp=mkdtempSync(join(tmpdir(),'manee149-upload-'));
 try{assert.equal((await uploadTestFlight({...approved,RUNNER_TEMP:temp},'/tmp/app.ipa',{platform:'darwin',check:async()=>{},run:()=>({status:0})})).uploaded,true);}finally{rmSync(temp,{recursive:true,force:true});}
});

test('1.50 password guidance upload is restricted to the exact requested branch and workflow',async()=>{
 const approved={...base,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/codex/mobile-release-150-20261105',GITHUB_WORKFLOW_REF:'unionconnect-kr/winners/.github/workflows/mobile150-release.yml@refs/heads/codex/mobile-release-150-20261105'};
 for(const overrides of [{GITHUB_WORKFLOW_REF:'other'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'pull_request'},{MANEE_UPLOAD_TESTFLIGHT:'false'}])await assert.rejects(uploadTestFlight({...approved,...overrides},'/tmp/app.ipa',{platform:'darwin',check:()=>assert.fail('No Apple call')}),/UPLOAD_NOT_REQUESTED/);
 const temp=mkdtempSync(join(tmpdir(),'manee150-upload-'));
 try{assert.equal((await uploadTestFlight({...approved,RUNNER_TEMP:temp},'/tmp/app.ipa',{platform:'darwin',check:async()=>{},run:()=>({status:0})})).uploaded,true);}finally{rmSync(temp,{recursive:true,force:true});}
});

test('1.52 final upload is restricted to the exact requested branch and workflow',async()=>{
 const branch='refs/heads/codex/final-email-billing-152-20261106';
 const approved={...base,GITHUB_EVENT_NAME:'push',GITHUB_REF:branch,GITHUB_WORKFLOW_REF:`unionconnect-kr/winners/.github/workflows/mobile152-release.yml@${branch}`};
 for(const overrides of [{GITHUB_WORKFLOW_REF:'other'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'pull_request'},{MANEE_UPLOAD_TESTFLIGHT:'false'}])await assert.rejects(uploadTestFlight({...approved,...overrides},'/tmp/app.ipa',{platform:'darwin',check:()=>assert.fail('No Apple call')}),/UPLOAD_NOT_REQUESTED/);
 const temp=mkdtempSync(join(tmpdir(),'manee152-upload-'));
 try{assert.equal((await uploadTestFlight({...approved,RUNNER_TEMP:temp},'/tmp/app.ipa',{platform:'darwin',check:async()=>{},run:()=>({status:0})})).uploaded,true);}finally{rmSync(temp,{recursive:true,force:true});}
});
