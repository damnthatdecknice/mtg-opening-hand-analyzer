"use client";

import { useEffect, useState } from "react";
import {
  OPEN_BETA_ACCESS,
  canUseDeckVault,
  canUseUnlimitedAnalyzer,
  getTier,
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
  canUseUnlimitedAnalyzer: boolean;
  isOpenBeta: boolean;
  isPermanent: boolean;
};

const freeTier = getTier("free");

const initialState: EntitlementState = {
  isLoading: true,
  error: "",
  rank: "basic",
  tierId: "free",
  tierLabel: freeTier.label,
  canUseDeckVault: canUseDeckVault("free"),
  canUseUnlimitedAnalyzer: canUseUnlimitedAnalyzer("free"),
  isOpenBeta: OPEN_BETA_ACCESS,
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
    canUseUnlimitedAnalyzer: canUseUnlimitedAnalyzer(tierId),
    isOpenBeta: OPEN_BETA_ACCESS,
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

      if (userError || !userData.user) {
        if (isActive) {
          setState(stateForTier("free", { error: userError?.message ?? "" }));
        }
        return;
      }

      const sessionResponse = await supabase.auth.getSession();
      const accessToken = sessionResponse.data.session?.access_token;
      if (!accessToken) {
        if (isActive) {
          setState(stateForTier("free"));
        }
        return;
      }

      const entitlementResponse = await fetch("/api/entitlements", {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        cache: "no-store"
      });

      if (!isActive) {
        return;
      }

      if (!entitlementResponse.ok) {
        setState(stateForRank("basic"));
        return;
      }

      const resolved = (await entitlementResponse.json()) as EntitlementState;

      setState({
        ...stateForTier(resolved.tierId),
        ...resolved,
        isLoading: false,
        error: ""
      });
    }

    void loadEntitlements();

    return () => {
      isActive = false;
    };
  }, []);

  return state;
}
