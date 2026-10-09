import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { sendOutbidClosingReminders } from "@/lib/outbidNotice";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await sendOutbidClosingReminders();
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
