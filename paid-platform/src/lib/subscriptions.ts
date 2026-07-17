export type SubscriptionTierId = "free" | "deck_pro" | "grinder" | "permanent";

export type SubscriptionTier = {
  id: SubscriptionTierId;
  label: string;
  price: string;
  description: string;
  features: string[];
};

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: "free",
    label: "Free",
    price: "$0/month",
    description: "Try the core opener workflow without stored deck tools.",
    features: [
      "Opening-hand analyzer",
      "Screenshot intake",
      "Manual seven-card confirmation",
      "Overview and deep-data results"
    ]
  },
  {
    id: "deck_pro",
    label: "Deck Pro",
    price: "$5/month",
    description: "Unlock the decklist vault and remembered deck workflow.",
    features: [
      "Everything in Free",
      "Save decklists",
      "Saved-deck dropdown in the analyzer",
      "Deck vault dashboard"
    ]
  },
  {
    id: "grinder",
    label: "Grinder",
    price: "$12/month",
    description: "Future competitive workspace tier for history and tracking.",
    features: [
      "Everything in Deck Pro",
      "Analyzer history",
      "Session tagging",
      "Advanced trend tracking"
    ]
  }
];

const permanentSubscriberEmails = new Set(["gotthisforsoi@gmail.com"]);
const permanentSubscriberHandles = new Set(["gotthisforsoi"]);

export function isPermanentSubscriberEmail(email?: string | null) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const handle = normalized.split("@")[0] ?? normalized;
  return permanentSubscriberEmails.has(normalized) || permanentSubscriberHandles.has(handle);
}

export function tierFromSubscription(status?: string | null, priceId?: string | null): SubscriptionTierId {
  const normalizedStatus = status?.trim().toLowerCase() ?? "";
  const normalizedPrice = priceId?.trim().toLowerCase() ?? "";

  if (["grinder", "premium", "enterprise"].includes(normalizedStatus) || normalizedPrice.includes("grinder")) {
    return "grinder";
  }

  if (
    ["deck_pro", "pro", "active", "trialing", "paid"].includes(normalizedStatus) ||
    normalizedPrice.includes("deck") ||
    normalizedPrice.includes("5")
  ) {
    return "deck_pro";
  }

  return "free";
}

export function getTier(tierId: SubscriptionTierId) {
  if (tierId === "permanent") {
    return {
      id: "permanent",
      label: "Permanent Pro",
      price: "Permanent",
      description: "Lifetime access to paid deck tools.",
      features: SUBSCRIPTION_TIERS.find((tier) => tier.id === "deck_pro")?.features ?? []
    } satisfies SubscriptionTier;
  }

  return SUBSCRIPTION_TIERS.find((tier) => tier.id === tierId) ?? SUBSCRIPTION_TIERS[0];
}

export function canUseDeckVault(tierId: SubscriptionTierId) {
  return tierId === "deck_pro" || tierId === "grinder" || tierId === "permanent";
}
