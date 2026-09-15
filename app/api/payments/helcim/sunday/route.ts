import { NextRequest, NextResponse } from "next/server";
import { bidderUnauthorized, getBidderSession } from "@/lib/bidderAuth";
import { BID_PREAUTH_AMOUNT, PREAUTH_DISCLAIMER, PREAUTH_DISCLAIMER_TITLE } from "@/lib/helcimCopy";
import { isAuctionEndDay } from "@/lib/auctionEndDay";
import { bidderNeedsSundayPreauth, runSundayPreauthSweep, sweepIp } from "@/lib/sundayPreauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getBidderSession();
  if (!session) return NextResponse.json({ needed: false, auctionEndDay: isAuctionEndDay() });
  const status = await bidderNeedsSundayPreauth(session.id, session.fullName);
  return NextResponse.json({
    needed: status.needed,
    lots: status.lots,
    auctionEndDay: isAuctionEndDay(),
    amount: BID_PREAUTH_AMOUNT,
    disclaimer: PREAUTH_DISCLAIMER,
    disclaimerTitle: PREAUTH_DISCLAIMER_TITLE,
  });
}

export async function POST(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();
  const result = await runSundayPreauthSweep(sweepIp(request));
  const status = await bidderNeedsSundayPreauth(session.id, session.fullName);
  return NextResponse.json({ ...result, needed: status.needed, lots: status.lots });
}
