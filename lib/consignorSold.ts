import { agreementCommission } from "@/lib/commission";
import { isHouseConsignor } from "@/lib/consignors";
import { sendConsignorSoldEmail } from "@/lib/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AuctionLot } from "@/lib/utils";

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type Contact = { email: string; name: string; charity: boolean };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function asContact(email: unknown, name: unknown, charity: unknown): Contact | null {
  const address = clean(email).toLowerCase();
  if (!address.includes("@")) return null;
  return { email: address, name: clean(name), charity: charity === true };
}

async function profileEmail(supabase: Admin, ownerId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", ownerId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Who to tell. The consignment row that produced the lot is the reliable link,
 * because it carries the submitter's email and account id. Matching on the
 * consignor name is the last resort and is only trusted when exactly one
 * account answers to it — a shared name must never route someone else's money
 * statement to the wrong inbox.
 */
export async function consignorContact(supabase: Admin, lot: AuctionLot): Promise<Contact | null> {
  if (lot.consignmentId) {
    const { data } = await supabase
      .from("consignments")
      .select("contact_email, owner_id, consignor_name, is_charity")
      .eq("id", lot.consignmentId)
      .maybeSingle();
    if (data) {
      const direct = asContact(data.contact_email, data.consignor_name || lot.consignor, data.is_charity);
      if (direct) return direct;
      const ownerId = clean(data.owner_id);
      if (ownerId) {
        const owner = await profileEmail(supabase, ownerId);
        const viaOwner = asContact(owner?.email, owner?.full_name || lot.consignor, data.is_charity);
        if (viaOwner) return viaOwner;
      }
    }
  }

  const name = clean(lot.consignor);
  if (!name) return null;

  const { data: rows } = await supabase
    .from("consignments")
    .select("contact_email, owner_id, consignor_name, is_charity, created_at")
    .eq("consignor_name", name)
    .order("created_at", { ascending: false });
  for (const row of rows ?? []) {
    const match = asContact(row.contact_email, row.consignor_name || name, row.is_charity);
    if (match) return match;
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("full_name", name);
  if ((profiles ?? []).length === 1) {
    return asContact(profiles![0].email, profiles![0].full_name || name, false);
  }
  return null;
}

/** Reuses the email_settings claim pattern so a lot is only announced once. */
async function claimSend(supabase: Admin, lotId: string) {
  const id = `consignor_sold_${lotId}`.slice(0, 80);
  const { data: existing } = await supabase
    .from("email_settings")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (existing) return null;
  const { error } = await supabase
    .from("email_settings")
    .insert({ id, logo_data_url: new Date().toISOString() })
    .select("id");
  if (error) return null;
  return id;
}

/**
 * Sends the consignor their sold notice with the agreement split. Safe to call
 * on every recorded sale: house stock is skipped and each lot sends once.
 */
export async function notifyConsignorSold(lot: AuctionLot) {
  if (isHouseConsignor(lot.consignor)) return { sent: false, reason: "house" as const };
  const hammer = Number(lot.currentBid ?? 0);
  if (!(hammer > 0)) return { sent: false, reason: "no-hammer" as const };

  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return { sent: false, reason: "no-db" as const };

  const contact = await consignorContact(supabase, lot);
  if (!contact) return { sent: false, reason: "no-email" as const };

  const claim = await claimSend(supabase, lot.id);
  if (!claim) return { sent: false, reason: "already-sent" as const };

  const split = agreementCommission(hammer);
  const result = await sendConsignorSoldEmail({
    to: contact.email,
    name: contact.name || "Consignor",
    title: lot.title,
    lotNumber: lot.lotNumber ?? null,
    hammer,
    commissionLabel: split?.label ?? "—",
    houseCut: split?.house ?? 0,
    payout: split?.consignor ?? hammer,
    charity: contact.charity,
    source: lot.saleSource === "buy_now" || lot.buyNowStatus === "sold" ? "buy_now" : "bid",
  });
  if (!result.ok) {
    // Let a later close retry instead of swallowing the notice.
    await supabase.from("email_settings").delete().eq("id", claim);
    return { sent: false, reason: "send-failed" as const };
  }
  return { sent: true, to: contact.email };
}
