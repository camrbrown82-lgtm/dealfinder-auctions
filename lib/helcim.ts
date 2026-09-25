import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { BID_PREAUTH_AMOUNT } from "@/lib/helcimCopy";
import { markDemoLotPaid } from "@/lib/demoAuctionStore";
import { getDemoUser, updateDemoUser } from "@/lib/demoUsers";
import type { BidderProfile, PreauthStatus } from "@/lib/profileTypes";
import { isPreauthStatus } from "@/lib/profileTypes";
import { isPaymentTestMode } from "@/lib/paymentMode";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export type HelcimPurpose = "bid_preauth" | "checkout_purchase";

export type HelcimSession = {
  checkoutToken: string;
  secretToken: string;
  bidderId: string;
  purpose: HelcimPurpose;
  lotId: string | null;
  eventId?: string | null;
  amount: number;
  currency: string;
  invoiceNumber: string;
  demo: boolean;
  createdAt: string;
};

export type HelcimTxnPayload = {
  transactionId?: string | number;
  cardToken?: string;
  customerCode?: string;
  cardHolderName?: string;
  amount?: string | number;
  currency?: string;
  status?: string;
  type?: string;
  approvalCode?: string;
  invoiceNumber?: string;
  [key: string]: unknown;
};

declare global {
  // eslint-disable-next-line no-var
  var __dealfinderHelcimSessions: Map<string, HelcimSession> | undefined;
  // eslint-disable-next-line no-var
  var __dealfinderHelcimLotPaid: Map<string, { transactionId: string; paidAt: string }> | undefined;
  // eslint-disable-next-line no-var
  var __dealfinderHelcimPreauth: Map<string, {
    status: PreauthStatus;
    transactionId: string | null;
    cardToken: string | null;
    customerCode: string | null;
    amount: number;
  }> | undefined;
  // eslint-disable-next-line no-var
  var __dealfinderHelcimTerms: Map<string, boolean> | undefined;
}

function sessionStore() {
  if (!globalThis.__dealfinderHelcimSessions) {
    globalThis.__dealfinderHelcimSessions = new Map();
  }
  return globalThis.__dealfinderHelcimSessions;
}

function paidStore() {
  if (!globalThis.__dealfinderHelcimLotPaid) {
    globalThis.__dealfinderHelcimLotPaid = new Map();
  }
  return globalThis.__dealfinderHelcimLotPaid;
}

function preauthMemory() {
  if (!globalThis.__dealfinderHelcimPreauth) {
    globalThis.__dealfinderHelcimPreauth = new Map();
  }
  return globalThis.__dealfinderHelcimPreauth;
}

function termsMemory() {
  if (!globalThis.__dealfinderHelcimTerms) {
    globalThis.__dealfinderHelcimTerms = new Map();
  }
  return globalThis.__dealfinderHelcimTerms;
}

export function helcimApiBase() {
  const raw = (process.env.HELCIM_API_BASE_URL || "https://api.helcim.test/v2").trim().replace(/\/$/, "");
  return raw.endsWith("/v2") ? raw : `${raw}/v2`;
}

export function helcimApiToken() {
  return (process.env.HELCIM_API_TOKEN || "").trim();
}

export function helcimCurrency() {
  return (process.env.HELCIM_CURRENCY || "CAD").trim().toUpperCase() || "CAD";
}

export function isHelcimConfigured() {
  if (isPaymentTestMode()) return false;
  return Boolean(helcimApiToken());
}

