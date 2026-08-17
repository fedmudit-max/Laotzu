package com.kingtracker.app.billing;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * One BillingClient for product catalog, purchase, and restore/query.
 */
final class PlayBillingStore implements PurchasesUpdatedListener {
    interface QueryCallback {
        void onResult(@NonNull BillingResult result, @NonNull List<Purchase> purchases);
    }

    interface CatalogCallback {
        void onResult(@NonNull BillingResult result, @NonNull List<ProductDetails> products);
    }

    interface LaunchCallback {
        void onLaunch(@NonNull BillingResult result);
    }

    interface PurchaseUpdateCallback {
        void onPurchasesUpdated(@NonNull BillingResult result, @NonNull List<Purchase> purchases);
    }

    private static final class ReadyJob {
        final Runnable run;
        final Consumer<BillingResult> fail;

        ReadyJob(Runnable run, Consumer<BillingResult> fail) {
            this.run = run;
            this.fail = fail;
        }
    }

    private static PlayBillingStore instance;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final BillingClient client;
    private final List<ReadyJob> readyWork = new ArrayList<>();
    private final Map<String, ProductDetails> catalog = new HashMap<>();

    private boolean connecting;
    private boolean connected;
    @Nullable
    private PurchaseUpdateCallback updateCallback;

    static synchronized PlayBillingStore get(Context context) {
        if (instance == null) {
            instance = new PlayBillingStore(context.getApplicationContext());
        }
        return instance;
    }

    private PlayBillingStore(Context appContext) {
        client = BillingClient.newBuilder(appContext)
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            )
            .build();
    }

    void setUpdateCallback(@Nullable PurchaseUpdateCallback callback) {
        updateCallback = callback;
    }

    void querySubscriptions(@NonNull QueryCallback callback) {
        whenReady(
            () -> {
                QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build();
                client.queryPurchasesAsync(params, (billingResult, purchases) -> {
                    List<Purchase> list = purchases != null ? purchases : Collections.emptyList();
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        acknowledgeIfNeeded(list);
                    }
                    callback.onResult(billingResult, list);
                });
            },
            result -> callback.onResult(result, Collections.emptyList())
        );
    }

    void queryProductDetails(@NonNull List<String> productIds, @NonNull CatalogCallback callback) {
        whenReady(
            () -> startProductQuery(productIds, callback),
            result -> callback.onResult(result, Collections.emptyList())
        );
    }

    private void startProductQuery(List<String> productIds, CatalogCallback callback) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String id : productIds) {
            if (id == null || id.isEmpty()) continue;
            products.add(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
            );
        }
        if (products.isEmpty()) {
            callback.onResult(errorResult(BillingClient.BillingResponseCode.DEVELOPER_ERROR, "no-product-ids"), Collections.emptyList());
            return;
        }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build();
        client.queryProductDetailsAsync(params, (billingResult, queryResult) -> {
            List<ProductDetails> list = queryResult != null && queryResult.getProductDetailsList() != null
                ? queryResult.getProductDetailsList()
                : Collections.emptyList();
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                for (ProductDetails details : list) {
                    catalog.put(details.getProductId(), details);
                }
            }
            callback.onResult(billingResult, list);
        });
    }

    void launchPurchase(@NonNull Activity activity, @NonNull String productId, @NonNull LaunchCallback callback) {
        ProductDetails cached = catalog.get(productId);
        if (cached != null) {
            whenReady(() -> startFlow(activity, cached, callback), callback::onLaunch);
            return;
        }
        queryProductDetails(Collections.singletonList(productId), (result, products) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || products.isEmpty()) {
                callback.onLaunch(result);
                return;
            }
            startFlow(activity, products.get(0), callback);
        });
    }

    private void startFlow(Activity activity, ProductDetails details, LaunchCallback callback) {
        main.post(() -> {
            if (activity.isFinishing()) {
                callback.onLaunch(errorResult(BillingClient.BillingResponseCode.ERROR, "no-activity"));
                return;
            }
            ProductDetails.SubscriptionOfferDetails offer = pickOffer(details);
            if (offer == null) {
                callback.onLaunch(errorResult(BillingClient.BillingResponseCode.ITEM_UNAVAILABLE, "no-offer"));
                return;
            }
            BillingFlowParams.ProductDetailsParams productParams =
                BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details)
                    .setOfferToken(offer.getOfferToken())
                    .build();
            BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(productParams))
                .build();
            callback.onLaunch(client.launchBillingFlow(activity, flowParams));
        });
    }

    @Nullable
    static ProductDetails.SubscriptionOfferDetails pickOffer(ProductDetails details) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;
        return offers.get(0);
    }

    @Nullable
    static ProductDetails.PricingPhase paidPhase(ProductDetails details) {
        ProductDetails.SubscriptionOfferDetails offer = pickOffer(details);
        if (offer == null) return null;
        List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
        if (phases == null || phases.isEmpty()) return null;
        for (ProductDetails.PricingPhase phase : phases) {
            if (phase.getPriceAmountMicros() > 0) return phase;
        }
        return phases.get(0);
    }

    private void whenReady(@NonNull Runnable work, @NonNull Consumer<BillingResult> onFail) {
        main.post(() -> {
            readyWork.add(new ReadyJob(work, onFail));
            if (connected && client.isReady()) {
                drainReady();
                return;
            }
            ensureConnected();
        });
    }

    private void ensureConnected() {
        if (connecting) return;
        if (connected && client.isReady()) {
            drainReady();
            return;
        }
        connecting = true;
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                connecting = false;
                connected = billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK;
                if (!connected) {
                    failReady(billingResult);
                    return;
                }
                drainReady();
            }

            @Override
            public void onBillingServiceDisconnected() {
                connecting = false;
                connected = false;
            }
        });
    }

    private void drainReady() {
        List<ReadyJob> jobs = new ArrayList<>(readyWork);
        readyWork.clear();
        for (ReadyJob job : jobs) job.run.run();
    }

    private void failReady(BillingResult result) {
        List<ReadyJob> jobs = new ArrayList<>(readyWork);
        readyWork.clear();
        for (ReadyJob job : jobs) job.fail.accept(result);
    }

    private static BillingResult errorResult(int code, String message) {
        return BillingResult.newBuilder()
            .setResponseCode(code)
            .setDebugMessage(message)
            .build();
    }

    private void acknowledgeIfNeeded(List<Purchase> purchases) {
        for (Purchase purchase : purchases) {
            if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            if (purchase.isAcknowledged()) continue;
            AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.getPurchaseToken())
                .build();
            client.acknowledgePurchase(params, result -> { });
        }
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, @Nullable List<Purchase> purchases) {
        List<Purchase> list = purchases != null ? purchases : Collections.emptyList();
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
            acknowledgeIfNeeded(list);
        }
        PurchaseUpdateCallback cb = updateCallback;
        if (cb != null) {
            cb.onPurchasesUpdated(billingResult, list);
        }
    }
}
