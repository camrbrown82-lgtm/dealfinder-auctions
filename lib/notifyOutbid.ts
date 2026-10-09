import { sendOutbidEmail } from "@/lib/notify";
import { claimOutbidNotice, endsWithinHours, outbidNoticeId, releaseOutbidNotice } from "@/lib/outbidNotice";
import { getDemoUser, listDemoUsers } from "@/lib/demoUsers";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

async function contactFor(idOrName: string | null | undefined) {
  if (!idOrName) return null;
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const byId = await supabase.from("profiles").select("email, full_name").eq("id", idOrName).maybeSingle();
    if (byId.data?.email) {
      return { email: String(byId.data.email), name: String(byId.data.full_name || idOrName) };
    }
    const byName = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("full_name", idOrName)
      .maybeSingle();
    if (byName.data?.email) {
      return { email: String(byName.data.email), name: String(byName.data.full_name || idOrName) };
    }
  }
  const demo =
    getDemoUser(idOrName) ||
    listDemoUsers().find((row) => row.fullName === idOrName || row.email === idOrName);
  if (demo?.email) return { email: demo.email, name: demo.fullName };
  if (idOrName.includes("@")) return { email: idOrName, name: idOrName };
  return null;
}

export async function notifyOutbid(input: {
  previousBidderId?: string | null;
  previousBidderName?: string | null;
  nextBidderId?: string | null;
  nextBidderName?: string | null;
  title: string;
  currentBid: number;
  lotId: string;
  slug?: string | null;
  endsAt?: string | null;
}) {
  const prevKey = input.previousBidderId || input.previousBidderName;
  if (!prevKey) return;
  if (input.nextBidderId && input.previousBidderId && input.nextBidderId === input.previousBidderId) {
    return;
  }
  const previousName = String(input.previousBidderName ?? "").trim().toLowerCase();
  const nextName = String(input.nextBidderName ?? "").trim().toLowerCase();
  if (previousName && nextName && previousName === nextName) return;

  const bidderKey = input.previousBidderId || `name:${input.previousBidderName}`;
  const closing = endsWithinHours(input.endsAt);
  const firstId = outbidNoticeId("first", input.lotId, bidderKey);
  const closeId = outbidNoticeId("close", input.lotId, bidderKey);
  if (closing) {
    const claimed = await claimOutbidNotice(closeId);
    if (!claimed) return;
    await claimOutbidNotice(firstId);
  } else {
    const claimed = await claimOutbidNotice(firstId);
    if (!claimed) return;
  }

  const contact = await contactFor(input.previousBidderId || input.previousBidderName);
  if (!contact) {
    if (closing) await releaseOutbidNotice(closeId);
    else await releaseOutbidNotice(firstId);
    return;
  }
  void sendOutbidEmail({
    to: contact.email,
    name: contact.name,
    title: input.title,
    currentBid: input.currentBid,
    lotId: input.lotId,
    slug: input.slug,
    closing,
  });
}
