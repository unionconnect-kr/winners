import Security
import UIKit
import Capacitor
import StoreKit
import AuthenticationServices
import CryptoKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

class ManeeBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        webView?.scrollView.alwaysBounceHorizontal = false
        webView?.scrollView.isDirectionalLockEnabled = true
        bridge?.registerPluginInstance(ManeeStoreKitPlugin())
        bridge?.registerPluginInstance(ManeeReportFilesPlugin())
        bridge?.registerPluginInstance(ManeeSecureAuthPlugin())
        bridge?.registerPluginInstance(ManeeAppleSignInPlugin())
    }
}

@objc(ManeeAppleSignInPlugin)
public class ManeeAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ManeeAppleSignInPlugin"
    public let jsName = "ManeeAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private var authorization: ManeeAppleAuthorization?

    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            guard authorization == nil, let window = bridge?.viewController?.viewIfLoaded?.window else {
                call.reject("Apple 로그인 화면을 열 수 없어요."); return
            }
            var randomBytes = [UInt8](repeating: 0, count: 32)
            let randomStatus = randomBytes.withUnsafeMutableBytes { bytes in
                guard let address = bytes.baseAddress else { return errSecParam }
                return SecRandomCopyBytes(kSecRandomDefault, bytes.count, address)
            }
            guard randomStatus == errSecSuccess else {
                call.reject("Apple 로그인을 시작하지 못했어요."); return
            }
            let nonce = randomBytes.map { String(format: "%02x", $0) }.joined()
            let flow = ManeeAppleAuthorization(window: window, nonce: nonce) { [weak self] token, message in
                self?.authorization = nil
                if let token { call.resolve(["identityToken": token, "nonce": nonce]) }
                else { call.reject(message ?? "Apple 로그인 정보를 확인하지 못했어요.") }
            }
            authorization = flow
            flow.start()
        }
    }
}

@MainActor
private final class ManeeAppleAuthorization: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let window: UIWindow
    private let nonce: String
    private let completion: (String?, String?) -> Void
    private var controller: ASAuthorizationController?

    init(window: UIWindow, nonce: String, completion: @escaping (String?, String?) -> Void) {
        self.window = window
        self.nonce = nonce
        self.completion = completion
    }

    func start() {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email]
        request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller
        controller.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { window }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.identityToken, let token = String(data: data, encoding: .utf8), !token.isEmpty else {
            completion(nil, nil)
            return
        }
        completion(token, nil)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        completion(nil, cancelled ? "Apple 로그인을 취소했어요." : "Apple 로그인을 완료하지 못했어요. 다시 시도해 주세요.")
    }
}

@objc(ManeeReportFilesPlugin)
public class ManeeReportFilesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ManeeReportFilesPlugin"
    public let jsName = "ManeeReportFiles"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)
    ]
    private var presentingReport = false

    @objc func save(_ call: CAPPluginCall) {
        guard let encoded = call.getString("data"), encoded.utf8.count <= 44_739_244,
              let data = Data(base64Encoded: encoded), !data.isEmpty, data.count <= 32 * 1024 * 1024,
              let filename = call.getString("filename"), !filename.isEmpty, filename.utf8.count <= 240,
              !filename.contains("/"), !filename.contains("\\"), !filename.contains(":"),
              filename.rangeOfCharacter(from: .controlCharacters) == nil,
              let mime = call.getString("mimeType"),
              (mime == "application/pdf" && filename.lowercased().hasSuffix(".pdf")) ||
              (mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" && filename.lowercased().hasSuffix(".xlsx")) ||
              (mime == "text/csv" && filename.lowercased().hasSuffix(".csv")) ||
              (mime == "image/png" && filename.lowercased().hasSuffix(".png")) ||
              (mime == "image/jpeg" && (filename.lowercased().hasSuffix(".jpg") || filename.lowercased().hasSuffix(".jpeg"))) else {
            call.reject("저장할 보고서 파일을 확인해 주세요."); return
        }
        DispatchQueue.main.async { [self] in
            guard !presentingReport, let controller = bridge?.viewController,
                  controller.viewIfLoaded?.window != nil, controller.presentedViewController == nil else {
                call.reject("열려 있는 창을 닫고 다시 저장해 주세요."); return
            }
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("manee-report-" + UUID().uuidString, isDirectory: true)
            let file = directory.appendingPathComponent(filename, isDirectory: false)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false,
                    attributes: [.protectionKey: FileProtectionType.complete])
                try data.write(to: file, options: [.atomic, .completeFileProtection])
            } catch {
                try? FileManager.default.removeItem(at: directory)
                call.reject("보고서 파일을 준비하지 못했어요. 저장 공간을 확인해 주세요."); return
            }
            presentingReport = true
            let activity = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            activity.completionWithItemsHandler = { [self] _, completed, _, error in
                try? FileManager.default.removeItem(at: directory)
                presentingReport = false
                if error != nil { call.reject("파일 저장·공유를 완료하지 못했어요.") }
                else { call.resolve(["status": completed ? "shared" : "cancelled"]) }
            }
            if let popover = activity.popoverPresentationController {
                popover.sourceView = controller.view
                popover.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            controller.present(activity, animated: true)
        }
    }
}

