export type SubscriptionTierId = "free" | "deck_pro" | "grinder" | "permanent";

export type SubscriptionTier = {
  id: SubscriptionTierId;
  label: string;
  price: string;
  description: string;
  features: string[];
};

export const OPEN_BETA_ACCESS = true;

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: "free",
    label: "Free",
    price: "$0/month",
    description: OPEN_BETA_ACCESS
      ? "Open beta access to the core Opening Edge workspace."
      : "Try the core opener workflow with a weekly use limit.",
    features: [
      OPEN_BETA_ACCESS ? "Unlimited opening-hand analyses during open beta" : "10 opening-hand analyses per week",
      "Screenshot intake",
      "Manual seven-card confirmation",
      "Overview and deep-data results",
      ...(OPEN_BETA_ACCESS ? ["Saved decks, Deck Lab, and metagame tools during open beta"] : [])
    ]
  },
  {
    id: "deck_pro",
    label: "Deck Pro",
    price: OPEN_BETA_ACCESS ? "$5/month later" : "$5/month",
    description: OPEN_BETA_ACCESS
      ? "Planned paid tier for saved deck workflows after open beta."
      : "Unlock the decklist vault and remembered deck workflow.",
    features: [
      "Everything in Free",
      "Unlimited opening-hand analyses",
      "Save decklists",
      "Saved-deck dropdown in the analyzer",
      "Deck vault dashboard"
    ]
  },
  {
    id: "grinder",
    label: "Grinder",
    price: OPEN_BETA_ACCESS ? "$12/month later" : "$12/month",
    description: "Future competitive workspace tier for history and tracking.",
    features: [
      "Everything in Deck Pro",
      "Analyzer history",
      "Session tagging",
      "Advanced trend tracking"
    ]
  }
];

export function tierFromSubscription(status?: string | null, priceId?: string | null): SubscriptionTierId {
  const normalizedStatus = status?.trim().toLowerCase() ?? "";
  const normalizedPrice = priceId?.trim().toLowerCase() ?? "";

  const recognizedPrices: Record<string, SubscriptionTierId> = {
    deck_pro: "deck_pro",
    grinder: "grinder"
  };

  if (recognizedPrices[normalizedPrice]) {
    return recognizedPrices[normalizedPrice];
  }

  if (["grinder", "premium", "enterprise"].includes(normalizedStatus)) {
    return "grinder";
  }

  if (["deck_pro", "pro", "active", "trialing", "paid"].includes(normalizedStatus)) {
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
  return OPEN_BETA_ACCESS || tierId === "deck_pro" || tierId === "grinder" || tierId === "permanent";
}

export function canUseUnlimitedAnalyzer(tierId: SubscriptionTierId) {
  return OPEN_BETA_ACCESS || tierId === "deck_pro" || tierId === "grinder" || tierId === "permanent";
}
