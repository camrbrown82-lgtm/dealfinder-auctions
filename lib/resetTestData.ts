import { getAdminDemo } from "@/lib/demoAdminStore";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

/** Children first so foreign keys never block a delete. Media, email templates,
 *  bidder accounts, and house settings are left alone. */
const TABLES: Array<{ table: string; key: string }> = [
  { table: "bids", key: "id" },
  { table: "absentee_bids", key: "id" },
  { table: "pending_invoice_items", key: "id" },
  { table: "settlement_invoices", key: "id" },
  { table: "settlement_archives", key: "id" },
  { table: "auction_registrations", key: "user_id" },
  { table: "helcim_sessions", key: "checkout_token" },
  { table: "helcim_transactions", key: "id" },
  { table: "lots", key: "id" },
  { table: "consignments", key: "id" },
  { table: "auction_events", key: "id" },
];

/** Clears every lot, bid, consignment, invoice, settled deal, and sale week in
 *  every auction so the floor can be tested from scratch. */
export async function resetAuctionData() {
  const cleared: Record<string, number> = {};
  const failed: Record<string, string> = {};
  const supabase = getSupabaseAdmin();

  if (isSupabaseConfigured && supabase) {
    for (const { table, key } of TABLES) {
      const before = await supabase.from(table).select(key, { count: "exact", head: true });
      if (before.error) {
        failed[table] = before.error.message;
        continue;
      }
      const removed = await supabase.from(table).delete().not(key, "is", null);
      if (removed.error) failed[table] = removed.error.message;
      const after = await supabase.from(table).select(key, { count: "exact", head: true });
      cleared[table] = Math.max(0, Number(before.count ?? 0) - Number(after.count ?? 0));
      if (Number(after.count ?? 0) > 0) {
        failed[table] = `${after.count} rows left behind`;
      }
    }
    // Accounts stay, but their $50 hold goes back to square one.
    await supabase
      .from("profiles")
      .update({ preauth_status: "none", preauth_transaction_id: null })
      .not("id", "is", null);
    await supabase.from("house_desk_settings").update({ next_lot_seq: 1 }).eq("id", 1);
    await supabase.from("email_settings").delete().like("id", "hold_warn_%");
    await supabase.from("email_settings").delete().like("id", "%bid_reminder%");
  }

  const demo = getAdminDemo();
  demo.inventory = [];
  demo.queue = [];
  demo.events = [];

  return {
    cleared,
    failed: Object.keys(failed).length ? failed : undefined,
    source: isSupabaseConfigured ? "supabase" : "demo",
  };
}
