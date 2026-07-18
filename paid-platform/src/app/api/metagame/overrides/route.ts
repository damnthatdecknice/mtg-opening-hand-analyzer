import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isServerSupabaseConfigured } from "@/lib/serverSupabase";
import { isMetagameFormat, type MetagameFormat } from "@/lib/metagame";

const metagameAdminEmail = "gotthisforsoi@gmail.com";
const overrideTable = "metagame_archetype_overrides";

type OverrideBody = {
  format?: string;
  sourceName?: string;
  displayName?: string;
};

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ error: "Server Supabase credentials are not configured." }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server Supabase client could not be created." }, { status: 503 });
  }

  const token = readBearerToken(request);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const email = userData.user?.email?.toLowerCase();
  if (userError || email !== metagameAdminEmail) {
    return NextResponse.json({ error: "Only the metagame admin can edit archetype names." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as OverrideBody;
  const format = isMetagameFormat(body.format ?? null) ? body.format : null;
  const sourceName = body.sourceName?.trim() ?? "";
  const displayName = body.displayName?.trim() ?? "";

  if (!format || !sourceName || !displayName) {
    return NextResponse.json({ error: "Format, source archetype, and display name are required." }, { status: 400 });
  }

  const { error } = await supabase.from(overrideTable).upsert(
    {
      format,
      source_name: sourceName,
      display_name: displayName,
      updated_by: email,
      updated_at: new Date().toISOString()
    },
    {
      onConflict: "format,source_name"
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function readBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return authorization.slice(7).trim();
}
