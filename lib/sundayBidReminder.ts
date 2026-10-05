import { absoluteUrl } from "@/lib/seo";
import { houseDateKey, isSundayBidReminderWindow } from "@/lib/auctionEndDay";
import { sendTransactionalEmail } from "@/lib/transactionalEmail";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

const SENT_ROW = "sunday_bid_reminder";

export type BidReminderResult = {
  ok: boolean;
  skipped?: string;
  date?: string;
  recipients?: number;
  sent?: number;
  failed?: number;
};

function displayName(value: string | null | undefined) {
  const name = String(value ?? "").trim();
  return name || "there";
}

async function listContacts() {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return [];
  const contacts = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("profiles")
      .select("email, full_name, status")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.status === "suspended") continue;
      const email = String(row.email ?? "").trim().toLowerCase();
      if (!email.includes("@")) continue;
      if (!contacts.has(email)) contacts.set(email, displayName(row.full_name));
    }
    if (!data || data.length < 1000) break;
  }
  return Array.from(contacts, ([email, name]) => ({ email, name }));
}

/** Returns true when this invocation owns today's send. */
async function claimToday(date: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const existing = await supabase
    .from("email_settings")
    .select("logo_data_url")
    .eq("id", SENT_ROW)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.logo_data_url === date) return false;

  if (!existing.data) {
    const inserted = await supabase
      .from("email_settings")
      .insert({ id: SENT_ROW, logo_data_url: date })
      .select("id");
    if (!inserted.error) return true;
    if (!/duplicate|unique/i.test(inserted.error.message)) throw new Error(inserted.error.message);
    return false;
  }

  const updated = await supabase
    .from("email_settings")
    .update({ logo_data_url: date, updated_at: new Date().toISOString() })
    .eq("id", SENT_ROW)
    .neq("logo_data_url", date)
    .select("id");
  if (updated.error) throw new Error(updated.error.message);
  return (updated.data?.length ?? 0) > 0;
}

async function releaseClaim(date: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from("email_settings")
    .update({ logo_data_url: "" })
    .eq("id", SENT_ROW)
    .eq("logo_data_url", date);
}

export async function sendSundayBidReminders(now = new Date()): Promise<BidReminderResult> {
  if (!isSundayBidReminderWindow(now)) {
    return { ok: true, skipped: "outside-window" };
  }
  if (!isSupabaseConfigured || !getSupabaseAdmin()) {
    return { ok: false, skipped: "no-database" };
  }

  const date = houseDateKey(now);
  const claimed = await claimToday(date);
  if (!claimed) return { ok: true, skipped: "already-sent", date };

  let contacts: Awaited<ReturnType<typeof listContacts>>;
  try {
    contacts = await listContacts();
  } catch (error) {
    await releaseClaim(date);
    throw error;
  }
  const lotLink = absoluteUrl("/live");
  let sent = 0;
  let failed = 0;

  for (let index = 0; index < contacts.length; index += 5) {
    const chunk = contacts.slice(index, index + 5);
    const results = await Promise.all(
      chunk.map((contact) =>
        sendTransactionalEmail({
          templateId: "sunday_bid_reminder",
          to: contact.email,
          forceDeliver: true,
          vars: {
            customer_name: contact.name,
            lot_link: lotLink,
            item_title: "Sunday sale",
            winning_bid: "",
            payment_link: lotLink,
          },
        }),
      ),
    );
    for (const result of results) {
      if (result.ok && result.mode === "resend") sent += 1;
      else failed += 1;
    }
  }

  if (contacts.length > 0 && sent === 0) {
    await releaseClaim(date);
    return { ok: false, date, recipients: contacts.length, sent, failed };
  }

  return { ok: true, date, recipients: contacts.length, sent, failed };
}
