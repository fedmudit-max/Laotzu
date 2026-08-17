package com.kingtracker.app.billing;

import android.app.Activity;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "KingBilling")
public class BillingPlugin extends Plugin {

    private PlayBillingStore store;
    private PluginCall pendingPurchase;

    @Override
    public void load() {
        store = PlayBillingStore.get(getContext());
        store.setUpdateCallback((result, purchases) -> {
            JSObject data = wrapPurchases(
                result.getResponseCode() == BillingClient.BillingResponseCode.OK,
                result.getResponseCode(),
                result.getDebugMessage() != null ? result.getDebugMessage() : "",
                purchases
            );
            data.put("canceled", result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED);
            notifyListeners("purchasesUpdated", data);
            resolvePendingPurchase(data);
        });
    }

    @PluginMethod
    public void queryPurchases(PluginCall call) {
        store.querySubscriptions((result, purchases) ->
            call.resolve(wrapPurchasesResult(result, purchases))
        );
    }

    @PluginMethod
    public void queryProducts(PluginCall call) {
        List<PlayOfferSelector.Spec> specs = readOfferSpecs(call);
        store.queryProductDetails(specs, (result, products) ->
            call.resolve(wrapProducts(result, products, store))
        );
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        PlayOfferSelector.Spec spec = specFromCall(call);
        if (spec.productId.isEmpty()) {
            call.reject("product-id-required");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            JSObject data = wrapPurchases(false, BillingClient.BillingResponseCode.ERROR, "no-activity", null);
            call.resolve(data);
            return;
        }
        pendingPurchase = call;
        store.launchPurchase(activity, spec, launchResult -> {
            int code = launchResult.getResponseCode();
            if (code == BillingClient.BillingResponseCode.OK) return;
            JSObject data = wrapPurchases(
                false,
                code,
                launchResult.getDebugMessage() != null ? launchResult.getDebugMessage() : "",
                null
            );
            data.put("canceled", code == BillingClient.BillingResponseCode.USER_CANCELED);
            resolvePendingPurchase(data);
        });
    }

    @Override
    protected void handleOnResume() {
        if (pendingPurchase != null) return;
        store.querySubscriptions((result, purchases) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) return;
            notifyListeners("purchasesUpdated", wrapPurchasesResult(result, purchases));
        });
    }

    private void resolvePendingPurchase(JSObject data) {
        PluginCall call = pendingPurchase;
        if (call == null) return;
        pendingPurchase = null;
        call.resolve(data);
    }

    private static JSObject wrapPurchasesResult(BillingResult result, List<Purchase> purchases) {
        return wrapPurchases(
            result.getResponseCode() == BillingClient.BillingResponseCode.OK,
            result.getResponseCode(),
            result.getDebugMessage() != null ? result.getDebugMessage() : "",
            purchases
        );
    }

    private static JSObject wrapPurchases(boolean ok, int code, String message, List<Purchase> purchases) {
        JSObject out = new JSObject();
        out.put("ok", ok);
        out.put("responseCode", code);
        out.put("message", message);
        JSArray list = new JSArray();
        if (purchases != null) {
            for (Purchase purchase : purchases) {
                list.put(purchaseObject(purchase));
            }
        }
        out.put("purchases", list);
        return out;
    }

    private static List<PlayOfferSelector.Spec> readOfferSpecs(PluginCall call) {
        List<PlayOfferSelector.Spec> specs = new ArrayList<>();
        JSArray products = call.getArray("products");
        if (products != null) {
            for (int i = 0; i < products.length(); i++) {
                org.json.JSONObject rawRow = products.optJSONObject(i);
                if (rawRow == null) continue;
                try {
                    specs.add(specFromObject(JSObject.fromJSONObject(rawRow)));
                } catch (org.json.JSONException ignored) {
                    // skip malformed product rows
                }
            }
        }
        if (!specs.isEmpty()) return specs;
        JSArray raw = call.getArray("productIds");
        if (raw != null) {
            for (int i = 0; i < raw.length(); i++) {
                String id = raw.optString(i, "");
                if (id != null && !id.isEmpty()) {
                    specs.add(new PlayOfferSelector.Spec(id, "", "", ""));
                }
            }
        }
        return specs;
    }

    private static PlayOfferSelector.Spec specFromCall(PluginCall call) {
        return new PlayOfferSelector.Spec(
            call.getString("productId", ""),
            call.getString("basePlanId", ""),
            call.getString("offerId", ""),
            call.getString("billingPeriod", "")
        );
    }

    private static PlayOfferSelector.Spec specFromObject(JSObject row) {
        return new PlayOfferSelector.Spec(
            row.optString("productId", ""),
            row.optString("basePlanId", ""),
            row.optString("offerId", ""),
            row.optString("billingPeriod", "")
        );
    }

    private static JSObject wrapProducts(
        BillingResult result,
        List<ProductDetails> products,
        PlayBillingStore store
    ) {
        JSObject out = new JSObject();
        int code = result.getResponseCode();
        out.put("ok", code == BillingClient.BillingResponseCode.OK);
        out.put("responseCode", code);
        out.put("message", result.getDebugMessage() != null ? result.getDebugMessage() : "");
        JSArray list = new JSArray();
        if (products != null) {
            for (ProductDetails details : products) {
                list.put(productObject(details, store.offerSpec(details.getProductId())));
            }
        }
        out.put("products", list);
        return out;
    }

    private static JSObject productObject(ProductDetails details, PlayOfferSelector.Spec spec) {
        JSObject o = new JSObject();
        o.put("productId", details.getProductId());
        o.put("title", details.getTitle() != null ? details.getTitle() : "");
        o.put("name", details.getName() != null ? details.getName() : "");
        // Same pick as launchBillingFlow — never Play's offer list order.
        ProductDetails.SubscriptionOfferDetails offer = PlayOfferSelector.pick(details, spec);
        ProductDetails.PricingPhase phase = offer != null ? PlayOfferSelector.recurringPhase(offer) : null;
        o.put("price", phase != null && phase.getFormattedPrice() != null ? phase.getFormattedPrice() : "");
        o.put("billingPeriod", phase != null && phase.getBillingPeriod() != null ? phase.getBillingPeriod() : "");
        o.put("basePlanId", offer != null && offer.getBasePlanId() != null ? offer.getBasePlanId() : "");
        o.put("offerId", offer != null && offer.getOfferId() != null ? offer.getOfferId() : "");
        o.put("hasSelectedOffer", offer != null);
        return o;
    }

    private static JSObject purchaseObject(Purchase purchase) {
        JSObject o = new JSObject();
        JSArray ids = new JSArray();
        List<String> products = purchase.getProducts();
        if (products != null) {
            for (String id : products) {
                ids.put(id);
            }
        }
        o.put("productIds", ids);
        o.put("productId", products != null && !products.isEmpty() ? products.get(0) : "");
        o.put("purchaseToken", purchase.getPurchaseToken());
        o.put("purchaseState", purchaseStateName(purchase.getPurchaseState()));
        o.put("acknowledged", purchase.isAcknowledged());
        o.put("autoRenewing", purchase.isAutoRenewing());
        o.put("purchaseTime", purchase.getPurchaseTime());
        o.put("suspended", purchase.isSuspended());
        return o;
    }

    private static String purchaseStateName(int state) {
        if (state == Purchase.PurchaseState.PURCHASED) return "purchased";
        if (state == Purchase.PurchaseState.PENDING) return "pending";
        return "unspecified";
    }
}
