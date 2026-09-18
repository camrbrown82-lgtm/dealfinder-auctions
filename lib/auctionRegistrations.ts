import { loadBidderPayment, persistBidderPreauth, persistTermsAgreement } from "@/lib/helcim";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { updateDemoUser } from "@/lib/demoUsers";

export type BidAuthStatus = "none" | "pending" | "approved" | "rejected";
export type BidPaymentKind = "helcim" | "cash" | null;

export type AuctionRegistration = {
  userId: string;
  eventId: string;
  termsAgreedAt: string;
  preauthAgreedAt: string;
  paymentMethod: BidPaymentKind;
  authStatus: BidAuthStatus;
};

export type BidAuthDecision = {
  ok: boolean;
  registered: boolean;
  authorized: boolean;
  authStatus: BidAuthStatus;
  paymentMethod: BidPaymentKind;
  trustedCash: boolean;
  preauthHeld: boolean;
  code?: "AUCTION_TERMS_REQUIRED" | "BID_AUTH_REQUIRED" | "CASH_PENDING";
  error?: string;
};

export type CashAuthRequest = {
  userId: string;
  eventId: string;
  fullName: string;
  email: string;
  auctionLabel: string;
  requestedAt: string;
  authStatus: BidAuthStatus;
  trustedCash: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __dealfinderAuctionRegs: Map<string, AuctionRegistration> | undefined;
  // eslint-disable-next-line no-var
  var __dealfinderTrustedCash: Set<string> | undefined;
}

function key(userId: string, eventId: string) {
  return `${userId}:${eventId}`;
}

function memory() {
  if (!globalThis.__dealfinderAuctionRegs) {
    globalThis.__dealfinderAuctionRegs = new Map();
  }
  return globalThis.__dealfinderAuctionRegs;
}

function trustedMemory() {
  if (!globalThis.__dealfinderTrustedCash) {
    globalThis.__dealfinderTrustedCash = new Set();
  }
  return globalThis.__dealfinderTrustedCash;
}

function mapRow(row: {
  user_id?: string;
  event_id?: string;
  terms_agreed_at?: string;
  preauth_agreed_at?: string;
  payment_method?: string | null;
  auth_status?: string | null;
}): AuctionRegistration {
  const method = row.payment_method === "cash" || row.payment_method === "helcim" ? row.payment_method : null;
  const status: BidAuthStatus =
    row.auth_status === "pending" || row.auth_status === "approved" || row.auth_status === "rejected"
      ? row.auth_status
      : "none";
  return {
    userId: String(row.user_id ?? ""),
    eventId: String(row.event_id ?? ""),
    termsAgreedAt: String(row.terms_agreed_at ?? ""),
    preauthAgreedAt: String(row.preauth_agreed_at ?? ""),
    paymentMethod: method,
    authStatus: status,
  };
}

export async function isTrustedCashUser(userId: string) {
  if (trustedMemory().has(userId)) return true;
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return false;
  const { data, error } = await supabase
    .from("profiles")
    .select("trusted_cash_user")
    .eq("id", userId)
    .maybeSingle();
  if (error && /trusted_cash_user/i.test(error.message)) return false;
  return Boolean(data?.trusted_cash_user);
}

export async function setTrustedCashUser(userId: string, trusted: boolean) {
  if (trusted) trustedMemory().add(userId);
  else trustedMemory().delete(userId);
  updateDemoUser(userId, { trustedCashUser: trusted });
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from("profiles").update({ trusted_cash_user: trusted }).eq("id", userId);
  if (error && /trusted_cash_user/i.test(error.message)) return;
  if (error) throw new Error(error.message);
}

export async function getAuctionRegistration(userId: string, eventId: string) {
  const local = memory().get(key(userId, eventId));
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return local ?? null;
  const { data, error } = await supabase
    .from("auction_registrations")
    .select("user_id, event_id, terms_agreed_at, preauth_agreed_at, payment_method, auth_status")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error && /auction_registrations|schema cache|does not exist|payment_method|auth_status/i.test(error.message)) {
    return local ?? null;
  }
  if (data) {
    const mapped = mapRow(data);
    memory().set(key(userId, eventId), mapped);
    return mapped;
  }
  return local ?? null;
}

export async function hasAuctionRegistration(userId: string, eventId: string) {
  return Boolean(await getAuctionRegistration(userId, eventId));
}

