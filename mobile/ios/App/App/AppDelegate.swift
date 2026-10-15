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
        bridge?.registerPluginInstance(ManeeReportFilesPlugin())
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
              (mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" && filename.lowercased().hasSuffix(".xlsx")) else {
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
