import {pathToFileURL} from 'node:url';
import {makeToken} from './ios-qa-connection.mjs';

const app = '6820833544';
const subscription = '6820834755';
const product = 'manee.store1.monthly';
const date = '2026-11-09';
const ends = '2026-11-10';
const starts = '2026-11-11';
const branch = 'refs/heads/codex/ios-korea-intro-2m-20261109';
const workflow = 'unionconnect-kr/winners/.github/workflows/ios-kor-intro-offer.yml@' + branch;
const offerPath = '/v1/subscriptions/' + subscription + '/introductoryOffers?filter%5Bterritory%5D=KOR&include=territory&limit=200';
const previousOffer = 'eyJzIjoiNjgyMDgzNDc1NSIsImQiOjE3OTE1MjkyMDAsImkiOiJLUiIsInQiOiIiLCJwIjoiMCJ9';
const territory = item => item.relationships?.territory?.data?.id;
const requireState = (condition, reason) => { if (!condition) throw Error('KOR_OFFER_' + reason); };

export async function alignIntroOffer(env, {
  request = fetch, token = () => makeToken(env), now = new Date(),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  requireState(env.GITHUB_REPOSITORY === 'unionconnect-kr/winners' && env.GITHUB_REF === branch &&
    env.GITHUB_WORKFLOW_REF === workflow && env.GITHUB_EVENT_NAME === 'push' &&
    env.MANEE_KOR_INTRO_OFFER === '20261109-free-trial-two-months', 'UNAUTHORIZED_CONTEXT');
  async function api(path, body, method = body ? 'POST' : 'GET') {
    const response = await request('https://api.appstoreconnect.apple.com' + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: {Authorization: 'Bearer ' + token(), Accept: 'application/json', ...(body && {'Content-Type':'application/json'})},
      ...(body && {body: JSON.stringify(body)}),
    }).catch(error => {
      const cause = error.cause?.code ?? error.cause?.name ?? error.name;
      if (typeof cause === 'string' && /^[A-Z0-9_]{1,48}$/i.test(cause)) {
        console.error('App Store Connect request error:',method,cause);
      }
      throw Error('KOR_OFFER_TRANSPORT_' + method);
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const code = data.errors?.[0]?.code;
      const safeCode = typeof code === 'string' && /^[A-Z0-9_.]{1,80}$/.test(code) ? '_' + code.replaceAll('.', '_') : '';
      if (body && response.status === 409 && typeof data.errors?.[0]?.detail === 'string') {
        const detail = data.errors[0].detail.replace(/[^a-zA-Z0-9 .,:;()'/-]/g,' ').replace(/[a-zA-Z0-9]{24,}/g,'[redacted]').slice(0,400);
        console.error('App Store Connect offer conflict:', detail);
      }
      throw Error('KOR_OFFER_HTTP_' + response.status + safeCode);
    }
    // A successful write can have an empty body. Verify via the live catalog.
    if (method === 'GET') return response.json().catch(() => { throw Error('KOR_OFFER_INVALID_JSON'); });
  }

  const identity = await api('/v1/apps/' + app + '?fields%5Bapps%5D=bundleId');
  requireState(identity.data?.id === app && identity.data.attributes?.bundleId === 'kr.co.manee.app', 'WRONG_APP');
  const catalog = await api('/v1/apps/' + app + '/subscriptionGroups?include=subscriptions&limit=50');
  const entries = catalog.included?.filter(item => item.type === 'subscriptions' && item.attributes?.productId === product);
  const item = entries?.[0];
  requireState(entries?.length === 1 && item.id === subscription && item.attributes.subscriptionPeriod === 'ONE_MONTH' &&
    item.attributes.familySharable === false, 'WRONG_PRODUCT');

  const prices = await api('/v1/subscriptions/' + subscription + '/prices?filter%5Bterritory%5D=KOR&include=subscriptionPricePoint,territory&limit=200');
  const price = prices.data?.[0];
  const pointId = price?.relationships?.subscriptionPricePoint?.data?.id;
  requireState(!prices.links?.next && prices.data?.length === 1 && territory(price) === 'KOR' &&
    price.attributes?.startDate === null && price.attributes.preserved === false &&
    prices.included?.some(x => x.type === 'subscriptionPricePoints' && x.id === pointId && x.attributes?.customerPrice === '9900'), 'WRONG_PRICE');

  async function readOffers() {
    const result = await api(offerPath);
    requireState(!result.links?.next && Array.isArray(result.data) && result.data.every(x => territory(x) === 'KOR'), 'INCOMPLETE_OFFERS');
    return result.data;
  }
  function isDesired(offer) {
    const a = offer.attributes;
    return a?.offerMode === 'FREE_TRIAL' && a.duration === 'TWO_MONTHS' && a.numberOfPeriods === 1 && a.startDate === starts && !a.endDate;
  }
  function settled(offers) {
    const fromStart = offers.filter(x => !x.attributes?.endDate || x.attributes.endDate >= starts);
    return fromStart.length === 1 && isDesired(fromStart[0]);
  }
  function isPrevious(offer, end) {
    const a = offer?.attributes;
    return offer?.id === previousOffer && a?.offerMode === 'FREE_TRIAL' && a.duration === 'ONE_MONTH' &&
      a.numberOfPeriods === 1 && a.startDate === '2026-10-09' && (a.endDate ?? null) === end;
  }
  async function endPrevious(endDate) {
    await api('/v1/subscriptionIntroductoryOffers/' + previousOffer, {
      data:{type:'subscriptionIntroductoryOffers',id:previousOffer,attributes:{endDate}},
    }, 'PATCH');
    const offers = await readOffers();
    requireState(offers.some(offer => isPrevious(offer,endDate)),'END_DATE_NOT_VERIFIED');
  }
  const before = await readOffers();
  let changed = false;
  if (!settled(before)) {
    const beforeActive = before.filter(x => !x.attributes?.endDate || x.attributes.endDate >= date);
    requireState(now.toISOString().slice(0,10) === date, 'OUTSIDE_CHANGE_DATE');
    requireState(beforeActive.length === 1 && (isPrevious(beforeActive[0],null) || isPrevious(beforeActive[0],ends)), 'UNEXPECTED_CURRENT_OFFER');
    if (isPrevious(beforeActive[0],null)) await endPrevious(ends);

    try {
      await api('/v1/subscriptionIntroductoryOffers', {
        data: {
          type: 'subscriptionIntroductoryOffers',
          attributes: {startDate:starts, duration:'TWO_MONTHS', offerMode:'FREE_TRIAL', numberOfPeriods:1},
          relationships: {
            subscription: {data:{type:'subscriptions',id:subscription}},
            territory: {data:{type:'territories',id:'KOR'}},
          },
        },
      });
    } catch (error) {
      const current = await readOffers();
      if (!settled(current)) {
        // A network failure can still be processing. Compensate only on an
        // explicit Apple rejection and our unchanged one-offer state.
        if (!/^KOR_OFFER_HTTP_4\d\d/.test(error.message)) throw error;
        const active = current.filter(x => !x.attributes?.endDate || x.attributes.endDate >= date);
        requireState(active.length === 1 && isPrevious(active[0],ends),'ROLLBACK_UNCERTAIN');
        await endPrevious(null);
        throw error;
      }
    }
    changed = true;
    let offers = await readOffers();
    for (let attempt = 0; !settled(offers) && attempt < 4; attempt++) {
      await wait(3000);
      offers = await readOffers();
    }
    requireState(settled(offers), 'POST_NOT_VERIFIED');
  }
  return {app, product, territory:'KOR', duration:'TWO_MONTHS', offerMode:'FREE_TRIAL', startDate:starts, monthlyPriceKrw:9900, changed};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(await alignIntroOffer(process.env)));}
  catch (error) {
    console.error(/^KOR_OFFER_[A-Z0-9_]+$/.test(error.message) ? error.message : 'KOR_OFFER_FAILED');
    process.exitCode = 1;
  }
}
