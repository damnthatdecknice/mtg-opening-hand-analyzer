import { NextRequest, NextResponse } from "next/server";
import { OPEN_BETA_ACCESS, tierFromSubscription, type SubscriptionTierId } from "@/lib/subscriptions";
import {
  createServerAnonSupabaseClient,
  createServerSupabaseClient,
  isServerAnonSupabaseConfigured,
  isServerSupabaseConfigured
} from "@/lib/serverSupabase";

type ResolvedEntitlements = {
  tierId: SubscriptionTierId;
  tierLabel: string;
  canUseDeckVault: boolean;
  canUseUnlimitedAnalyzer: boolean;
  isOpenBeta: boolean;
  isPermanent: boolean;
  rank: "basic" | "pro" | "beta_premium";
};

const openBeta = OPEN_BETA_ACCESS;

function tierLabel(tierId: SubscriptionTierId, rank: ResolvedEntitlements["rank"]) {
  if (rank === "beta_premium") {
    return "Beta Tester";
  }
  if (tierId === "deck_pro") {
    return "Pro";
  }
  if (tierId === "grinder") {
    return "Grinder";
  }
  return openBeta ? "Open Beta" : "Free";
}

function resolved(tierId: SubscriptionTierId, rank: ResolvedEntitlements["rank"]): ResolvedEntitlements {
  return {
    tierId,
    tierLabel: tierLabel(tierId, rank),
    canUseDeckVault: openBeta || tierId === "deck_pro" || tierId === "grinder" || tierId === "permanent",
    canUseUnlimitedAnalyzer: openBeta || tierId === "deck_pro" || tierId === "grinder" || tierId === "permanent",
    isOpenBeta: openBeta,
    isPermanent: tierId === "permanent",
    rank
  };
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

export async function GET(request: NextRequest) {
  const token = bearerToken(request);
  if (!token || !isServerAnonSupabaseConfigured || !isServerSupabaseConfigured) {
    return NextResponse.json(resolved("free", "basic"));
  }

  const authClient = createServerAnonSupabaseClient(token);
  const serviceClient = createServerSupabaseClient();
  if (!authClient || !serviceClient) {
    return NextResponse.json(resolved("free", "basic"));
  }

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json(resolved("free", "basic"), { status: 401 });
  }

  const [profileResponse, subscriptionResponse] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("rank")
      .eq("id", userData.user.id)
      .maybeSingle(),
    serviceClient
      .from("subscription_status")
      .select("status, price_id")
      .eq("user_id", userData.user.id)
      .maybeSingle()
  ]);

  const rank =
    profileResponse.data?.rank === "beta_premium" || profileResponse.data?.rank === "pro"
      ? profileResponse.data.rank
      : "basic";
  const subscriptionTier = tierFromSubscription(
    subscriptionResponse.data?.status,
    subscriptionResponse.data?.price_id
  );
  const tierId =
    rank === "beta_premium"
      ? "permanent"
      : rank === "pro"
        ? "deck_pro"
        : subscriptionTier;

  return NextResponse.json(resolved(tierId, rank));
}
