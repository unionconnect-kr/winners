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
