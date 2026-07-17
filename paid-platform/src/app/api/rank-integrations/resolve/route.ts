import { NextRequest, NextResponse } from "next/server";
import { rankFromSubscription } from "@/lib/ranks";
import { createServerSupabaseClient, isServerSupabaseConfigured } from "@/lib/serverSupabase";

type ResolveRankBody = {
  email?: string;
  externalUserId?: string;
  provider?: string;
  userId?: string;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized rank integration request." }, { status: 401 });
}

function integrationSecret(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return request.headers.get("x-rank-integration-secret") ?? "";
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.RANK_INTEGRATION_SECRET;
  if (!expectedSecret || integrationSecret(request) !== expectedSecret) {
    return unauthorized();
  }

  if (!isServerSupabaseConfigured) {
    return NextResponse.json(
      { error: "Server Supabase credentials are not configured." },
      { status: 503 }
    );
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server Supabase client could not be created." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as ResolveRankBody;
  const email = body.email?.trim().toLowerCase();
  const userId = body.userId?.trim();

  if (!email && !userId) {
    return NextResponse.json(
      { error: "Send either email or userId to resolve a rank." },
      { status: 400 }
    );
  }

  let profileQuery = supabase.from("profiles").select("id, email, rank").limit(1);
  profileQuery = userId ? profileQuery.eq("id", userId) : profileQuery.ilike("email", email as string);

  const { data: profileRows, error: profileError } = await profileQuery;
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const profile = profileRows?.[0];
  if (!profile) {
    const rank = rankFromSubscription({ email });
    return NextResponse.json({
      found: false,
      rank: rank.key,
      rankLabel: rank.label,
      reason: "No matching app profile found."
    });
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscription_status")
    .select("status, price_id, current_period_end")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (subscriptionError) {
    return NextResponse.json({ error: subscriptionError.message }, { status: 500 });
  }

  const rank = rankFromSubscription({
    currentRank: profile.rank,
    email: profile.email,
    priceId: subscription?.price_id,
    status: subscription?.status
  });

  const { error: checkLogError } = await supabase
    .from("rank_integration_checks")
    .insert({
      external_user_id: body.externalUserId ?? null,
      provider: body.provider ?? "unknown",
      resolved_rank: rank.key,
      user_id: profile.id
    });

  return NextResponse.json({
    found: true,
    userId: profile.id,
    email: profile.email,
    rank: rank.key,
    rankLabel: rank.label,
    subscriptionStatus: subscription?.status ?? "free",
    subscriptionPriceId: subscription?.price_id ?? null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    checkLogged: !checkLogError
  });
}
