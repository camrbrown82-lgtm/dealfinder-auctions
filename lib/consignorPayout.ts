import { agreementCommission } from "@/lib/commission";
import { isHouseConsignor } from "@/lib/consignors";
import { consignorContact } from "@/lib/consignorSold";
import { sendConsignorPayoutSentEmail } from "@/lib/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AuctionLot } from "@/lib/utils";

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function claimPayoutMail(supabase: Admin, lotId: string) {
  const id = `consignor_paid_${lotId}`.slice(0, 80);
  const { data: existing } = await supabase.from("email_settings").select("id").eq("id", id).maybeSingle();
  if (existing) return null;
  const { error } = await supabase
    .from("email_settings")
    .insert({ id, logo_data_url: new Date().toISOString() })
    .select("id");
  if (error) return null;
  return id;
}

/**
 * Marks a sold lot as paid to the consignor and emails the receipt once.
 * Safe to call twice — the second time only reports that it was already sent.
 */
export async function markConsignorPayoutSent(
  lot: AuctionLot,
  input: { method?: string; reference?: string } = {},
) {
  if (isHouseConsignor(lot.consignor)) return { sent: false, reason: "house" as const };
  const hammer = Number(lot.currentBid ?? 0);
  if (!(hammer > 0)) return { sent: false, reason: "no-hammer" as const };
  if (lot.payoutSentAt) return { sent: false, reason: "already-sent" as const };

  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return { sent: false, reason: "no-db" as const };

  const split = agreementCommission(hammer);
  const payout = lot.payoutAmount && lot.payoutAmount > 0 ? lot.payoutAmount : (split?.consignor ?? hammer);
  const method = (input.method || lot.payoutMethod || "e-transfer").trim();
  const reference = (input.reference || lot.payoutReference || "").trim();
  const sentAt = new Date().toISOString();

  const { error } = await supabase
    .from("lots")
    .update({
      payout_sent_at: sentAt,
      payout_amount: payout,
      payout_method: method,
      payout_reference: reference,
    })
    .eq("id", lot.id);
  if (error) return { sent: false, reason: "write-failed" as const, error: error.message };

  const contact = await consignorContact(supabase, lot);
  if (!contact) return { sent: true, mailed: false, reason: "no-email" as const };

  const claim = await claimPayoutMail(supabase, lot.id);
  if (!claim) return { sent: true, mailed: false, reason: "already-sent" as const };

  const result = await sendConsignorPayoutSentEmail({
    to: contact.email,
    name: contact.name || "Consignor",
    title: lot.title,
    lotNumber: lot.lotNumber ?? null,
    hammer,
    commissionLabel: split?.label ?? "—",
    houseCut: split?.house ?? 0,
    payout,
    method,
    reference,
    charity: contact.charity,
  });
  if (!result.ok) {
    await supabase.from("email_settings").delete().eq("id", claim);
    return { sent: true, mailed: false, reason: "send-failed" as const };
  }
  return { sent: true, mailed: true, to: contact.email };
}
