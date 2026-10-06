import { NextResponse } from "next/server";
import { GET as loadConsignments } from "@/app/api/consignments/route";
import { payoutSheetRows } from "@/lib/consignorPortal";
import { xlsxWorkbook } from "@/lib/xlsxWorkbook";
import type { ConsignorItem } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const list = await loadConsignments();
  const json = (await list.json()) as { items?: ConsignorItem[]; error?: string };
  if (!list.ok) {
    return NextResponse.json({ error: json.error || "Could not export consignments." }, { status: list.status });
  }

  const items = json.items ?? [];
  const body = xlsxWorkbook([
    { name: "Still owed", rows: payoutSheetRows(items.filter((item) => item.pipelineStatus === "sold" && !item.clearedAt)) },
    { name: "Paid out", rows: payoutSheetRows(items.filter((item) => item.pipelineStatus === "paid_out" && !item.clearedAt)) },
    { name: "Cleared", rows: payoutSheetRows(items.filter((item) => Boolean(item.clearedAt))) },
  ]);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="DealFinder-consignor-payouts.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
