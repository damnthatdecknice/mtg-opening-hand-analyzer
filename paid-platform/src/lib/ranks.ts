import {
  isPermanentSubscriberEmail,
  tierFromSubscription,
  type SubscriptionTierId
} from "@/lib/subscriptions";

export type RankKey = "free" | "deck_pro" | "grinder" | "permanent_pro";

export type RankDefinition = {
  key: RankKey;
  label: string;
  description: string;
};

export const RANKS: Record<RankKey, RankDefinition> = {
  free: {
    key: "free",
    label: "Free",
    description: "Core hand analyzer access."
  },
  deck_pro: {
    key: "deck_pro",
    label: "Deck Pro",
    description: "Paid deck vault and saved-deck workflow access."
  },
  grinder: {
    key: "grinder",
    label: "Grinder",
    description: "Higher paid tier for future competitive tracking features."
  },
  permanent_pro: {
    key: "permanent_pro",
    label: "Permanent Pro",
    description: "Lifetime paid access override."
  }
};

export function rankFromTier(tierId: SubscriptionTierId): RankKey {
  if (tierId === "permanent") {
    return "permanent_pro";
  }
  if (tierId === "deck_pro" || tierId === "grinder") {
    return tierId;
  }
  return "free";
}

export function rankFromSubscription({
  email,
  priceId,
  status
}: {
  email?: string | null;
  priceId?: string | null;
  status?: string | null;
}) {
  if (isPermanentSubscriberEmail(email)) {
    return RANKS.permanent_pro;
  }

  return RANKS[rankFromTier(tierFromSubscription(status, priceId))];
}
