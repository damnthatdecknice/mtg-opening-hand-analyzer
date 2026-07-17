import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "mtg-opening-hand-paid-platform"
  });
}

