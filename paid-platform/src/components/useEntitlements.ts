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
  tierId: SubscriptionTierId;
  tierLabel: string;
  canUseDeckVault: boolean;
  isPermanent: boolean;
};

const freeTier = getTier("free");

const initialState: EntitlementState = {
  isLoading: true,
  error: "",
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
    tierId,
    tierLabel: tier.label,
    canUseDeckVault: canUseDeckVault(tierId),
    isPermanent: tierId === "permanent",
    ...overrides
  };
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
          setState(stateForTier("permanent"));
        }
        return;
      }

      if (userError || !userData.user) {
        if (isActive) {
          setState(stateForTier("free", { error: userError?.message ?? "" }));
        }
        return;
      }

      const { data, error } = await supabase
        .from("subscription_status")
        .select("status, price_id")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      if (error) {
        setState(stateForTier("free", { error: error.message }));
        return;
      }

      setState(stateForTier(tierFromSubscription(data?.status, data?.price_id)));
    }

    void loadEntitlements();

    return () => {
      isActive = false;
    };
  }, []);

  return state;
}