export async function saveAuctionRegistration(userId: string, eventId: string) {
  const now = new Date().toISOString();
  const existing = await getAuctionRegistration(userId, eventId);
  const row: AuctionRegistration = {
    userId,
    eventId,
    termsAgreedAt: existing?.termsAgreedAt || now,
    preauthAgreedAt: now,
    paymentMethod: existing?.paymentMethod ?? null,
    authStatus: existing?.authStatus ?? "none",
  };
  memory().set(key(userId, eventId), row);
  await persistTermsAgreement(userId, true);

  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return row;
  const payload: Record<string, unknown> = {
    user_id: userId,
    event_id: eventId,
    terms_agreed_at: row.termsAgreedAt,
    preauth_agreed_at: row.preauthAgreedAt,
    payment_method: row.paymentMethod,
    auth_status: row.authStatus,
  };
  let { error } = await supabase.from("auction_registrations").upsert(payload, { onConflict: "user_id,event_id" });
  if (error && /payment_method|auth_status/i.test(error.message)) {
    const { payment_method: _p, auth_status: _a, ...rest } = payload;
    ({ error } = await supabase.from("auction_registrations").upsert(rest, { onConflict: "user_id,event_id" }));
  }
  if (error && /auction_registrations|schema cache|does not exist/i.test(error.message)) {
    return row;
  }
  if (error) throw new Error(error.message);
  return row;
}

async function persistAuth(
  userId: string,
  eventId: string,
  patch: { paymentMethod: BidPaymentKind; authStatus: BidAuthStatus },
) {
  const existing = (await getAuctionRegistration(userId, eventId)) ?? (await saveAuctionRegistration(userId, eventId));
  const row: AuctionRegistration = {
    ...existing,
    paymentMethod: patch.paymentMethod,
    authStatus: patch.authStatus,
  };
  memory().set(key(userId, eventId), row);
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return row;
  const { error } = await supabase
    .from("auction_registrations")
    .update({
      payment_method: row.paymentMethod,
      auth_status: row.authStatus,
    })
    .eq("user_id", userId)
    .eq("event_id", eventId);
  if (error && /payment_method|auth_status|schema cache|does not exist/i.test(error.message)) {
    return row;
  }
  if (error) throw new Error(error.message);
  return row;
}

export async function approveHelcimBidAuth(userId: string, eventId?: string | null) {
  await persistBidderPreauth(userId, { status: "held" });
  if (eventId) {
    const existing = await getAuctionRegistration(userId, eventId);
    if (!existing) await saveAuctionRegistration(userId, eventId);
    await persistAuth(userId, eventId, { paymentMethod: "helcim", authStatus: "approved" });
  }
}

export async function requestCashBidAuth(userId: string, eventId: string) {
  const trusted = await isTrustedCashUser(userId);
  const existing = await getAuctionRegistration(userId, eventId);
  if (!existing) await saveAuctionRegistration(userId, eventId);
  if (trusted) {
    const row = await persistAuth(userId, eventId, { paymentMethod: "cash", authStatus: "approved" });
    return { row, created: false, autoApproved: true as const };
  }
  if (existing?.authStatus === "pending") {
    return { row: existing, created: false, autoApproved: false as const };
  }
  const row = await persistAuth(userId, eventId, { paymentMethod: "cash", authStatus: "pending" });
  return { row, created: true, autoApproved: false as const };
}

export async function decideCashBidAuth(
  userId: string,
  eventId: string,
  decision: "approve_auction" | "approve_permanent" | "reject",
) {
  if (decision === "reject") {
    return persistAuth(userId, eventId, { paymentMethod: "cash", authStatus: "rejected" });
  }
  if (decision === "approve_permanent") {
    await setTrustedCashUser(userId, true);
  }
  return persistAuth(userId, eventId, { paymentMethod: "cash", authStatus: "approved" });
}

