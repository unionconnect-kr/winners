import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {seedPage} from './ios-page-fixtures.mjs';

const htmlPath = new URL('../www/index.html', import.meta.url);
const securePath = new URL('../www/secure-auth.js', import.meta.url);
const configPath = new URL('../capacitor.config.json', import.meta.url);
const bridgePath = new URL('../ios/App/App/AppDelegate.swift', import.meta.url);
const info = JSON.parse(readFileSync(new URL('../www/build-info.json', import.meta.url), 'utf8'));
assert.equal(info.platform, 'ios');
assert.equal(info.environment, 'production');
assert.equal(info.releaseVersion, '1.56');

function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, 'Expected exactly one capture preparation anchor: ' + before);
  return text.replace(before, () => after);
}

// These are existing offline fixtures, applied only to the Simulator's local WebView.
const fixture = seedPage.toString()
  .replaceAll('매니 테스트점', '매니 데모점')
  .replaceAll('테스트 사용자', '데모 사장님')
  .replaceAll('테스트 직원', '홀 직원')
  .replaceAll('01012345678', '')
  .replaceAll('예약 테스트', '저녁 예약')
  .replaceAll('테스트 지출', '식자재 구매');

const startup = `if (window.maneeStoreCaptureScene) {
    const seedCapturePage = ${fixture};
    window.qa = {state, todayKey, monthKey, bizToday, r138RecentDays, sector3, sector4, r136};
    seedCapturePage();
    state.ownerWork.lastStartAt = Date.now();
    state.ownerReportHomeNotices = {userId: state.authProfile.user_id, rows: [], checkedAt: Date.now(), loading: false};
    const scenes = {
      '01-home': {section: 'dashboard', expected: '사장님, 반가워요'},
      '02-schedule': {section: 'schedule', scheduleTab: 'calendar', expected: '스케줄'},
      '03-sales': {section: 'sales', salesSectionTab: 'sales', expected: '매출현황'},
      '04-expenses': {section: 'sales', salesSectionTab: 'expenses', expected: '지출 합계'},
      '05-operations': {section: 'checklist', expected: '체크리스트'},
      '06-report': {section: 'sales', salesSectionTab: 'report', expected: '월간 리포트'},
      '07-subscription': {section: 'more', expected: '2개월 무료체험 후 월 ₩9,900 구독', subscription: true}
    };
    const selected = scenes[window.maneeStoreCaptureScene];
    if (!selected) throw Error('Unknown iOS store capture scene');
    Object.assign(state, selected);
    render();
    if (selected.subscription) {
      const nativePromise = window.Capacitor.nativePromise.bind(window.Capacitor);
      window.Capacitor.nativePromise = (plugin, method, options) => {
        if (plugin !== 'ManeeStoreKit') return nativePromise(plugin, method, options);
        if (method !== 'products' || options.productId !== 'manee.store1.monthly') {
          return Promise.reject(Error('The offline screenshot cannot access purchases'));
        }
        return Promise.resolve({id: options.productId, price: '₩9,900', monthly: true, priceApproved: true, twoMonthsFree: true});
      };
      window.fetch = async (input, options) => {
        const statusRequest = new URL(input).pathname === '/.netlify/functions/ios-billing'
          && JSON.parse(options.body).action === 'status';
        if (!statusRequest) throw Error('The offline screenshot cannot access the network');
        return new Response(JSON.stringify({
          ready: true, productId: 'manee.store1.monthly', appAccountToken: '00000000-0000-4000-8000-000000000001', subscriptions: []
        }), {headers: {'Content-Type': 'application/json'}});
      };
      const userId = state.authProfile.user_id;
      const fixtureDb = {auth: {getSession: async () => ({
        data: {session: {user: {id: userId}, access_token: 'offline-capture-fixture'}}
      })}};
      window.MANEE_NATIVE.configure(() => ({db: fixtureDb, storeId: 's', userId, storeName: state.store, role: state.role}));
      await window.MANEE_NATIVE.openSettings();
    }
    await document.fonts.ready;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const main = selected.subscription ? document.querySelector('#manee-ios-billing') : app.querySelector('main');
      if (!main?.innerText.includes(selected.expected) || !app.querySelector('.bottom-nav')) {
        throw Error('Simulator capture did not render its expected app screen');
      }
      window.webkit.messageHandlers.maneeStoreCaptureReady.postMessage(window.maneeStoreCaptureScene);
    }));
  } else {
    initializeSocialLogin();
  }`;
let html = readFileSync(htmlPath, 'utf8');
// App captures use the shipped UI and OS fonts without external font requests.
html = html.replaceAll(/<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\n?/g, '');
html = replaceOnce(html, '<head>', '<head><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'">');
html = replaceOnce(html, '  initializeSocialLogin();', '  ' + startup);
writeFileSync(htmlPath, html);

// The Simulator demo contains no user credentials or secure storage.
const secureBootstrap = `if (window.maneeStoreCaptureScene) {
  const nativePromise = window.Capacitor.nativePromise.bind(window.Capacitor);
  window.Capacitor.nativePromise = (plugin, method, options) => {
    if (plugin !== 'ManeeSecureAuth') return nativePromise(plugin, method, options);
    if (method !== 'get') return Promise.reject(Error('Offline capture has no account secrets'));
    return Promise.resolve({value: null});
  };
}
`;
writeFileSync(securePath, secureBootstrap + readFileSync(securePath, 'utf8'));

const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.plugins.CapacitorHttp.enabled = false;
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

const bridge = readFileSync(bridgePath, 'utf8');
const header = `import StoreKit
#if targetEnvironment(simulator)
import WebKit

private final class ManeeStoreCaptureReady: NSObject, WKScriptMessageHandler {
    private let scene: String

    init(scene: String) {
        self.scene = scene
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, (message.body as? String) == scene else { return }
        let marker = FileManager.default.temporaryDirectory.appendingPathComponent("manee-store-capture-ready.txt")
        try? scene.write(to: marker, atomically: true, encoding: .utf8)
    }
}
#endif`;
const capture = `    override func capacitorDidLoad() {
        #if targetEnvironment(simulator)
        if let scene = ProcessInfo.processInfo.environment["MANEE_STORE_CAPTURE_SCENE"],
           scene.range(of: "^[0-9]{2}-[a-z]+$", options: .regularExpression) != nil,
           let controller = webView?.configuration.userContentController {
            let script = WKUserScript(source: "window.maneeStoreCaptureScene = '" + scene + "';",
                                      injectionTime: .atDocumentStart, forMainFrameOnly: true)
            controller.addUserScript(script)
            controller.add(ManeeStoreCaptureReady(scene: scene), name: "maneeStoreCaptureReady")
            let phase = FileManager.default.temporaryDirectory.appendingPathComponent("manee-store-capture-native.txt")
            try? ("capacitorDidLoad " + scene).write(to: phase, atomically: true, encoding: .utf8)
            DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
                self?.webView?.evaluateJavaScript("JSON.stringify({url: location.href, state: document.readyState, scene: window.maneeStoreCaptureScene, body: (document.body?.innerText || '').slice(0, 160)})") { result, error in
                    let diagnostics = String(describing: result ?? "") + " " + String(describing: error)
                    try? diagnostics.write(to: phase, atomically: true, encoding: .utf8)
                }
            }
        }
        #endif`;
writeFileSync(bridgePath, replaceOnce(replaceOnce(bridge, 'import StoreKit', header),
  '    override func capacitorDidLoad() {', capture));
console.log('Prepared offline iOS Simulator screenshot fixtures only.');
