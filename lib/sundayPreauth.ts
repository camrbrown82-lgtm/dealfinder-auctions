import { isAuctionEndDay, isPastSundayHammer, lotEndsOnAuctionDay } from "@/lib/auctionEndDay";
import { listDemoLots } from "@/lib/demoAuctionStore";
import { listDemoUsers } from "@/lib/demoUsers";
import { forfeitBidderBids } from "@/lib/forfeitBids";
import {
  clientIp,
  helcimCurrency,
  isHelcimConfigured,
  loadBidderPayment,
  persistBidderPreauth,
  preauthAmount,
  processPreauthWithToken,
  recordHelcimTransaction,
} from "@/lib/helcim";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export type SundayBidder = {
  id: string;
  name: string;
};

function unpaidHighLots() {
  return listDemoLots().filter((lot) => Boolean(lot.highBidderId || lot.highBidder) && !lot.paidAt);
}

async function highBidders(): Promise<SundayBidder[]> {
  const seen = new Map<string, SundayBidder>();
  for (const lot of unpaidHighLots()) {
    const id = lot.highBidderId || lot.highBidder;
    if (!id) continue;
    if (!seen.has(id)) seen.set(id, { id, name: lot.highBidder || id });
  }
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return Array.from(seen.values());
  const { data } = await supabase
    .from("lots")
    .select("id, high_bidder, high_bidder_id, ends_at, status, paid_at")
    .neq("status", "removed");
  for (const row of data ?? []) {
    if (row.paid_at) continue;
    if (!row.high_bidder_id && !row.high_bidder) continue;
    if (row.ends_at && !lotEndsOnAuctionDay(String(row.ends_at)) && row.status !== "live") continue;
    const id = String(row.high_bidder_id || row.high_bidder);
    if (!seen.has(id)) seen.set(id, { id, name: String(row.high_bidder || id) });
  }
  return Array.from(seen.values());
}

export async function bidderNeedsSundayPreauth(userId: string, fullName?: string | null) {
  if (!isAuctionEndDay()) return { needed: false, lots: 0 };
  const payment = await loadBidderPayment(userId);
  if (payment.preauthStatus === "held") return { needed: false, lots: 0 };
  const bidders = await highBidders();
  const mine = bidders.filter((row) => row.id === userId || (fullName && row.name === fullName));
  return { needed: mine.length > 0, lots: mine.length };
}

export async function denySundayPreauth(userId: string, fullName?: string | null) {
  await persistBidderPreauth(userId, { status: "denied" });
  const lots = await forfeitBidderBids(userId, fullName);
  await recordHelcimTransaction({
    bidderId: userId,
    purpose: "sunday_preauth_denied",
    amount: preauthAmount(),
    currency: helcimCurrency(),
    status: "DENIED",
  });
  return lots;
}

export async function runSundayPreauthSweep(ipAddress: string) {
  if (!isAuctionEndDay()) {
    return { ran: false, processed: 0, held: 0, forfeited: 0 };
  }
  const bidders = await highBidders();
  let held = 0;
  let forfeited = 0;
  const forfeitUnheld = isPastSundayHammer();

  for (const bidder of bidders) {
    const demo = listDemoUsers().find((row) => row.id === bidder.id || row.fullName === bidder.name);
    const userId = demo?.id || bidder.id;
    const payment = await loadBidderPayment(userId);
    if (payment.preauthStatus === "held") continue;

    if (payment.helcimCardToken && isHelcimConfigured()) {
      try {
        const txn = await processPreauthWithToken({
          cardToken: payment.helcimCardToken,
          customerCode: payment.helcimCustomerCode,
          ipAddress,
          invoiceNumber: `DF-SUN-${userId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}`,
        });
        const status = String(txn.status || "").toUpperCase();
        if (status === "DECLINED") throw new Error("declined");
        await persistBidderPreauth(userId, {
          status: "held",
          transactionId: txn.transactionId ? String(txn.transactionId) : `helcim-${Date.now()}`,
          cardToken: payment.helcimCardToken,
          customerCode: payment.helcimCustomerCode,
        });
        await recordHelcimTransaction({
          bidderId: userId,
          purpose: "sunday_preauth",
          transactionId: txn.transactionId ? String(txn.transactionId) : null,
          cardToken: payment.helcimCardToken,
          amount: preauthAmount(),
          currency: helcimCurrency(),
          status: "APPROVED",
          raw: txn,
        });
        held += 1;
        continue;
      } catch {
        await denySundayPreauth(userId, bidder.name);
        forfeited += 1;
        continue;
      }
    }

    if (forfeitUnheld) {
      await denySundayPreauth(userId, bidder.name);
      forfeited += 1;
    }
  }

  return { ran: true, processed: bidders.length, held, forfeited };
}

export function sweepIp(request: { headers: { get(name: string): string | null } }) {
  return clientIp(request);
}
