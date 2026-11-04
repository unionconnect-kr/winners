import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hardenUi} from '../../scripts/harden-ui.mjs';
import {adaptIos139} from './adapt-ios139.mjs';
import {secureAuthHtml} from './secure-auth-html.mjs';
test('1.42 retains the complete 1.41 UI before wrapping authentication storage',()=>{
 const source=readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8');
 const prior=hardenUi(adaptIos139(source,'android')).replaceAll('매니 1.39','매니 1.41').replaceAll('매니 1.40','매니 1.41');
 const next=secureAuthHtml(prior.replaceAll('매니 1.41','매니 1.42'));
 for(const fn of ['renderOwnerHome','renderOwnerPeople','renderOwnerSales','renderOwnerOperations','renderOwnerMore','renderStaffApp','bindSector3','bindSector4','verifyManeeEntryRole','validManeeNewPassword'])assert.ok(next.includes('function '+fn),fn);
 assert.match(next,/MANEE_SECURE_STORAGE.wrap\(maneeAuthStorage\)/);
 assert.match(next,/native.open\(url,context\)/);
 assert.match(next,/manee_android_push_context/);
 assert.doesNotMatch(next,/manee_ios_push_context|매니 1.41|window\[target\].setItem/);
});
test('archived Android bridge is pinned to the installed 1.39–1.41 bridge',()=>{
 const bridge=readFileSync(new URL('../release139/android-native.js',import.meta.url));
 assert.equal(createHash('sha256').update(bridge).digest('hex'),'a99b6ef582408bd28d5aa6c507982a25c2c7f7640b14f5195cfbeea97bce5440');
});
