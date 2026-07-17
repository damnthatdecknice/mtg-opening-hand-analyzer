"use client";

import { useEffect, useState } from "react";
import {
  canUseDeckVault,
  getTier,
  isPermanentSubscriberEmail,
  tierFromSubscription,
  type SubscriptionTierId
} from "@/lib/subscriptions";
import { supabase } from "@/lib/supabase";

type EntitlementState = {
  isLoading: boolean;
  error: string;
  rank: "basic" | "pro" | "beta_premium";
  tierId: SubscriptionTierId;
  tierLabel: string;
  canUseDeckVault: boolean;
  isPermanent: boolean;
};

const freeTier = getTier("free");

const initialState: EntitlementState = {
  isLoading: true,
  error: "",
  rank: "basic",
  tierId: "free",
  tierLabel: freeTier.label,
  canUseDeckVault: false,
  isPermanent: false
};

function stateForTier(tierId: SubscriptionTierId, overrides: Partial<EntitlementState> = {}): EntitlementState {
  const tier = getTier(tierId);
  return {
    isLoading: false,
    error: "",
    rank: "basic",
    tierId,
    tierLabel: tier.label,
    canUseDeckVault: canUseDeckVault(tierId),
    isPermanent: tierId === "permanent",
    ...overrides
  };
}

function stateForRank(rank: EntitlementState["rank"]): EntitlementState {
  if (rank === "beta_premium") {
    return stateForTier("permanent", {
      rank,
      tierLabel: "Beta Tester",
      canUseDeckVault: true,
      isPermanent: true
    });
  }

  if (rank === "pro") {
    return stateForTier("deck_pro", {
      rank,
      tierLabel: "Pro",
      canUseDeckVault: true
    });
  }

  return stateForTier("free", {
    rank,
    tierLabel: "Free"
  });
}

export function useEntitlements() {
  const [state, setState] = useState<EntitlementState>(initialState);

  useEffect(() => {
    let isActive = true;

    async function loadEntitlements() {
      if (!supabase) {
        if (isActive) {
          setState(stateForTier("free", { error: "Supabase is not configured." }));
        }
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const email = userData.user?.email;

      if (isPermanentSubscriberEmail(email)) {
        if (isActive) {
          setState(stateForRank("beta_premium"));
        }
        return;
      }

      if (userError || !userData.user) {
        if (isActive) {
          setState(stateForTier("free", { error: userError?.message ?? "" }));
        }
        return;
      }

      const [profileResponse, subscriptionResponse] = await Promise.all([
        supabase
          .from("profiles")
          .select("rank")
          .eq("id", userData.user.id)
          .maybeSingle(),
        supabase
          .from("subscription_status")
          .select("status, price_id")
          .eq("user_id", userData.user.id)
          .maybeSingle()
      ]);

      if (!isActive) {
        return;
      }

      if (profileResponse.data?.rank === "pro" || profileResponse.data?.rank === "beta_premium") {
        setState(stateForRank(profileResponse.data.rank));
        return;
      }

      if (subscriptionResponse.error) {
        setState(stateForRank("basic"));
        return;
      }

      setState(stateForTier(tierFromSubscription(subscriptionResponse.data?.status, subscriptionResponse.data?.price_id)));
    }

    void loadEntitlements();

    return () => {
      isActive = false;
    };
  }, []);

  return state;
}
