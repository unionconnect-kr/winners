package kr.co.manee.app;

import com.android.billingclient.api.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Native purchase transport. Entitlements and acknowledgement belong to the server. */
@CapacitorPlugin(name = "ManeePlayBilling")
public class ManeePlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private PluginCall checkout;
    private String checkoutProduct;
    private boolean connecting;
    private final List<Runnable> connected = new ArrayList<>();
    private final List<PluginCall> waiting = new ArrayList<>();

    @Override public void load() {
        client = BillingClient.newBuilder(getContext()).setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection().build();
    }

    private void ready(PluginCall call, Runnable action) {
        getActivity().runOnUiThread(() -> {
            if (client.isReady()) { action.run(); return; }
            connected.add(action); waiting.add(call);
            if (connecting) return;
            connecting = true;
            client.startConnection(new BillingClientStateListener() {
                @Override public void onBillingSetupFinished(BillingResult result) {
                    getActivity().runOnUiThread(() -> {
                        connecting = false;
                        List<Runnable> actions = new ArrayList<>(connected);
                        List<PluginCall> calls = new ArrayList<>(waiting);
                        connected.clear(); waiting.clear();
                        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                            for (Runnable next : actions) next.run();
                        } else for (PluginCall pending : calls) fail(pending, result);
                    });
                }
                @Override public void onBillingServiceDisconnected() { /* automatic reconnect */ }
            });
        });
    }

    private void fail(PluginCall call, BillingResult result) {
        call.reject("Google Play 연결을 확인하지 못했어요. 다시 시도해 주세요.",
            "PLAY_" + result.getResponseCode());
    }
    private boolean validProduct(String id) { return id != null && id.matches("[a-z0-9][a-z0-9._]{0,149}"); }
    private interface ProductCallback { void accept(ProductDetails product); }
    private void queryProduct(PluginCall call, String id, ProductCallback callback) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(
            QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.SUBS).build())).build();
        client.queryProductDetailsAsync(params, (result, details) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail(call, result); return; }
            for (ProductDetails product : details.getProductDetailsList()) {
                if (id.equals(product.getProductId())) { callback.accept(product); return; }
            }
            call.reject("구독 상품이 아직 준비되지 않았어요.", "PRODUCT_UNAVAILABLE");
        });
    }

    @PluginMethod public void products(PluginCall call) {
        String id = call.getString("productId");
        if (!validProduct(id)) { call.reject("잘못된 구독 상품이에요.", "INVALID_PRODUCT"); return; }
        ready(call, () -> queryProduct(call, id, product -> {
            JSArray offers = new JSArray();
            if (product.getSubscriptionOfferDetails() != null) {
                for (ProductDetails.SubscriptionOfferDetails offer : product.getSubscriptionOfferDetails()) {
                    JSArray phases = new JSArray();
                    for (ProductDetails.PricingPhase phase : offer.getPricingPhases().getPricingPhaseList()) {
                        JSObject p = new JSObject();
                        p.put("price", phase.getFormattedPrice()); p.put("amountMicros", phase.getPriceAmountMicros());
                        p.put("currency", phase.getPriceCurrencyCode()); p.put("period", phase.getBillingPeriod());
                        p.put("cycles", phase.getBillingCycleCount()); p.put("recurrenceMode", phase.getRecurrenceMode());
                        phases.put(p);
                    }
                    JSObject o = new JSObject(); o.put("basePlanId", offer.getBasePlanId());
                    o.put("offerId", offer.getOfferId()); o.put("offerToken", offer.getOfferToken());
                    o.put("phases", phases); offers.put(o);
                }
            }
            JSObject item = new JSObject(); item.put("productId", product.getProductId());
            item.put("title", product.getName()); item.put("offers", offers);
            JSObject response = new JSObject(); response.put("products", new JSArray().put(item)); call.resolve(response);
        }));
    }

    @PluginMethod public void purchases(PluginCall call) {
        ready(call, () -> client.queryPurchasesAsync(QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS).build(), (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail(call, result); return; }
                JSObject response = new JSObject(); response.put("purchases", receipts(purchases)); call.resolve(response);
            }));
    }

    @PluginMethod public void purchase(PluginCall call) {
        String id = call.getString("productId"), offerToken = call.getString("offerToken");
        String accountId = call.getString("accountId"), profileId = call.getString("profileId");
        if (!validProduct(id) || offerToken == null || offerToken.isEmpty() || accountId == null ||
            profileId == null || !accountId.matches("[a-f0-9]{64}") || !profileId.matches("[a-f0-9]{64}")) {
            call.reject("구독 연결 정보를 다시 확인해 주세요.", "INVALID_PURCHASE"); return;
        }
        ready(call, () -> queryProduct(call, id, product -> getActivity().runOnUiThread(() -> {
            if (checkout != null) { call.reject("결제 처리 중이에요.", "PURCHASE_BUSY"); return; }
            boolean found = false;
            if (product.getSubscriptionOfferDetails() != null) for (ProductDetails.SubscriptionOfferDetails offer : product.getSubscriptionOfferDetails()) {
                if (offerToken.equals(offer.getOfferToken())) found = true;
            }
            if (!found) { call.reject("요금이 변경됐어요. 구독 요금을 다시 확인해 주세요.", "OFFER_CHANGED"); return; }
            checkout = call; checkoutProduct = id;
            BillingFlowParams params = BillingFlowParams.newBuilder().setObfuscatedAccountId(accountId)
                .setObfuscatedProfileId(profileId).setProductDetailsParamsList(Collections.singletonList(
                    BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product).setOfferToken(offerToken).build())).build();
            BillingResult result = client.launchBillingFlow(getActivity(), params);
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                checkout = null; checkoutProduct = null; fail(call, result);
            }
        })));
    }

    private JSArray receipts(List<Purchase> purchases) {
        JSArray result = new JSArray();
        if (purchases == null) return result;
        for (Purchase purchase : purchases) {
            JSObject item = new JSObject();
            item.put("purchaseToken", purchase.getPurchaseToken());
            item.put("productIds", new JSArray(purchase.getProducts()));
            item.put("state", purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased" :
                purchase.getPurchaseState() == Purchase.PurchaseState.PENDING ? "pending" : "unknown");
            item.put("acknowledged", purchase.isAcknowledged()); result.put(item);
        }
        return result;
    }

    @Override public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        getActivity().runOnUiThread(() -> {
            JSObject update = new JSObject(); update.put("purchases", receipts(purchases));
            notifyListeners("purchasesUpdated", update);
            if (checkout == null) return;
            PluginCall call = checkout;
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                List<Purchase> relevant = new ArrayList<>(); boolean paid = false;
                if (purchases != null) for (Purchase p : purchases) if (p.getProducts().contains(checkoutProduct)) {
                    relevant.add(p); paid |= p.getPurchaseState() == Purchase.PurchaseState.PURCHASED;
                }
                if (relevant.isEmpty()) return; // An unrelated subscription update is not this checkout.
                checkout = null; checkoutProduct = null;
                JSObject response = new JSObject(); response.put("status", paid ? "purchased" : "pending");
                response.put("purchases", receipts(relevant)); call.resolve(response);
            } else {
                checkout = null; checkoutProduct = null;
                if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
                    JSObject response = new JSObject(); response.put("status", "cancelled"); call.resolve(response);
                } else fail(call, result);
            }
        });
    }

    @Override protected void handleOnDestroy() {
        if (checkout != null) checkout.reject("구매 복원에서 결제 내역을 확인해 주세요.", "ACTIVITY_DESTROYED");
        for (PluginCall call : waiting) call.reject("연결이 종료됐어요.", "ACTIVITY_DESTROYED");
        connected.clear(); waiting.clear(); checkout = null;
        if (client != null) client.endConnection();
        super.handleOnDestroy();
    }
}
