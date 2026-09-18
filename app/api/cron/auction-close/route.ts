import { NextRequest, NextResponse } from "next/server";
import { issueEndedAuctionInvoices } from "@/lib/auctionCloseInvoices";
import { cronAuthorized } from "@/lib/cronAuth";
import { sweepIp } from "@/lib/sundayPreauth";
import { runSundayPreauthSweep } from "@/lib/sundayPreauth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const invoices = await issueEndedAuctionInvoices();
  const preauth = await runSundayPreauthSweep(sweepIp(request));
  return NextResponse.json({ ok: true, invoices, preauth });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
