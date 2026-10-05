import { mapLot, type LotRow } from "@/lib/mappers";
import { mapInvoiceRow, upsertSettlementInvoice } from "@/lib/settlementDb";
import { invoiceFulfillment, settlementLotFrom } from "@/lib/settlements";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

/** Copy the live lot photo, title, number, and pickup/ship choice onto open settlements. */
export async function refreshOpenSettlementLots() {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return { refreshed: 0 };
  const { data, error } = await supabase
    .from("settlement_invoices")
    .select("*")
    .in("shipping_status", ["pending", "ready"]);
  if (error || !data?.length) return { refreshed: 0 };

  let refreshed = 0;
  for (const raw of data) {
    const record = mapInvoiceRow(raw as Record<string, unknown>);
    const ids = record.lots.map((lot) => lot.id).filter(Boolean);
    if (!ids.length) continue;
    const { data: lotRows } = await supabase.from("lots").select("*").in("id", ids);
    if (!lotRows?.length) continue;
    const live = new Map((lotRows as LotRow[]).map((row) => [String(row.id), mapLot(row)]));
    const lines = record.lots.map((line) => {
      const lot = live.get(line.id);
      if (!lot) return line;
      return settlementLotFrom({ ...lot, hammer: line.hammer || lot.currentBid });
    });
    const fulfillment = invoiceFulfillment(lines);
    const changed =
      fulfillment !== (record.fulfillment ?? "unset") ||
      lines.some(
        (line, index) =>
          line.image !== (record.lots[index]?.image ?? null) ||
          line.title !== record.lots[index]?.title ||
          line.lotNumber !== (record.lots[index]?.lotNumber ?? null) ||
          line.fulfillment !== (record.lots[index]?.fulfillment ?? "unset"),
      );
    if (!changed) continue;
    record.lots = lines;
    record.fulfillment = fulfillment;
    await upsertSettlementInvoice(supabase, record);
    refreshed += 1;
  }
  return { refreshed };
}
