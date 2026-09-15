import { getDemoLot } from "@/lib/demoAuctionStore";
import { patchLotRow } from "@/lib/openFloor";
import type { FulfillmentChoice } from "@/lib/payments";
import type { BidderProfile } from "@/lib/profileTypes";
import { mapInvoiceRow, upsertSettlementInvoice } from "@/lib/settlementDb";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

function invoiceHasLot(lots: unknown, lotId: string) {
  if (!Array.isArray(lots)) return false;
  return lots.some((item) => {
    const row = item as Record<string, unknown>;
    return String(row.id ?? "") === lotId;
  });
}

export async function saveWinFulfillment(
  lotId: string,
  fulfillment: FulfillmentChoice,
  session: BidderProfile,
) {
  if (isSupabaseConfigured) {
    const patched = await patchLotRow(lotId, { fulfillment });
    if (!patched.ok && /fulfillment/i.test(patched.body)) {
      throw new Error("Run the win fulfillment SQL in the Supabase SQL editor, then try again.");
    }
    if (!patched.ok) {
      throw new Error(patched.body || "Could not save delivery choice.");
    }

    const supabase = getSupabaseAdmin();
    if (supabase) {
      const keys = [session.id, session.email, session.fullName].filter(Boolean);
      const { data } = await supabase.from("settlement_invoices").select("*").in("buyer_key", keys);
      for (const raw of data ?? []) {
        if (!invoiceHasLot(raw.lots, lotId)) continue;
        const record = mapInvoiceRow(raw as Record<string, unknown>);
        record.fulfillment = fulfillment;
        await upsertSettlementInvoice(supabase, record);
      }
    }
    return;
  }

  const demo = getDemoLot(lotId);
  if (demo) demo.fulfillment = fulfillment;
}
