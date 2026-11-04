import UIKit
import Capacitor
import StoreKit

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
        bridge?.registerPluginInstance(ManeeStoreKitPlugin())
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
    private let productId = "manee.store1.monthly"
    private var updates: Task<Void, Never>?

    public override func load() {
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self = self else { return }
                if case .verified(let transaction) = result, transaction.productID == self.productId {
                    self.notifyListeners("transactionUpdated", data: ["transactionId": String(transaction.id)], retainUntilConsumed: true)
                }
            }
        }
    }
    deinit { updates?.cancel() }

    @objc func products(_ call: CAPPluginCall) {
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("상품을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."); return
                }
                var item: JSObject = ["id": product.id, "name": product.displayName, "price": product.displayPrice]
                if let subscription = product.subscription {
                    let eligible = await subscription.isEligibleForIntroOffer
                    let offer = subscription.introductoryOffer
                    item["oneMonthFree"] = eligible && offer?.paymentMode == .freeTrial && offer?.period.unit == .month && offer?.period.value == 1
                }
                call.resolve(item)
            } catch { call.reject("상품 정보를 확인하지 못했어요.") }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let value = call.getString("appAccountToken"), let account = UUID(uuidString: value) else {
            call.reject("매장 연결을 다시 확인해 주세요."); return
        }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("상품을 불러오지 못했어요."); return
                }
                switch try await product.purchase(options: [.appAccountToken(account)]) {
                case .success(let result):
                    guard case .verified(let transaction) = result else {
                        call.reject("구매 검증에 실패했어요."); return
                    }
                    // Finish only after the server confirms the entitlement was saved.
                    call.resolve(["status": "purchased", "signedTransaction": result.jwsRepresentation, "transactionId": String(transaction.id)])
                case .userCancelled: call.resolve(["status": "cancelled"])
                case .pending: call.resolve(["status": "pending"])
                @unknown default: call.reject("구매 상태를 확인하지 못했어요.")
                }
            } catch { call.reject("구매를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.") }
        }
    }

    private func currentTransactions() async -> [JSObject] {
        var items: [String: JSObject] = [:]
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.productID == productId {
                items[String(transaction.id)] = ["signedTransaction": result.jwsRepresentation, "transactionId": String(transaction.id)]
            }
        }
        for await result in Transaction.unfinished {
            if case .verified(let transaction) = result, transaction.productID == productId {
                items[String(transaction.id)] = ["signedTransaction": result.jwsRepresentation, "transactionId": String(transaction.id)]
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
                if case .verified(let transaction) = result, transaction.id == id, transaction.productID == productId {
                    await transaction.finish()
                    call.resolve(); return
                }
            }
            call.resolve()
        }
    }
}