export function preauthAmount() {
  const n = Number(process.env.HELCIM_BID_PREAUTH_AMOUNT || BID_PREAUTH_AMOUNT);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export function clientIp(request: { headers: { get(name: string): string | null } }) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "127.0.0.1";
  return request.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

function compactJson(value: unknown) {
  return JSON.stringify(value);
}

export function helcimHashMatches(data: unknown, hash: string, secretToken: string) {
  if (!hash || !secretToken) return false;
  const digest = createHash("sha256").update(compactJson(data) + secretToken).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function helcimFetch(path: string, init: RequestInit & { idempotency?: boolean } = {}) {
  const token = helcimApiToken();
  if (!token) {
    throw new Error("Helcim is not configured. Add HELCIM_API_TOKEN to .env.local.");
  }
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  headers.set("api-token", token);
  if (init.idempotency) {
    headers.set("idempotency-key", randomUUID());
  }
  const response = await fetch(`${helcimApiBase()}${path}`, { ...init, headers });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    let message = text || `Helcim HTTP ${response.status}`;
    if (json && typeof json === "object") {
      const row = json as { message?: unknown; error?: unknown; errors?: unknown };
      if (Array.isArray(row.errors) && row.errors.length) {
        message = row.errors
          .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
          .join(" ");
      } else if (typeof row.message === "string" && row.message.trim()) message = row.message;
      else if (typeof row.error === "string" && row.error.trim()) message = row.error;
    }
    throw new Error(message);
  }
  return json;
}

export async function initializeHelcimCheckout(input: {
  paymentType: "preauth" | "purchase";
  amount: number;
  currency?: string;
  invoiceNumber?: string;
  customerCode?: string | null;
}) {
  const body: Record<string, unknown> = {
    paymentType: input.paymentType,
    amount: Number(input.amount.toFixed(2)),
    currency: input.currency || helcimCurrency(),
    paymentMethod: "cc",
    language: "en",
  };
  // Helcim treats invoiceNumber / customerCode as existing Helcim records.
  // Our DF-HOLD ids are local only; sending them makes initialize return 400.
  const json = (await helcimFetch("/helcim-pay/initialize", {
    method: "POST",
    body: JSON.stringify(body),
  })) as { checkoutToken?: string; secretToken?: string };
  if (!json.checkoutToken || !json.secretToken) {
    throw new Error("Helcim did not return checkout tokens.");
  }
  return { checkoutToken: json.checkoutToken, secretToken: json.secretToken };
}

export async function processPreauthWithToken(input: {
  cardToken: string;
  customerCode?: string | null;
  ipAddress: string;
  invoiceNumber?: string;
}) {
  const json = (await helcimFetch("/payment/preauth", {
    method: "POST",
    idempotency: true,
    body: JSON.stringify({
      amount: Number(preauthAmount().toFixed(2)),
      currency: helcimCurrency(),
      ipAddress: input.ipAddress,
      ecommerce: true,
      invoiceNumber: input.invoiceNumber,
      customerCode: input.customerCode || undefined,
      cardData: { cardToken: input.cardToken },
    }),
  })) as HelcimTxnPayload;
  return json;
}

export async function reverseHelcimTransaction(cardTransactionId: string | number, ipAddress: string) {
  const id = Number(cardTransactionId);
  if (!Number.isFinite(id)) {
    throw new Error("Missing Helcim transaction id to reverse.");
  }
  try {
    return await helcimFetch("/payment/reverse", {
      method: "POST",
      idempotency: true,
      body: JSON.stringify({
        cardTransactionId: id,
        ipAddress,
        ecommerce: true,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reverse failed";
    if (!/reverse|open batch|preauth|type/i.test(message) && !/400|422/.test(message)) {
      throw error;
    }
    return helcimFetch("/payment/refund", {
      method: "POST",
      idempotency: true,
      body: JSON.stringify({
        cardTransactionId: id,
        ipAddress,
        ecommerce: true,
      }),
    });
  }
}

export async function saveHelcimSession(session: HelcimSession) {
  sessionStore().set(session.checkoutToken, session);
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase || session.demo) return;
  await supabase.from("helcim_sessions").upsert({
    checkout_token: session.checkoutToken,
    secret_token: session.secretToken,
    bidder_id: session.bidderId,
    purpose: session.purpose,
    lot_id: session.lotId,
    amount: session.amount,
    currency: session.currency,
    invoice_number: session.invoiceNumber,
    created_at: session.createdAt,
  });
}

export async function readHelcimSession(checkoutToken: string): Promise<HelcimSession | null> {
  const memory = sessionStore().get(checkoutToken);
  if (memory) return memory;
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return null;
  const { data } = await supabase
    .from("helcim_sessions")
    .select("*")
    .eq("checkout_token", checkoutToken)
    .maybeSingle();
  if (!data) return null;
  return {
    checkoutToken: String(data.checkout_token),
    secretToken: String(data.secret_token),
    bidderId: String(data.bidder_id),
    purpose: data.purpose === "checkout_purchase" ? "checkout_purchase" : "bid_preauth",
    lotId: data.lot_id ? String(data.lot_id) : null,
    eventId: data.event_id ? String(data.event_id) : null,
    amount: Number(data.amount),
    currency: String(data.currency || helcimCurrency()),
    invoiceNumber: String(data.invoice_number || ""),
    demo: false,
    createdAt: String(data.created_at),
  };
}

export async function dropHelcimSession(checkoutToken: string) {
  sessionStore().delete(checkoutToken);
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.from("helcim_sessions").delete().eq("checkout_token", checkoutToken);
}

export function parseHelcimEventMessage(raw: unknown): { hash: string; data: HelcimTxnPayload } {
  const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Helcim response was empty.");
  }
  const root = parsed as Record<string, unknown>;
  if (root.data && typeof root.data === "object") {
    const inner = root.data as Record<string, unknown>;
    if (inner.data && typeof inner.data === "object" && typeof inner.hash === "string") {
      return { hash: inner.hash, data: inner.data as HelcimTxnPayload };
    }
    if (typeof root.hash === "string") {
      return { hash: root.hash, data: inner as HelcimTxnPayload };
    }
  }
  if (typeof root.hash === "string" && root.data && typeof root.data === "object") {
    return { hash: root.hash, data: root.data as HelcimTxnPayload };
  }
  throw new Error("Could not read Helcim transaction payload.");
}

export function mapProfilePayment(row: Record<string, unknown> | null | undefined): {
  paymentMethod: "helcim_card";
  preauthStatus: PreauthStatus;
  preauthAmount: number;
  hasCardOnFile: boolean;
  preauthTransactionId: string | null;
} {
  const status = isPreauthStatus(row?.preauth_status) ? row.preauth_status : "none";
  return {
    paymentMethod: "helcim_card",
    preauthStatus: status,
    preauthAmount: Number(row?.preauth_amount ?? preauthAmount()) || preauthAmount(),
    hasCardOnFile: Boolean(row?.helcim_card_token),
    preauthTransactionId: row?.preauth_transaction_id ? String(row.preauth_transaction_id) : null,
  };
}

export async function loadBidderPayment(userId: string) {
  const memory = preauthMemory().get(userId);
  const demo = getDemoUser(userId);
  if (demo) {
    return {
      paymentMethod: "helcim_card" as const,
      preauthStatus: demo.preauthStatus !== "none" ? demo.preauthStatus : memory?.status ?? "none",
      preauthAmount: demo.preauthAmount,
      hasCardOnFile: Boolean(demo.helcimCardToken || memory?.cardToken),
      preauthTransactionId: demo.preauthTransactionId ?? memory?.transactionId ?? null,
      helcimCardToken: demo.helcimCardToken ?? memory?.cardToken ?? null,
      helcimCustomerCode: demo.helcimCustomerCode ?? memory?.customerCode ?? null,
    };
  }
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return {
      paymentMethod: "helcim_card" as const,
      preauthStatus: memory?.status ?? "none",
      preauthAmount: memory?.amount ?? preauthAmount(),
      hasCardOnFile: Boolean(memory?.cardToken),
      preauthTransactionId: memory?.transactionId ?? null,
      helcimCardToken: memory?.cardToken ?? null,
      helcimCustomerCode: memory?.customerCode ?? null,
    };
  }
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const mapped = mapProfilePayment(data as Record<string, unknown> | null);
  const status = mapped.preauthStatus !== "none" ? mapped.preauthStatus : memory?.status ?? "none";
  return {
    ...mapped,
    preauthStatus: status,
    preauthAmount: mapped.preauthAmount || memory?.amount || preauthAmount(),
    hasCardOnFile: mapped.hasCardOnFile || Boolean(memory?.cardToken),
    preauthTransactionId: mapped.preauthTransactionId ?? memory?.transactionId ?? null,
    helcimCardToken: data?.helcim_card_token ? String(data.helcim_card_token) : memory?.cardToken ?? null,
    helcimCustomerCode: data?.helcim_customer_code ? String(data.helcim_customer_code) : memory?.customerCode ?? null,
  };
}

export async function persistBidderPreauth(
  userId: string,
  patch: {
    status: PreauthStatus;
    transactionId?: string | null;
    cardToken?: string | null;
    customerCode?: string | null;
    amount?: number;
  },
) {
  preauthMemory().set(userId, {
    status: patch.status,
    transactionId: patch.transactionId ?? preauthMemory().get(userId)?.transactionId ?? null,
    cardToken: patch.cardToken ?? preauthMemory().get(userId)?.cardToken ?? null,
    customerCode: patch.customerCode ?? preauthMemory().get(userId)?.customerCode ?? null,
    amount: patch.amount ?? preauthMemory().get(userId)?.amount ?? preauthAmount(),
  });
  const demo = getDemoUser(userId);
  if (demo) {
    updateDemoUser(userId, {
      preauthStatus: patch.status,
      preauthAmount: patch.amount ?? demo.preauthAmount,
      preauthTransactionId: patch.transactionId ?? (patch.status === "none" ? null : demo.preauthTransactionId),
      helcimCardToken: patch.cardToken ?? demo.helcimCardToken,
      helcimCustomerCode: patch.customerCode ?? demo.helcimCustomerCode,
    });
  }
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return;
  const row: Record<string, unknown> = {
    payment_method: "helcim_card",
    preauth_status: patch.status,
    preauth_amount: patch.amount ?? preauthAmount(),
  };
  if (patch.transactionId !== undefined) row.preauth_transaction_id = patch.transactionId;
  if (patch.cardToken) row.helcim_card_token = patch.cardToken;
  if (patch.customerCode) row.helcim_customer_code = patch.customerCode;
  if (patch.status === "held") row.preauth_held_at = new Date().toISOString();
  if (patch.status === "released") row.preauth_released_at = new Date().toISOString();
  if (patch.status === "denied") row.preauth_held_at = null;
  const { error } = await supabase.from("profiles").update(row).eq("id", userId);
  if (error && /payment_method|enum|invalid input/i.test(error.message)) {
    delete row.payment_method;
    await supabase.from("profiles").update(row).eq("id", userId);
  }
}

export async function persistTermsAgreement(userId: string, agreed: boolean) {
  termsMemory().set(userId, agreed);
  const demo = getDemoUser(userId);
  if (demo) updateDemoUser(userId, { preauthTermsAgreed: agreed });
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase
    .from("profiles")
    .update({ preauth_terms_agreed_at: agreed ? new Date().toISOString() : null })
    .eq("id", userId);
  if (error && /preauth_terms|column/i.test(error.message)) return;
}

export function termsAgreedFromRow(row: Record<string, unknown> | null | undefined, userId: string) {
  if (termsMemory().get(userId)) return true;
  return Boolean(row?.preauth_terms_agreed_at);
}

export async function loadTermsAgreed(userId: string) {
  if (termsMemory().get(userId)) return true;
  const demo = getDemoUser(userId);
  if (demo?.preauthTermsAgreed) return true;
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return false;
  const { data } = await supabase
    .from("profiles")
    .select("preauth_terms_agreed_at")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data?.preauth_terms_agreed_at);
}

export async function recordHelcimTransaction(input: {
  bidderId: string;
  lotId?: string | null;
  purpose: string;
  transactionId?: string | null;
  cardToken?: string | null;
  customerCode?: string | null;
  amount: number;
  currency: string;
  status: string;
  raw?: unknown;
}) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.from("helcim_transactions").insert({
    bidder_id: input.bidderId,
    lot_id: input.lotId,
    purpose: input.purpose,
    transaction_id: input.transactionId,
    card_token: input.cardToken,
    customer_code: input.customerCode,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
    raw: input.raw ?? null,
  });
}

