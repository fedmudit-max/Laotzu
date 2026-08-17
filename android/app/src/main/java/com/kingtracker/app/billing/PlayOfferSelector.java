package com.kingtracker.app.billing;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.android.billingclient.api.ProductDetails;

import java.util.ArrayList;
import java.util.List;

/**
 * Deterministic Play subscription offer choice.
 * Never uses offers.get(0) — that can be a trial/intro/promo because list order is undefined.
 *
 * Default: the base plan (Play returns offerId == null). Optional spec.basePlanId /
 * spec.offerId pin a Console ID once products exist. billingPeriod (P1M / P1Y)
 * disambiguates multiple base plans on one product.
 */
final class PlayOfferSelector {
    static final class Spec {
        final String productId;
        final String basePlanId;
        final String offerId;
        final String billingPeriod;

        Spec(String productId, String basePlanId, String offerId, String billingPeriod) {
            this.productId = productId == null ? "" : productId;
            this.basePlanId = basePlanId == null ? "" : basePlanId.trim();
            this.offerId = offerId == null ? "" : offerId.trim();
            this.billingPeriod = billingPeriod == null ? "" : billingPeriod.trim();
        }

        boolean wantsSpecificOffer() {
            return !offerId.isEmpty();
        }
    }

    @Nullable
    static ProductDetails.SubscriptionOfferDetails pick(
        @NonNull ProductDetails details,
        @Nullable Spec spec
    ) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;

        Spec s = spec != null ? spec : new Spec(details.getProductId(), "", "", "");
        List<ProductDetails.SubscriptionOfferDetails> matches = new ArrayList<>();

        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            if (!matchesSpec(offer, s)) continue;
            matches.add(offer);
        }

        if (matches.size() == 1) return matches.get(0);
        return null;
    }

    private static boolean matchesSpec(
        ProductDetails.SubscriptionOfferDetails offer,
        Spec spec
    ) {
        String offerId = offer.getOfferId() == null ? "" : offer.getOfferId().trim();
        String basePlanId = offer.getBasePlanId() == null ? "" : offer.getBasePlanId().trim();

        if (spec.wantsSpecificOffer()) {
            if (!spec.offerId.equals(offerId)) return false;
        } else if (!offerId.isEmpty()) {
            // Default: base plan only — skip trial / intro / promo offers.
            return false;
        }

        if (!spec.basePlanId.isEmpty() && !spec.basePlanId.equals(basePlanId)) return false;

        if (!spec.billingPeriod.isEmpty()) {
            ProductDetails.PricingPhase phase = recurringPhase(offer);
            String period = phase != null && phase.getBillingPeriod() != null
                ? phase.getBillingPeriod()
                : "";
            if (!spec.billingPeriod.equals(period)) return false;
        }
        return true;
    }

    @Nullable
    static ProductDetails.PricingPhase paidPhase(
        @NonNull ProductDetails details,
        @Nullable Spec spec
    ) {
        ProductDetails.SubscriptionOfferDetails offer = pick(details, spec);
        if (offer == null) return null;
        return recurringPhase(offer);
    }

    @Nullable
    static ProductDetails.PricingPhase recurringPhase(ProductDetails.SubscriptionOfferDetails offer) {
        List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
        if (phases == null || phases.isEmpty()) return null;
        ProductDetails.PricingPhase paid = null;
        for (ProductDetails.PricingPhase phase : phases) {
            if (phase.getPriceAmountMicros() > 0) {
                paid = phase;
                break;
            }
        }
        return paid;
    }

    private PlayOfferSelector() {}
}