@objc(ManeeStoreKitPlugin)
public class ManeeStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ManeeStoreKitPlugin"
    public let jsName = "ManeeStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]
    private let productIds = Set((1...10).map { "manee.store\($0).monthly" })
    private var updates: Task<Void, Never>?

    public override func load() {
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self = self else { return }
                if case .verified(let transaction) = result, self.productIds.contains(transaction.productID) {
                    self.notifyListeners("transactionUpdated", data: ["transactionId": String(transaction.id)], retainUntilConsumed: true)
                }
            }
        }
    }
    deinit { updates?.cancel() }

    private func isTwoMonthTrial(_ offer: Product.SubscriptionOffer?) -> Bool {
        guard let offer else { return false }
        return offer.paymentMode == .freeTrial && offer.period.unit == .month && offer.period.value == 2
    }

    private func approvedProduct(_ product: Product) -> Bool {
        guard let subscription = product.subscription,
              subscription.subscriptionPeriod.unit == .month, subscription.subscriptionPeriod.value == 1,
              product.priceFormatStyle.currencyCode == "KRW", product.price == Decimal(9900),
              !product.isFamilyShareable else { return false }
        guard let offer = subscription.introductoryOffer else { return true }
        return product.id == "manee.store1.monthly" && isTwoMonthTrial(offer)
    }

    @objc func products(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), productIds.contains(productId) else {
            call.reject("매장 구독 상품을 확인해 주세요."); return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("상품을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."); return
                }
                var item: JSObject = ["id": product.id, "name": product.displayName, "price": product.displayPrice,
                    "monthly": product.subscription?.subscriptionPeriod.unit == .month && product.subscription?.subscriptionPeriod.value == 1,
                    "priceApproved": approvedProduct(product)]
                if let subscription = product.subscription {
                    let eligible = await subscription.isEligibleForIntroOffer
                    let offer = subscription.introductoryOffer
                    item["twoMonthsFree"] = product.id == "manee.store1.monthly" && eligible && isTwoMonthTrial(offer)
                }
                call.resolve(item)
            } catch { call.reject("상품 정보를 확인하지 못했어요.") }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), productIds.contains(productId) else {
            call.reject("매장 구독 상품을 확인해 주세요.", "storekit_not_started"); return
        }
        guard let value = call.getString("appAccountToken"), let account = UUID(uuidString: value) else {
            call.reject("매장 연결을 다시 확인해 주세요.", "storekit_not_started"); return
        }
        Task { @MainActor in
            var purchaseStarted = false
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("상품을 불러오지 못했어요.", "storekit_not_started"); return
                }
                guard approvedProduct(product) else {
                    call.reject("월 구독 상품과 요금을 확인해 주세요.", "storekit_not_started"); return
                }
                if call.getBool("twoMonthsFree") == true {
                    guard productId == "manee.store1.monthly", let subscription = product.subscription,
                          isTwoMonthTrial(subscription.introductoryOffer), await subscription.isEligibleForIntroOffer else {
                        call.reject("무료체험 대상이 변경됐어요. 구독 화면을 다시 열어 주세요.", "storekit_not_started")
                        return
                    }
                }
                purchaseStarted = true
                switch try await product.purchase(options: [.appAccountToken(account)]) {
                case .success(let result):
                    guard case .verified(let transaction) = result else {
                        call.reject("구매 검증에 실패했어요."); return
                    }
                    // Finish only after the server confirms the entitlement was saved.
                    call.resolve(["status": "purchased", "signedTransaction": result.jwsRepresentation, "transactionId": String(transaction.id), "productId": transaction.productID, "appAccountToken": transaction.appAccountToken?.uuidString.lowercased() ?? ""])
                case .userCancelled: call.resolve(["status": "cancelled"])
                case .pending: call.resolve(["status": "pending"])
                @unknown default: call.reject("구매 상태를 확인하지 못했어요.")
                }
            } catch {
                call.reject("구매를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
                            purchaseStarted ? nil : "storekit_not_started")
            }
        }
    }

    private func currentTransactions() async -> [JSObject] {
        var items: [String: JSObject] = [:]
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, productIds.contains(transaction.productID) {
                items[String(transaction.id)] = ["signedTransaction": result.jwsRepresentation, "transactionId": String(transaction.id), "productId": transaction.productID, "appAccountToken": transaction.appAccountToken?.uuidString.lowercased() ?? ""]
            }
        }
        for await result in Transaction.unfinished {
            if case .verified(let transaction) = result, productIds.contains(transaction.productID) {
                items[String(transaction.id)] = ["signedTransaction": result.jwsRepresentation, "transactionId": String(transaction.id), "productId": transaction.productID, "appAccountToken": transaction.appAccountToken?.uuidString.lowercased() ?? ""]
            }
        }
        return Array(items.values)
    }

    @objc func pending(_ call: CAPPluginCall) {
        Task { call.resolve(["transactions": await currentTransactions()]) }
    }
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                call.resolve(["transactions": await currentTransactions()])
            } catch { call.reject("구매 내역을 복원하지 못했어요.") }
        }
    }
    @objc func finish(_ call: CAPPluginCall) {
        guard let value = call.getString("transactionId"), let id = UInt64(value) else {
            call.reject("구매 내역을 확인하지 못했어요."); return
        }
        Task {
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, transaction.id == id, productIds.contains(transaction.productID) {
                    await transaction.finish()
                    call.resolve(); return
                }
            }
            call.resolve()
        }
    }
}


