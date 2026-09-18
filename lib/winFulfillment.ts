import { getDemoLot } from "@/lib/demoAuctionStore";
import { invoiceFees } from "@/lib/invoiceFees";
import { patchLotRow } from "@/lib/openFloor";
import type { FulfillmentChoice } from "@/lib/payments";
import type { BidderProfile } from "@/lib/profileTypes";
import { mapInvoiceRow, upsertSettlementInvoice } from "@/lib/settlementDb";
import { estimateCarrierShipping } from "@/lib/shippingEstimate";
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
  extras?: { shippingCost?: number; address?: string },
) {
  const shippingCost =
    extras?.shippingCost ??
    (fulfillment === "ship"
      ? estimateCarrierShipping({ province: session.province, postalCode: session.postalCode })
      : 0);
  const address = extras?.address;

  if (isSupabaseConfigured) {
    const patched = await patchLotRow(lotId, { fulfillment, shipping_cost: shippingCost });
    if (!patched.ok && /fulfillment|shipping_cost/i.test(patched.body)) {
      const retry = await patchLotRow(lotId, { fulfillment });
      if (!retry.ok && /fulfillment/i.test(retry.body)) {
        throw new Error("Run the win fulfillment SQL in the Supabase SQL editor, then try again.");
      }
      if (!retry.ok) throw new Error(retry.body || "Could not save delivery choice.");
    } else if (!patched.ok) {
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
        record.shippingCost = shippingCost;
        if (address) record.address = address;
        const fees = invoiceFees({
          hammer: record.lots.reduce((sum, lot) => sum + Number(lot.hammer ?? 0), 0),
          fulfillment,
          shippingCost,
        });
        record.hammer = fees.hammer;
        record.premium = fees.premium;
        record.handling = fees.handling;
        record.gst = fees.gst;
        record.total = fees.total;
        await upsertSettlementInvoice(supabase, record);
      }
    }
    return { fulfillment, shippingCost };
  }

  const demo = getDemoLot(lotId);
  if (demo) {
    demo.fulfillment = fulfillment;
    demo.shippingCost = shippingCost;
  }
  return { fulfillment, shippingCost };
}