export async function evaluateBidAuth(userId: string, eventId: string | null | undefined): Promise<BidAuthDecision> {
  if (!eventId) {
    return {
      ok: false,
      registered: false,
      authorized: false,
      authStatus: "none",
      paymentMethod: null,
      trustedCash: false,
      preauthHeld: false,
      code: "AUCTION_TERMS_REQUIRED",
      error: "This lot is not filed in an auction yet.",
    };
  }
  const registration = await getAuctionRegistration(userId, eventId);
  const trustedCash = await isTrustedCashUser(userId);
  const payment = await loadBidderPayment(userId);
  const preauthHeld = payment.preauthStatus === "held";
  const registered = Boolean(registration);
  const auctionApproved = registration?.authStatus === "approved";
  const authorized = trustedCash || preauthHeld || auctionApproved;
  if (!registered) {
    return {
      ok: false,
      registered: false,
      authorized: false,
      authStatus: "none",
      paymentMethod: null,
      trustedCash,
      preauthHeld,
      code: "AUCTION_TERMS_REQUIRED",
      error: "Agree to this auction's terms before placing a paddle.",
    };
  }
  if (authorized) {
    return {
      ok: true,
      registered: true,
      authorized: true,
      authStatus: auctionApproved ? "approved" : trustedCash ? "approved" : "approved",
      paymentMethod: preauthHeld ? "helcim" : registration?.paymentMethod ?? (trustedCash ? "cash" : "helcim"),
      trustedCash,
      preauthHeld,
    };
  }
  if (registration?.authStatus === "pending") {
    return {
      ok: false,
      registered: true,
      authorized: false,
      authStatus: "pending",
      paymentMethod: "cash",
      trustedCash,
      preauthHeld,
      code: "CASH_PENDING",
      error: "Cash pickup is waiting on desk approval. You cannot bid until it is approved.",
    };
  }
  return {
    ok: false,
    registered: true,
    authorized: false,
    authStatus: registration?.authStatus ?? "none",
    paymentMethod: registration?.paymentMethod ?? null,
    trustedCash,
    preauthHeld,
    code: "BID_AUTH_REQUIRED",
    error: "Authorize a $50 Helcim hold or request cash-on-pickup before bidding.",
  };
}

export async function listPendingCashAuthRequests(): Promise<CashAuthRequest[]> {
  const supabase = getSupabaseAdmin();
  const local = Array.from(memory().values()).filter((row) => row.authStatus === "pending");
  if (!isSupabaseConfigured || !supabase) {
    return local.map((row) => ({
      userId: row.userId,
      eventId: row.eventId,
      fullName: "",
      email: "",
      auctionLabel: row.eventId,
      requestedAt: row.preauthAgreedAt,
      authStatus: row.authStatus,
      trustedCash: trustedMemory().has(row.userId),
    }));
  }
  const { data, error } = await supabase
    .from("auction_registrations")
    .select("user_id, event_id, preauth_agreed_at, auth_status, payment_method")
    .eq("auth_status", "pending")
    .eq("payment_method", "cash")
    .order("preauth_agreed_at", { ascending: false });
  const rows = error ? local : (data ?? []).map(mapRow);
  const seen = new Set(rows.map((row) => key(row.userId, row.eventId)));
  for (const row of local) {
    if (row.authStatus === "pending" && !seen.has(key(row.userId, row.eventId))) rows.push(row);
  }
  const userIds = Array.from(new Set(rows.map((row) => row.userId)));
  const eventIds = Array.from(new Set(rows.map((row) => row.eventId)));
  const [{ data: profiles }, { data: events }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, full_name, email, trusted_cash_user").in("id", userIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    eventIds.length
      ? supabase.from("auction_events").select("id, name, auction_number").in("id", eventIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const profileById = new Map((profiles ?? []).map((row) => [String(row.id), row]));
  const eventById = new Map((events ?? []).map((row) => [String(row.id), row]));
  return rows.map((row) => {
    const profile = profileById.get(row.userId);
    const event = eventById.get(row.eventId);
    const auctionNumber = event?.auction_number ? String(event.auction_number) : "";
    const name = event?.name ? String(event.name) : "";
    return {
      userId: row.userId,
      eventId: row.eventId,
      fullName: String(profile?.full_name ?? ""),
      email: String(profile?.email ?? ""),
      auctionLabel: [auctionNumber, name].filter(Boolean).join(" · ") || row.eventId,
      requestedAt: row.preauthAgreedAt,
      authStatus: row.authStatus,
      trustedCash: Boolean(profile?.trusted_cash_user) || trustedMemory().has(row.userId),
    };
  });
}

export async function listAuctionRegistrations(eventId: string) {
  const local = Array.from(memory().values()).filter((row) => row.eventId === eventId);
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return local;
  const { data, error } = await supabase
    .from("auction_registrations")
    .select("user_id, event_id, terms_agreed_at, preauth_agreed_at, payment_method, auth_status")
    .eq("event_id", eventId);
  if (error || !data) return local;
  const mapped = data.map(mapRow);
  const seen = new Set(mapped.map((row) => row.userId));
  for (const row of local) {
    if (!seen.has(row.userId)) mapped.push(row);
  }
  return mapped;
}
