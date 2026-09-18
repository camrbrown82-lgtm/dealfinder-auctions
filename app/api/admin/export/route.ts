import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { auctionIsClosed } from "@/lib/auctionStatus";
import { filterAuctionDesk, loadAuctionDesk } from "@/lib/auctionDesk";
import { masterAuctionSheets } from "@/lib/masterAuctionReport";
import { xlsxWorkbook } from "@/lib/xlsxWorkbook";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();

  const eventId = request.nextUrl.searchParams.get("eventId")?.trim();
  if (!eventId) {
    return NextResponse.json(
      { error: "Choose an ended auction on Auction desk to export the master report." },
      { status: 400 },
    );
  }

  const desk = filterAuctionDesk(await loadAuctionDesk(eventId), "");
  if (!desk.event) {
    return NextResponse.json({ error: "Auction not found." }, { status: 404 });
  }
  if (!auctionIsClosed(desk.event)) {
    return NextResponse.json(
      { error: "The master report is available after this auction has ended or been closed." },
      { status: 409 },
    );
  }

  const stamp = (desk.event.auctionNumber || eventId).replace(/[^\w.-]+/g, "-");
  const body = xlsxWorkbook(masterAuctionSheets(desk));
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="DealFinder-master-${stamp}.xlsx"`,
    },
  });
}