export async function markLotPaid(lotId: string, transactionId: string) {
  const paidAt = new Date().toISOString();
  paidStore().set(lotId, { transactionId, paidAt });
  markDemoLotPaid(lotId, transactionId);
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return { paidAt, transactionId };
  const { error } = await supabase
    .from("lots")
    .update({
      paid_at: paidAt,
      helcim_purchase_transaction_id: transactionId,
      buy_now_status: "sold",
    })
    .eq("id", lotId);
  if (error && /buy_now_status/i.test(error.message)) {
    await supabase
      .from("lots")
      .update({
        paid_at: paidAt,
        helcim_purchase_transaction_id: transactionId,
      })
      .eq("id", lotId);
    return { paidAt, transactionId };
  }
  if (error && /paid_at|helcim_purchase/i.test(error.message)) {
    return { paidAt, transactionId };
  }
  return { paidAt, transactionId };
}

export function lotPaidRecord(lotId: string) {
  return paidStore().get(lotId) ?? null;
}

export function isLotPaid(lot: { id: string; paidAt?: string | null; helcimPurchaseTransactionId?: string | null }) {
  if (lot.paidAt || lot.helcimPurchaseTransactionId) return true;
  return paidStore().has(lot.id);
}

export async function releaseBidderPreauth(user: Pick<BidderProfile, "id">, ipAddress: string) {
  const payment = await loadBidderPayment(user.id);
  if (payment.preauthStatus !== "held" || !payment.preauthTransactionId) {
    await persistBidderPreauth(user.id, { status: "released" });
    return { released: true, demo: !isHelcimConfigured() };
  }
  if (!isHelcimConfigured() || payment.preauthTransactionId.startsWith("demo-")) {
    await persistBidderPreauth(user.id, { status: "released", transactionId: payment.preauthTransactionId });
    await recordHelcimTransaction({
      bidderId: user.id,
      purpose: "preauth_release",
      transactionId: payment.preauthTransactionId,
      amount: payment.preauthAmount,
      currency: helcimCurrency(),
      status: "RELEASED",
    });
    return { released: true, demo: true };
  }
  await reverseHelcimTransaction(payment.preauthTransactionId, ipAddress);
  await persistBidderPreauth(user.id, { status: "released", transactionId: payment.preauthTransactionId });
  await recordHelcimTransaction({
    bidderId: user.id,
    purpose: "preauth_release",
    transactionId: payment.preauthTransactionId,
    amount: payment.preauthAmount,
    currency: helcimCurrency(),
    status: "RELEASED",
  });
  return { released: true, demo: false };
}

export async function markSettlementPaid(invoice: string) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return;
  await supabase
    .from("settlement_invoices")
    .update({ payment_status: "paid", payment_channel: "helcim" })
    .eq("invoice_number", invoice);
}

export function requireHeldPreauth(status: PreauthStatus) {
  return status === "held";
}
