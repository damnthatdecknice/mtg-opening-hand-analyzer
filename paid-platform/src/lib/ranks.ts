import { isPermanentSubscriberEmail } from "@/lib/subscriptions";

export type RankKey = "basic" | "pro" | "beta_premium";

export type RankDefinition = {
  key: RankKey;
  label: string;
  description: string;
};

export const RANKS: Record<RankKey, RankDefinition> = {
  basic: {
    key: "basic",
    label: "Basic",
    description: "Free automatic rank for every account."
  },
  pro: {
    key: "pro",
    label: "Pro",
    description: "Paid subscription rank."
  },
  beta_premium: {
    key: "beta_premium",
    label: "Beta Premium",
    description: "Admin-granted premium beta rank."
  }
};

export function rankFromSubscription({
  currentRank,
  email,
  priceId,
  status
}: {
  currentRank?: string | null;
  email?: string | null;
  priceId?: string | null;
  status?: string | null;
}) {
  if (currentRank === "beta_premium") {
    return RANKS.beta_premium;
  }

  if (isPermanentSubscriberEmail(email)) {
    return RANKS.beta_premium;
  }

  const normalizedStatus = status?.trim().toLowerCase() ?? "";
  const normalizedPrice = priceId?.trim().toLowerCase() ?? "";
  if (
    ["pro", "deck_pro", "active", "trialing", "paid"].includes(normalizedStatus) ||
    normalizedPrice.includes("pro") ||
    normalizedPrice.includes("deck") ||
    normalizedPrice.includes("5")
  ) {
    return RANKS.pro;
  }

  return RANKS.basic;
}
