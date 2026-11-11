import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {makeToken} from './check-apple-connection.mjs';

const appId = '6820833544';
const bundleId = 'kr.co.manee.app';
const capabilityType = 'APPLE_ID_AUTH';
const origin = 'https://api.appstoreconnect.apple.com';
const resourceId = value => {
  if (!/^[A-Za-z0-9-]+$/.test(value || '')) throw Error('Invalid Apple resource ID');
  return value;
};
const relationship = (type, id) => ({data: {type, id}});

async function appleRequest(path, data) {
  const response = await fetch(origin + path, {
    method: data ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + makeToken(process.env),
      Accept: 'application/json',
      ...(data ? {'Content-Type': 'application/json'} : {}),
    },
    body: data ? JSON.stringify({data}) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) {
    const code = result.errors?.[0]?.code;
    throw Error('App Store Connect HTTP ' + response.status + (/^[A-Z0-9._-]+$/.test(code || '') ? ' ' + code : ''));
  }
  return result.data;
}

async function prepareProfile(signingDir) {
  const app = await appleRequest('/v1/apps/' + appId + '?fields%5Bapps%5D=bundleId');
  if (app?.id !== appId || app.attributes?.bundleId !== bundleId) throw Error('Unexpected MANEE app identity');
  const bundles = await appleRequest('/v1/bundleIds?filter%5Bidentifier%5D=' + bundleId);
  const bundle = bundles.filter(row => row.attributes?.identifier === bundleId);
  if (bundle.length !== 1) throw Error('Could not identify the MANEE bundle ID');
  const bundleResourceId = resourceId(bundle[0].id);
  const capabilityPath = '/v1/bundleIds/' + bundleResourceId + '/bundleIdCapabilities';

  if (!(await appleRequest(capabilityPath)).some(row => row.attributes?.capabilityType === capabilityType)) {
    await appleRequest('/v1/bundleIdCapabilities', {
      type: 'bundleIdCapabilities',
      attributes: {
        capabilityType,
        settings: [{key: 'APPLE_ID_AUTH_APP_CONSENT', options: [{key: 'PRIMARY_APP_CONSENT', enabled: true}]}],
      },
      relationships: {bundleId: relationship('bundleIds', bundleResourceId)},
    });
  }
  if (!(await appleRequest(capabilityPath)).some(row => row.attributes?.capabilityType === capabilityType)) {
    throw Error('Apple sign-in capability is not available for the MANEE App ID');
  }
  console.log('MANEE App ID Apple sign-in capability verified.');

  const identities = readFileSync(resolve(signingDir, 'identities.txt'), 'utf8');
  const fingerprints = new Set([...identities.matchAll(/\b([0-9A-Fa-f]{40})\s+"Apple Distribution:/g)].map(match => match[1].toLowerCase()));
  const certificates = await appleRequest('/v1/certificates?filter%5BcertificateType%5D=DISTRIBUTION,IOS_DISTRIBUTION&limit=200');
  const matching = certificates.filter(row => {
    const {certificateContent, expirationDate} = row.attributes || {};
    return certificateContent && Date.parse(expirationDate) > Date.now() &&
      fingerprints.has(createHash('sha1').update(Buffer.from(certificateContent, 'base64')).digest('hex'));
  });
  if (matching.length !== 1) throw Error('No unique App Store certificate matches the existing MANEE signing key');
  const certId = resourceId(matching[0].id);
  const profileName = 'MANEE Apple Sign In ' + certId;
  const query = new URLSearchParams({'filter[name]': profileName, include: 'bundleId,certificates'});
  const profiles = await appleRequest('/v1/profiles?' + query);
  const existing = profiles.find(row =>
    row.attributes?.name === profileName && row.attributes.profileType === 'IOS_APP_STORE' &&
    row.attributes.profileState === 'ACTIVE' && Date.parse(row.attributes.expirationDate) > Date.now() &&
    row.relationships?.bundleId?.data?.id === bundleResourceId &&
    row.relationships?.certificates?.data?.some(cert => cert.id === certId)
  );
  const profile = existing || await appleRequest('/v1/profiles', {
    type: 'profiles',
    attributes: {name: profileName, profileType: 'IOS_APP_STORE'},
    relationships: {
      bundleId: relationship('bundleIds', bundleResourceId),
      certificates: {data: [{type: 'certificates', id: certId}]},
    },
  });
  const content = profile.attributes?.profileContent;
  if (!content || !/^[A-Za-z0-9+/=]+$/.test(content)) throw Error('Apple did not return a signing profile');
  writeFileSync(resolve(signingDir, 'profile.mobileprovision'), Buffer.from(content, 'base64'), {mode: 0o600});
  console.log('App Store profile prepared with the existing MANEE distribution certificate.');
}

try {
  await prepareProfile(process.argv[2]);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Apple profile preparation failed');
  process.exitCode = 1;
}