// Local auth storage only: never synchronize these secrets through iCloud.
@objc(ManeeSecureAuthPlugin)
public class ManeeSecureAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ManeeSecureAuthPlugin"
    public let jsName = "ManeeSecureAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]
    private let service = "kr.co.manee.secure-auth.v1"
    private static let lock = NSLock()
    private static var transient: [String:String] = [:]
    private var initialized = false
    private func prepare() throws {
        if initialized { return }
        let marker = "manee.secure-auth.installed.v1"
        if !UserDefaults.standard.bool(forKey: marker) {
            let status = SecItemDelete([kSecClass:kSecClassGenericPassword,kSecAttrService:service] as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw NSError(domain:"SecureAuth",code:1) }
            UserDefaults.standard.set(true,forKey:marker)
        }
        initialized = true
    }
    private func slot(_ call: CAPPluginCall) throws -> String {
        guard let key=call.getString("key"), key.range(of:"^(localStorage|sessionStorage):(sb-[a-z]{20}-auth-token(-code-verifier|-user)?|manee-[a-z]{20}-(auth(-code-verifier|-user)?|social-(code-verifier|pending)))$",options:.regularExpression) != nil else { throw NSError(domain:"SecureAuth",code:2) }
        return key
    }
    private func query(_ key:String) -> [CFString:Any] {
        return [kSecClass:kSecClassGenericPassword,kSecAttrService:service,kSecAttrAccount:key,kSecAttrSynchronizable:false]
    }
    @objc func get(_ call: CAPPluginCall) {
        Self.lock.lock(); defer { Self.lock.unlock() }
        do {
            try prepare(); let key=try slot(call)
            if key.hasPrefix("sessionStorage:") { call.resolve(["value":Self.transient[key] as Any? ?? NSNull()]); return }
            var q=query(key);q[kSecReturnData]=true;q[kSecMatchLimit]=kSecMatchLimitOne
            var result:CFTypeRef?;let status=SecItemCopyMatching(q as CFDictionary,&result)
            if status == errSecItemNotFound { call.resolve(["value":NSNull()]);return }
            guard status == errSecSuccess, let data=result as? Data, let value=String(data:data,encoding:.utf8) else { throw NSError(domain:"SecureAuth",code:3) }
            call.resolve(["value":value])
        } catch { call.reject("Secure auth storage unavailable") }
    }
    @objc func set(_ call: CAPPluginCall) {
        Self.lock.lock(); defer { Self.lock.unlock() }
        do {
            try prepare();let key=try slot(call)
            guard let value=call.getString("value"),let data=value.data(using:.utf8),data.count<=65536 else { throw NSError(domain:"SecureAuth",code:4) }
            if key.hasPrefix("sessionStorage:") { Self.transient[key]=value;call.resolve();return }
            let attributes:[CFString:Any]=[kSecValueData:data,kSecAttrAccessible:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
            var status=SecItemUpdate(query(key) as CFDictionary,attributes as CFDictionary)
            if status == errSecItemNotFound {var q=query(key);attributes.forEach{q[$0.key]=$0.value};status=SecItemAdd(q as CFDictionary,nil)}
            guard status == errSecSuccess else {throw NSError(domain:"SecureAuth",code:5)}
            call.resolve()
        } catch { call.reject("Secure auth storage unavailable") }
    }
    @objc func remove(_ call: CAPPluginCall) {
        Self.lock.lock(); defer { Self.lock.unlock() }
        do {
            try prepare();let key=try slot(call)
            if key.hasPrefix("sessionStorage:") { Self.transient.removeValue(forKey:key);call.resolve();return }
            let status=SecItemDelete(query(key) as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else {throw NSError(domain:"SecureAuth",code:6)}
            call.resolve()
        } catch { call.reject("Secure auth storage unavailable") }
    }
}
