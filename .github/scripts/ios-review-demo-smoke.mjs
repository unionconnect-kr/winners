import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { makeToken } from './ios-qa-connection.mjs';

const appId = '6820833544';
const version = '1.56';
const versionId = '87063b6a-6afc-4384-a766-c493dbbcca1f';
const primaryStore = '매니 심사 전용 가상매장';
const storeNames = new Set([primaryStore, '매니 결제검증 전용 가상매장 2', '매니 결제검증 전용 가상매장 3']);
const fixtureSalt = ':manee-ios-review-9b643815af2147b5bc2e9ae910755f62';
const fixtureFingerprint = '34749ead8b5aa1a59ec9b1ce14f48fa8e939cb8245f1d00bcef90299a5d4cfb5';
const supabaseUrl = 'https://bhwuuxcrzxespkjlmqxr.supabase.co';
const billingUrl = 'https://winners-staffapp.netlify.app/.netlify/functions/ios-billing';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const checks = {
  reviewRecordMatched: false,
  demoOwnerMatched: false,
  demoOwnerLogin: false,
  syntheticStoresOnly: false,
  expiredWriteGate: false,
  checkoutAvailable: false,
  expiredSandboxReceipt: false,
  noActiveSubscription: false,
  qaSessionRevoked: false,
};

function requireCheck(condition) {
  if (!condition) throw new Error('Review smoke check failed');
}

async function request(url, options) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(25_000) });
  requireCheck(response.ok);
  return response;
}

function post(url, headers, body) {
  return request(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function run() {
  let accessToken;
  let stage = 'runner_scope';
  let failureStage;
  const { production } = JSON.parse(readFileSync(new URL('../../config/environments.json', import.meta.url), 'utf8'));
  const authHeaders = { apikey: production.publishableKey };
  try {
    requireCheck(process.env.GITHUB_REPOSITORY === 'unionconnect-kr/winners' &&
      process.env.GITHUB_REF === 'refs/heads/codex/ios-review-demo-smoke-20261109' &&
      process.env.GITHUB_EVENT_NAME === 'push' && production.supabaseUrl === supabaseUrl);

    stage = 'apple_review_record';
    const appleHeaders = { Authorization: `Bearer ${makeToken(process.env)}`, Accept: 'application/json' };
    const apple = async path => (await request(`https://api.appstoreconnect.apple.com${path}`, { headers: appleHeaders })).json();
    const app = await apple(`/v1/apps/${appId}?fields%5Bapps%5D=bundleId`);
    requireCheck(app.data?.id === appId && app.data.attributes?.bundleId === 'kr.co.manee.app');
    const versions = await apple(`/v1/apps/${appId}/appStoreVersions?filter%5Bplatform%5D=IOS&limit=50`);
    const matches = versions.data.filter(item => item.attributes?.versionString === version);
    requireCheck(matches.length === 1 && matches[0].id === versionId);
    const review = await apple(`/v1/appStoreVersions/${versionId}/appStoreReviewDetail`);
    const { demoAccountRequired, demoAccountName, demoAccountPassword } = review.data.attributes;
    requireCheck(demoAccountRequired === true && typeof demoAccountName === 'string' &&
      typeof demoAccountPassword === 'string' && demoAccountPassword.length > 0);
    checks.reviewRecordMatched = true;

    stage = 'demo_owner_match';
    const username = demoAccountName.normalize('NFKC').trim().toLowerCase();
    requireCheck(createHash('sha256').update(username + fixtureSalt).digest('hex') === fixtureFingerprint);
    checks.demoOwnerMatched = true;

    stage = 'demo_owner_login';
    const login = await (await post(`${supabaseUrl}/functions/v1/manee-login`, authHeaders, {
      username: demoAccountName, password: demoAccountPassword, role: 'owner',
    })).json();
    accessToken = login.session?.access_token;
    requireCheck(login.ok === true && uuid.test(login.user?.id || '') && typeof accessToken === 'string' && accessToken.length > 0);
    checks.demoOwnerLogin = true;

    stage = 'synthetic_store_scope';
    const userHeaders = { ...authHeaders, Authorization: `Bearer ${accessToken}` };
    const rpc = async (name, body) => (await post(`${supabaseUrl}/rest/v1/rpc/${name}`, userHeaders, body)).json();
    const session = await rpc('manee_staff_portal', { p_action: 'session', p_payload: {} });
    const memberships = session.memberships;
    requireCheck(session.ok === true && session.profile?.user_id === login.user.id &&
      Array.isArray(memberships) && memberships.length === storeNames.size &&
      new Set(memberships.map(member => member.store_name)).size === storeNames.size &&
      new Set(memberships.map(member => member.store_id)).size === storeNames.size &&
      memberships.every(member => storeNames.has(member.store_name) && member.role === 'owner' &&
        uuid.test(member.store_id || '') && member.onboarding_done === true));
    checks.syntheticStoresOnly = true;

    stage = 'expired_store_write_gate';
    const gates = await Promise.all(memberships.map(member => rpc('manee_store_billing_access', { p_store_id: member.store_id })));
    requireCheck(gates.every(gate => gate.enforced === true && gate.canWrite === false));
    checks.expiredWriteGate = true;

    stage = 'checkout_status';
    const { store_id: storeId } = memberships.find(member => member.store_name === primaryStore);
    const billing = await (await post(billingUrl, { Authorization: userHeaders.Authorization }, { action: 'status', storeId })).json();
    requireCheck(billing.ready === true && billing.billingScope === 'account' && billing.productId === 'manee.store1.monthly' &&
      billing.otherPlatformActive === false && billing.otherStoreSubscribed === false);
    checks.checkoutAvailable = true;
    requireCheck(Array.isArray(billing.subscriptions));
    checks.noActiveSubscription = billing.subscriptions.every(item => item.active === false && item.testActive === false);
    checks.expiredSandboxReceipt = billing.subscriptions.some(item => item.environment === 'Sandbox' && item.status === 2 &&
      Date.parse(item.expiresAt) < Date.now());
    requireCheck(checks.noActiveSubscription && checks.expiredSandboxReceipt);
  } catch {
    failureStage = stage;
  } finally {
    if (typeof accessToken === 'string' && accessToken.length > 0) {
      try {
        await request(`${supabaseUrl}/auth/v1/logout?scope=local`, {
          method: 'POST', headers: { ...authHeaders, Authorization: `Bearer ${accessToken}` },
        });
        checks.qaSessionRevoked = true;
      } catch {
        failureStage ||= 'local_session_revocation';
      }
    }
  }
  console.log(JSON.stringify({ ...checks, ...(failureStage ? { failureStage } : {}) }));
  if (failureStage) process.exitCode = 1;
}

run().catch(() => {
  console.log(JSON.stringify({ ...checks, failureStage: 'runner_startup' }));
  process.exitCode = 1;
});
