import { checkoutHref, lotHref, publicAppUrl } from "@/lib/appUrl";
import { receiptPageUrl } from "@/lib/receiptToken";
import {
  consignmentCommissionNote,
  consignmentItemListText,
  type ConsignmentMailLine,
} from "@/lib/commission";
import { escapeHtml } from "@/lib/emailHtml";
import { DEFAULT_COMMISSION_RATE, formatCurrency } from "@/lib/utils";
import { invoiceFees, SHIPPING_HANDLING_FEE, type InvoiceFeeBreakdown } from "@/lib/invoiceFees";
import { PICKUP_INSTRUCTIONS } from "@/lib/payments";
import { SITE, adminNotifyEmail } from "@/lib/site";
import { sendTransactionalEmail } from "@/lib/transactionalEmail";

export const WIN_RESERVATION_DISCLOSURE =
  "Your winning item has been reserved! To save you on processing fees, no payment is required right now. All your winning auction bids from this sale will be consolidated into a single invoice sent automatically when the auction closes on Sunday. Buy Now purchases are separate and are due as soon as you claim them.";

export function winReservationEmailHtml(input: {
  name: string;
  title: string;
  lotNumber: string;
  hammer: string;
  lotHref: string;
}) {
  const lot = input.lotNumber ? `Lot ${escapeHtml(input.lotNumber)} · ` : "";
  return `<p style="font-size:22px;font-weight:bold;">Congratulations! You're the Winning Bidder!</p>
<p>POW, ${escapeHtml(input.name)} — you locked in <strong>${escapeHtml(input.title)}</strong>.</p>
<p>${lot}Winning price: <strong>${escapeHtml(input.hammer)}</strong></p>
<p style="border:4px solid #000;background:#FFF7D1;padding:12px;font-weight:bold;">${escapeHtml(WIN_RESERVATION_DISCLOSURE)}</p>
<p><a href="${escapeHtml(input.lotHref)}">View your lot</a></p>`;
}

export type WonLotLine = {
  title: string;
  lotNumber?: string | null;
  hammer: number;
};

function wonLotsTable(lots: WonLotLine[]) {
  const rows = lots
    .map((lot, index) => {
      const number = lot.lotNumber?.trim() ? escapeHtml(lot.lotNumber.trim()) : "—";
      return `<tr style="background:${index % 2 ? "#FFF7D1" : "#FFFFFF"};">
<td style="padding:8px;border:2px solid #000;">${number}</td>
<td style="padding:8px;border:2px solid #000;">${escapeHtml(lot.title)}</td>
<td style="padding:8px;border:2px solid #000;text-align:right;font-weight:bold;">${escapeHtml(formatCurrency(lot.hammer))}</td>
</tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:16px 0;">
<tr style="background:#FF0000;color:#FFFFFF;">
<th style="padding:8px;border:2px solid #000;text-align:left;">Lot</th>
<th style="padding:8px;border:2px solid #000;text-align:left;">Item</th>
<th style="padding:8px;border:2px solid #000;text-align:right;">Closing bid</th>
</tr>
${rows}
</table>`;
}

export function invoiceEmailHtml(input: {
  name: string;
  invoice: string;
  title: string;
  lotHref: string;
  payHref: string;
  cashHref: string;
  fees: InvoiceFeeBreakdown;
  fulfillment: string;
  address: string;
  batch?: boolean;
  lots?: WonLotLine[];
  receiptHref?: string;
}) {
  const lines = input.lots ?? [];
  const rows = [
    ["Hammer", formatCurrency(input.fees.hammer)],
    ["15% buyer's premium", formatCurrency(input.fees.premium)],
  ];
  if (input.fees.handling > 0) rows.push(["Shipping handling fee", formatCurrency(input.fees.handling)]);
  if (input.fees.shipping > 0) {
    rows.push(["Estimated / carrier shipping", formatCurrency(input.fees.shipping)]);
  }
  rows.push(["5% GST", formatCurrency(input.fees.gst)]);
  rows.push(["Total due", formatCurrency(input.fees.total)]);
  const table = rows
    .map(
      ([label, value], index) =>
        `<tr style="background:${index % 2 ? "#FFF7D1" : "#FFFFFF"};"><td style="padding:8px;border:2px solid #000;">${escapeHtml(label)}</td><td style="padding:8px;border:2px solid #000;text-align:right;font-weight:bold;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const intro = lines.length
    ? `<p>Invoice <strong>${escapeHtml(input.invoice)}</strong>. Each line is the price that lot sold for.</p>
${wonLotsTable(lines)}`
    : `<p>You won <strong>${escapeHtml(input.title)}</strong>. Invoice <strong>${escapeHtml(input.invoice)}</strong>.</p>`;
  const receiptHref = input.receiptHref || input.payHref;
  const checkout = checkoutHref();
  const plural = lines.length > 1 ? "these lots" : "this lot";
  return `<p>POW, ${escapeHtml(input.name)}!</p>
${intro}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:16px 0;">${table}</table>
<p>Total due: <strong>${escapeHtml(formatCurrency(input.fees.total))}</strong></p>
${deliveryBlock(input.fulfillment, input.address, plural)}
<p><a href="${escapeHtml(checkout)}" style="display:inline-block;background:#FF0000;color:#FFFFFF;padding:12px 18px;border:4px solid #000;font-weight:bold;text-decoration:none;">${escapeHtml(payButtonLabel(input.fulfillment))}</a></p>
<p style="font-size:14px;">Ways to pay: card through Helcim on the checkout page, or ask for cash on pickup there and settle at the desk when you collect.</p>
<p><a href="${escapeHtml(receiptHref)}" style="display:inline-block;background:#111111;color:#FFFFFF;padding:12px 18px;border:4px solid #000;font-weight:bold;text-decoration:none;">Download receipt</a></p>
<p style="font-size:13px;">${escapeHtml(SITE.addressLine)}, ${escapeHtml(SITE.cityLine)}</p>`;
}

function payButtonLabel(fulfillment: string) {
  return fulfillment === "ship" || fulfillment === "pickup"
    ? "Pay this invoice"
    : "Choose pickup or shipping, then pay";
}

/** Nothing is assumed. The buyer is told what each choice costs and where to make it. */
function deliveryBlock(fulfillment: string, address: string, plural: string) {
  const frame = (body: string) =>
    `<div style="border:4px solid #000;background:#FFF7D1;padding:12px;margin:16px 0;">${body}</div>`;
  if (fulfillment === "ship") {
    return frame(`<p style="margin:0;font-weight:bold;">Set for shipping.</p>
<p style="margin:8px 0 0;">Going to ${escapeHtml(address || "the address on your bidder card")}. The total above includes the $10 handling fee and carrier postage. Want to collect ${escapeHtml(plural)} instead? Switch to local pickup on the checkout page and the shipping lines come off.</p>`);
  }
  if (fulfillment === "pickup") {
    return frame(`<p style="margin:0;font-weight:bold;">Set for local pickup — no shipping charges.</p>
<p style="margin:8px 0 0;">${escapeHtml(PICKUP_INSTRUCTIONS)}</p>`);
  }
  return frame(`<p style="margin:0;font-weight:bold;">Tell us how you want ${escapeHtml(plural)} — nothing is booked yet.</p>
<p style="margin:8px 0 0;"><strong>Local pickup:</strong> free. The total above is what you owe. ${escapeHtml(PICKUP_INSTRUCTIONS)}</p>
<p style="margin:8px 0 0;"><strong>Shipping:</strong> adds a $10 handling fee plus actual carrier postage, with GST on the new subtotal. Your updated total shows before you pay.</p>
<p style="margin:8px 0 0;">Pick one on the checkout page, then pay by card or ask for cash on pickup.</p>`);
}

export function welcomeEmailHtml(input: { name: string; liveHref: string; verifyHref?: string }) {
  const name = escapeHtml(input.name || "Bidder");
  const verify = input.verifyHref
    ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto;">
  <tr>
    <td align="center" style="background:#111111;padding:12px 22px;">
      <a href="${escapeHtml(input.verifyHref)}" style="color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;">Confirm your email</a>
    </td>
  </tr>
</table>`
    : "";
  return `<p>Hi ${name},</p>
<p>Thanks for creating a DealFinder Auctions bidder account. Please confirm this email address so you can bid.</p>
${verify}
<p>If you did not create this account, you can ignore this message.</p>`;
}

function consignmentLinesHtml(items: ConsignmentMailLine[]) {
  const rows = items
    .map(
      (item, index) =>
        `<tr style="background:${index % 2 ? "#FFF7D1" : "#FFFFFF"};">
<td style="padding:8px;border:2px solid #000;">${escapeHtml(item.title)}</td>
<td style="padding:8px;border:2px solid #000;text-align:right;">${escapeHtml(formatCurrency(item.startingBid))}</td>
<td style="padding:8px;border:2px solid #000;text-align:right;">${escapeHtml(formatCurrency(item.buyNowPrice))}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:16px 0;">
<tr style="background:#FF0000;color:#FFFFFF;">
<th style="padding:8px;border:2px solid #000;text-align:left;">Item</th>
<th style="padding:8px;border:2px solid #000;text-align:right;">Starting bid</th>
<th style="padding:8px;border:2px solid #000;text-align:right;">Buy now</th>
</tr>
${rows}
</table>`;
}

function mailLines(items: ConsignmentMailLine[] | undefined, fallback: ConsignmentMailLine): ConsignmentMailLine[] {
  if (items && items.length) return items;
  return [fallback];
}

export function consignmentApprovedEmailHtml(input: {
  name: string;
  title: string;
  lotHref: string;
  items: ConsignmentMailLine[];
  commissionNote: string;
}) {
  const heading =
    input.items.length > 1
      ? `Good news: DealFinder approved <strong>${input.items.length} consignments</strong> and filed them into the live sale.`
      : `Good news: DealFinder approved <strong>${escapeHtml(input.title)}</strong> and filed it into the live sale.`;
  return `<p>Hi ${escapeHtml(input.name || "Consignor")},</p>
<p>${heading}</p>
${consignmentLinesHtml(input.items)}
<p style="border:4px solid #000;background:#FFF7D1;padding:12px;font-weight:bold;">${escapeHtml(input.commissionNote)}</p>
<p><a href="${escapeHtml(input.lotHref)}" style="color:#111111;font-weight:bold;">Open this lot in the live auction</a></p>
<p>${escapeHtml(input.lotHref)}</p>`;
}

export function consignmentReceivedEmailHtml(input: {
  name: string;
  dashboardHref: string;
  items: ConsignmentMailLine[];
  commissionNote: string;
}) {
  const heading =
    input.items.length > 1
      ? `DealFinder received <strong>${input.items.length} consignments</strong> from this batch.`
      : `DealFinder received your consignment submission for <strong>${escapeHtml(input.items[0]?.title || "your item")}</strong>.`;
  return `<p>Hi ${escapeHtml(input.name || "Consignor")},</p>
<p>${heading}</p>
${consignmentLinesHtml(input.items)}
<p style="border:4px solid #000;background:#FFF7D1;padding:12px;font-weight:bold;">${escapeHtml(input.commissionNote)}</p>
<p>You can track your consignments after you log in: <a href="${escapeHtml(input.dashboardHref)}">${escapeHtml(input.dashboardHref)}</a></p>`;
}

export async function sendConsignmentApprovedEmail(input: {
  to: string;
  name: string;
  title: string;
  lotId?: string;
  slug?: string | null;
  items?: ConsignmentMailLine[];
  startingBid?: number;
  buyNowPrice?: number;
  commissionRate?: number;
  commissionNote?: string;
}) {
  const dashboard = `${publicAppUrl()}/consignor`;
  const link = input.lotId ? lotHref(input.slug || input.lotId) : dashboard;
  const displayName = input.name || "Consignor";
  const items = mailLines(input.items, {
    title: input.title,
    startingBid: input.startingBid ?? 0,
    buyNowPrice: input.buyNowPrice ?? 0,
  });
  const rate = input.commissionRate ?? DEFAULT_COMMISSION_RATE;
  const note = input.commissionNote || consignmentCommissionNote(rate);
  const first = items[0];
  return sendTransactionalEmail({
    templateId: "consignment_approved",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: displayName,
      item_title: items.length === 1 ? first.title : `${items.length} consignments`,
      winning_bid: formatCurrency(first.buyNowPrice),
      payment_link: dashboard,
      lot_link: link,
      starting_bid: formatCurrency(first.startingBid),
      buy_now: formatCurrency(first.buyNowPrice),
      commission_note: note,
      item_list: consignmentItemListText(items),
    },
    htmlOverride: consignmentApprovedEmailHtml({
      name: displayName,
      title: first.title,
      lotHref: link,
      items,
      commissionNote: note,
    }),
  });
}

export async function sendConsignmentReceivedEmail(input: {
  to: string;
  name: string;
  items: ConsignmentMailLine[];
  commissionRate?: number;
  commissionNote?: string;
}) {
  const dashboard = `${publicAppUrl()}/consignor`;
  const displayName = input.name || "Consignor";
  const items = input.items.filter((item) => item.title.trim());
  if (!items.length) {
    return { ok: false, mode: "demo-outbox" as const, error: "No consignments to email" };
  }
  const rate = input.commissionRate ?? DEFAULT_COMMISSION_RATE;
  const note = input.commissionNote || consignmentCommissionNote(rate);
  const first = items[0];
  return sendTransactionalEmail({
    templateId: "consignment_received",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: displayName,
      item_title: items.length === 1 ? first.title : `${items.length} consignments`,
      winning_bid: formatCurrency(first.buyNowPrice),
      payment_link: dashboard,
      lot_link: dashboard,
      starting_bid: formatCurrency(first.startingBid),
      buy_now: formatCurrency(first.buyNowPrice),
      commission_note: note,
      item_list: consignmentItemListText(items),
    },
    htmlOverride: consignmentReceivedEmailHtml({
      name: displayName,
      dashboardHref: dashboard,
      items,
      commissionNote: note,
    }),
  });
}

export async function resolveConsignorEmail(
  supabase: ReturnType<typeof import("@/lib/supabaseClient").getSupabaseAdmin>,
  row: {
    consignor_name?: string | null;
    contact_email?: string | null;
    owner_id?: string | null;
  },
): Promise<{ email: string; name: string } | null> {
  const name = String(row.consignor_name ?? "").trim() || "Consignor";
  const direct = String(row.contact_email ?? "").trim().toLowerCase();
  if (direct.includes("@")) return { email: direct, name };

  if (!supabase) return null;

  if (row.owner_id) {
    const { data } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", row.owner_id)
      .maybeSingle();
    const email = String(data?.email ?? "").trim().toLowerCase();
    if (email.includes("@")) {
      return { email, name: String(data?.full_name ?? "").trim() || name };
    }
  }

  if (name) {
    const { data } = await supabase
      .from("profiles")
      .select("email, full_name")
      .ilike("full_name", name)
      .limit(2);
    const unique = Array.from(
      new Set(
        (data ?? [])
          .map((row) => String(row.email ?? "").trim().toLowerCase())
          .filter((email) => email.includes("@")),
      ),
    );
    if (unique.length === 1) {
      return { email: unique[0], name };
    }
  }

  return null;
}

export async function notifyConsignmentApproved(input: {
  supabase: ReturnType<typeof import("@/lib/supabaseClient").getSupabaseAdmin>;
  row: {
    consignor_name?: string | null;
    contact_email?: string | null;
    owner_id?: string | null;
    title?: string | null;
    starting_bid?: number | string | null;
    buy_now_price?: number | string | null;
    reserve_price?: number | string | null;
    commission_rate?: number | string | null;
  };
  lotId?: string;
  slug?: string | null;
  lotTitle?: string;
  items?: ConsignmentMailLine[];
  startingBid?: number;
  buyNowPrice?: number;
  commissionRate?: number;
  commissionNote?: string;
}) {
  const recipient = await resolveConsignorEmail(input.supabase, input.row);
  if (!recipient) {
    console.warn("consignment_approved_no_email", { title: input.row.title });
    return { ok: false, skipped: true as const };
  }
  const startingBid =
    input.startingBid ??
    Number(input.row.starting_bid ?? 0);
  const buyNowPrice =
    input.buyNowPrice ??
    Number(input.row.buy_now_price ?? input.row.reserve_price ?? 0);
  const commissionRate =
    input.commissionRate ??
    (Number(input.row.commission_rate ?? DEFAULT_COMMISSION_RATE) || DEFAULT_COMMISSION_RATE);
  return sendConsignmentApprovedEmail({
    to: recipient.email,
    name: recipient.name,
    title: input.lotTitle || String(input.row.title ?? "your item"),
    lotId: input.lotId,
    slug: input.slug,
    items: input.items,
    startingBid,
    buyNowPrice,
    commissionRate,
    commissionNote: input.commissionNote,
  });
}

export type CounterMailLine = { title: string; asked: number; counter: number };

export async function sendConsignmentRejectedEmail(input: {
  to: string;
  name: string;
  title: string;
  counters?: CounterMailLine[];
}) {
  const dashboard = `${publicAppUrl()}/consignor#counters`;
  const displayName = input.name || "Consignor";
  const title = input.title || "your item";
  const counters = (input.counters ?? []).filter((row) => row.title.trim() && row.counter > 0);
  if (!counters.length) {
    return sendTransactionalEmail({
      templateId: "consignment_rejected",
      to: input.to,
      forceDeliver: true,
      simpleLayout: true,
      subjectOverride: `DealFinder did not accept ${title}`,
      vars: {
        customer_name: displayName,
        item_title: title,
        winning_bid: "",
        payment_link: dashboard,
        lot_link: dashboard,
      },
      htmlOverride: `<p>Hi ${escapeHtml(displayName)},</p>
<p>DealFinder is not taking <strong>${escapeHtml(title)}</strong> at this time.</p>
<p>You can track your consignments after you log in: <a href="${escapeHtml(dashboard)}">${escapeHtml(dashboard)}</a></p>`,
    });
  }
  const blocks = counters
    .map(
      (row) => `<tr>
<td style="padding:8px;border:2px solid #000;">${escapeHtml(row.title)}</td>
<td style="padding:8px;border:2px solid #000;">You asked ${escapeHtml(formatCurrency(row.asked))}</td>
<td style="padding:8px;border:2px solid #000;font-weight:bold;">Counter ${escapeHtml(formatCurrency(row.counter))}</td>
</tr>`,
    )
    .join("");
  const subject =
    counters.length === 1
      ? `DealFinder's counter on ${counters[0].title}`
      : `DealFinder sent counters on ${counters.length} consignments`;
  return sendTransactionalEmail({
    templateId: "consignment_rejected",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    subjectOverride: subject,
    vars: {
      customer_name: displayName,
      item_title: counters.length === 1 ? counters[0].title : `${counters.length} consignments`,
      winning_bid: formatCurrency(counters[0].counter),
      payment_link: dashboard,
      lot_link: dashboard,
    },
    htmlOverride: `<p>Hi ${escapeHtml(displayName)},</p>
<p>DealFinder is not taking ${counters.length === 1 ? "this item" : "these items"} at the price you asked. Each counter below is what you are paid if that item sells. There is no house commission.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:16px 0;">${blocks}</table>
<p>Open your consignments to accept or decline each counter.</p>
<p><a href="${escapeHtml(dashboard)}" style="display:inline-block;background:#111111;color:#FFFFFF;padding:12px 18px;border:4px solid #000;font-weight:bold;text-decoration:none;">Accept or decline each counter</a></p>`,
  });
}

function sameConsignor(
  row: { owner_id?: string | null; contact_email?: string | null; consignor_name?: string | null },
  target: { owner_id?: string | null; contact_email?: string | null; consignor_name?: string | null },
) {
  if (target.owner_id && row.owner_id === target.owner_id) return true;
  const email = String(row.contact_email ?? "").trim().toLowerCase();
  const targetEmail = String(target.contact_email ?? "").trim().toLowerCase();
  if (email && targetEmail && email === targetEmail) return true;
  const name = String(row.consignor_name ?? "").trim().toLowerCase();
  const targetName = String(target.consignor_name ?? "").trim().toLowerCase();
  return Boolean(name && targetName && name === targetName);
}

export async function notifyConsignmentRejected(input: {
  supabase: ReturnType<typeof import("@/lib/supabaseClient").getSupabaseAdmin>;
  row: {
    id?: string | null;
    consignor_name?: string | null;
    contact_email?: string | null;
    owner_id?: string | null;
    title?: string | null;
    consignor_offer?: number | string | null;
    buy_now_price?: number | string | null;
    reserve_price?: number | string | null;
    counter_offer?: number | string | null;
    counter_status?: string | null;
  };
  title?: string;
}) {
  const recipient = await resolveConsignorEmail(input.supabase, input.row);
  if (!recipient) {
    console.warn("consignment_rejected_no_email", { title: input.row.title });
    return { ok: false, skipped: true as const };
  }
  const listed = input.supabase ? await openCounterOffers(input.supabase, input.row) : [];
  const currentCounter = Number(input.row.counter_offer ?? 0) || 0;
  const counters =
    listed.length > 0
      ? listed
      : currentCounter > 0
        ? [
            {
              title: input.title || String(input.row.title ?? "your item"),
              asked: Number(input.row.consignor_offer ?? input.row.buy_now_price ?? input.row.reserve_price ?? 0) || 0,
              counter: currentCounter,
            },
          ]
        : [];
  return sendConsignmentRejectedEmail({
    to: recipient.email,
    name: recipient.name,
    title: input.title || String(input.row.title ?? "your item"),
    counters,
  });
}

async function openCounterOffers(
  supabase: NonNullable<ReturnType<typeof import("@/lib/supabaseClient").getSupabaseAdmin>>,
  target: {
    owner_id?: string | null;
    contact_email?: string | null;
    consignor_name?: string | null;
  },
): Promise<CounterMailLine[]> {
  const { data, error } = await supabase
    .from("consignments")
    .select("title, consignor_offer, buy_now_price, reserve_price, counter_offer, counter_status, status, owner_id, contact_email, consignor_name")
    .eq("status", "rejected")
    .eq("counter_status", "offered");
  if (error || !data) return [];
  return data
    .filter((row) => sameConsignor(row, target))
    .map((row) => ({
      title: String(row.title ?? "Item"),
      asked: Number(row.consignor_offer ?? row.buy_now_price ?? row.reserve_price ?? 0) || 0,
      counter: Number(row.counter_offer ?? 0) || 0,
    }))
    .filter((row) => row.counter > 0);
}

export async function sendPasswordResetEmail(input: { to: string; name?: string; resetHref: string }) {
  const displayName = input.name || "Bidder";
  return sendTransactionalEmail({
    templateId: "password_reset",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: displayName,
      item_title: "",
      winning_bid: "",
      payment_link: input.resetHref,
      lot_link: input.resetHref,
    },
    htmlOverride: `<p>Hi ${escapeHtml(displayName)},</p>
<p>Use this button to choose a new DealFinder paddle password. It expires soon.</p>
<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto;">
  <tr>
    <td align="center" style="background:#111111;padding:12px 22px;">
      <a href="${escapeHtml(input.resetHref)}" style="color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;">Reset password</a>
    </td>
  </tr>
</table>
<p>If you did not ask for this, you can ignore the email.</p>`,
  });
}

export async function sendWelcomeEmail(to: string, name: string, verifyHref?: string) {
  const live = `${publicAppUrl()}/live`;
  const displayName = name || "Bidder";
  return sendTransactionalEmail({
    templateId: "welcome",
    to,
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: displayName,
      item_title: "",
      winning_bid: "",
      payment_link: live,
      lot_link: live,
      verify_link: verifyHref || live,
    },
    htmlOverride: welcomeEmailHtml({ name: displayName, liveHref: live, verifyHref }),
  });
}

export async function sendHoldFailedEmail(input: { to: string; name: string }) {
  const link = `${publicAppUrl()}/live`;
  const name = input.name || "Bidder";
  return sendTransactionalEmail({
    templateId: "hold_failed",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    subjectOverride: "Your $50 DealFinder hold did not go through",
    vars: {
      customer_name: name,
      item_title: "$50 hold",
      winning_bid: "$50",
      payment_link: link,
      lot_link: link,
    },
    htmlOverride: `<p>Hi ${escapeHtml(name)},</p>
<p>Your $50 payment did not go through. If you do not authorize it now, all of your bids on this sale will be forfeited.</p>
<p><a href="${escapeHtml(link)}" style="color:#111111;font-weight:bold;">Authorize the $50 hold</a></p>
<p>${escapeHtml(link)}</p>`,
  });
}

export async function sendOutbidEmail(input: {
  to: string;
  name: string;
  title: string;
  currentBid: number;
  lotId: string;
  slug?: string | null;
}) {
  const link = lotHref(input.slug || input.lotId);
  return sendTransactionalEmail({
    templateId: "outbid",
    to: input.to,
    vars: {
      customer_name: input.name || "Bidder",
      item_title: input.title,
      winning_bid: formatCurrency(input.currentBid),
      payment_link: link,
      lot_link: link,
    },
  });
}

export async function sendWinReservationEmail(input: {
  to: string;
  name: string;
  title: string;
  lotNumber?: string | null;
  hammer: number;
  lotId: string;
  slug?: string | null;
}) {
  const link = lotHref(input.slug || input.lotId);
  const html = winReservationEmailHtml({
    name: input.name,
    title: input.title,
    lotNumber: input.lotNumber ?? "",
    hammer: formatCurrency(input.hammer),
    lotHref: link,
  });
  return sendTransactionalEmail({
    templateId: "winning_reservation",
    to: input.to,
    forceDeliver: true,
    vars: {
      customer_name: input.name || "Bidder",
      item_title: input.title,
      winning_bid: formatCurrency(input.hammer),
      payment_link: checkoutHref(),
      lot_link: link,
    },
    htmlOverride: html,
  });
}

export async function sendWinInvoiceEmail(input: {
  to: string;
  name: string;
  title: string;
  invoice: string;
  lotId: string;
  slug?: string | null;
  fees: InvoiceFeeBreakdown;
  fulfillment: string;
  address: string;
  batch?: boolean;
  lots?: WonLotLine[];
  subjectOverride?: string;
}) {
  const multi = (input.lots?.length ?? 0) > 1;
  const receiptHref = receiptPageUrl(input.invoice, true);
  const lotLink = multi ? receiptPageUrl(input.invoice) : lotHref(input.slug || input.lotId);
  const html = invoiceEmailHtml({
    name: input.name,
    invoice: input.invoice,
    title: input.title,
    lotHref: lotLink,
    payHref: receiptHref,
    cashHref: receiptHref,
    fees: input.fees,
    fulfillment: input.fulfillment,
    address: input.address,
    batch: input.batch,
    lots: input.lots,
    receiptHref,
  });
  const subjectTitle = (input.lots?.length ?? 0) > 1 ? `${input.lots!.length} lots` : input.title;
  return sendTransactionalEmail({
    templateId: "winning_invoice",
    to: input.to,
    forceDeliver: true,
    subjectOverride: input.subjectOverride ?? `Your DealFinder receipt — ${subjectTitle}`,
    vars: {
      customer_name: input.name,
      item_title: subjectTitle,
      winning_bid: formatCurrency(input.fees.hammer),
      payment_link: receiptHref,
      lot_link: receiptPageUrl(input.invoice),
      cash_link: receiptHref,
      invoice_total: formatCurrency(input.fees.total),
    },
    htmlOverride: html,
  });
}

export async function sendCashReceiptEmail(input: {
  to: string;
  name: string;
  title: string;
  invoice: string;
  total: number;
}) {
  return sendTransactionalEmail({
    templateId: "cash_receipt",
    to: input.to,
    vars: {
      customer_name: input.name,
      item_title: input.title,
      winning_bid: formatCurrency(input.total),
      payment_link: checkoutHref(),
      lot_link: checkoutHref(),
    },
  });
}

/** Tells a consignor their item sold and what it earns them after the split. */
export async function sendConsignorSoldEmail(input: {
  to: string;
  name: string;
  title: string;
  lotNumber?: string | null;
  hammer: number;
  commissionLabel: string;
  houseCut: number;
  payout: number;
  charity?: boolean;
  source?: "bid" | "buy_now";
}) {
  const statement = `${publicAppUrl()}/consignor`;
  const lot = input.lotNumber?.trim() ? `Lot ${input.lotNumber.trim()} · ` : "";
  const buyNow = input.source === "buy_now";
  const fixedOffer = input.commissionLabel === "Buy Now offer";
  const rows: Array<[string, string]> = fixedOffer
    ? [
        ["Sold how", "Buy Now — sold immediately"],
        ["Buyers paid", formatCurrency(input.hammer)],
        [input.charity ? "To the charity" : "You receive", formatCurrency(input.payout)],
      ]
    : [
        ["Sold how", buyNow ? "Buy Now — sold immediately" : "Live auction"],
        ["Sold for", formatCurrency(input.hammer)],
        [`House commission (${input.commissionLabel})`, `− ${formatCurrency(input.houseCut)}`],
        [input.charity ? "To the charity" : "Your payout", formatCurrency(input.payout)],
      ];
  const table = rows
    .map(
      ([label, value], index) =>
        `<tr style="background:${index % 2 ? "#FFF7D1" : "#FFFFFF"};"><td style="padding:8px;border:2px solid #000;">${escapeHtml(label)}</td><td style="padding:8px;border:2px solid #000;text-align:right;font-weight:bold;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const opener = buyNow
    ? `<p>Your consignment sold just now on Buy Now. This is your lot sale invoice.</p>`
    : `<p>Good news, ${escapeHtml(input.name)} — your item sold.</p>`;
  return sendTransactionalEmail({
    templateId: "consignor_payout",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    subjectOverride: buyNow ? `Sale invoice — ${input.title}` : `Sold — ${input.title}`,
    vars: {
      customer_name: input.name,
      item_title: input.title,
      winning_bid: formatCurrency(input.hammer),
      payment_link: statement,
      lot_link: statement,
    },
    htmlOverride: `${opener}
<p>${escapeHtml(input.name)}, ${escapeHtml(lot)}<strong>${escapeHtml(input.title)}</strong></p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:16px 0;">${table}</table>
<p style="font-size:14px;">${escapeHtml(
    fixedOffer
      ? "There is no house commission on this Buy Now sale. You are paid the amount you agreed to. DealFinder keeps the difference between the buyer price and your payout."
      : consignmentCommissionNote(),
  )}</p>
<p style="font-size:14px;">The buyer pays their invoice separately (Buy Now is due immediately; auction wins wait for Sunday). Your payout goes out after they settle. The buyer's premium, GST, and any shipping they pay are charges on their side and are not taken out of your share.</p>
<p><a href="${escapeHtml(statement)}" style="display:inline-block;background:#111111;color:#FFFFFF;padding:12px 18px;border:4px solid #000;font-weight:bold;text-decoration:none;">See your consignments</a></p>`,
  });
}

/** Receipt after the desk actually sends the consignor their share. */
export async function sendConsignorPayoutSentEmail(input: {
  to: string;
  name: string;
  title: string;
  lotNumber?: string | null;
  hammer: number;
  commissionLabel: string;
  houseCut: number;
  payout: number;
  method?: string;
  reference?: string;
  charity?: boolean;
}) {
  const statement = `${publicAppUrl()}/consignor`;
  const lot = input.lotNumber?.trim() ? `Lot ${input.lotNumber.trim()} · ` : "";
  const method = input.method?.trim() || "e-transfer";
  const fixedOffer = input.commissionLabel === "Buy Now offer";
  const rows: Array<[string, string]> = fixedOffer
    ? [
        ["Buyers paid", formatCurrency(input.hammer)],
        [input.charity ? "Sent to the charity" : "Paid to you", formatCurrency(input.payout)],
        ["How it was sent", method],
      ]
    : [
        ["Sold for", formatCurrency(input.hammer)],
        [`House commission (${input.commissionLabel})`, `− ${formatCurrency(input.houseCut)}`],
        [input.charity ? "Sent to the charity" : "Paid to you", formatCurrency(input.payout)],
        ["How it was sent", method],
      ];
  if (input.reference?.trim()) rows.push(["Reference", input.reference.trim()]);
  const table = rows
    .map(
      ([label, value], index) =>
        `<tr style="background:${index % 2 ? "#FFF7D1" : "#FFFFFF"};"><td style="padding:8px;border:2px solid #000;">${escapeHtml(label)}</td><td style="padding:8px;border:2px solid #000;text-align:right;font-weight:bold;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return sendTransactionalEmail({
    templateId: "consignor_payout",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    subjectOverride: `Payout sent — ${input.title}`,
    vars: {
      customer_name: input.name,
      item_title: input.title,
      winning_bid: formatCurrency(input.payout),
      payment_link: statement,
      lot_link: statement,
    },
    htmlOverride: `<p>${escapeHtml(input.name)}, your payout for this item is on the way.</p>
<p>${escapeHtml(lot)}<strong>${escapeHtml(input.title)}</strong></p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:16px 0;">${table}</table>
<p style="font-size:14px;">${escapeHtml(
    fixedOffer
      ? "There is no house commission on this Buy Now sale. This payment is the amount you agreed to."
      : consignmentCommissionNote(),
  )}</p>
<p style="font-size:14px;">The buyer's premium, GST, and any shipping the buyer pays are charges on their side and are not taken out of your share.</p>
<p><a href="${escapeHtml(statement)}" style="display:inline-block;background:#111111;color:#FFFFFF;padding:12px 18px;border:4px solid #000;font-weight:bold;text-decoration:none;">See your consignments</a></p>`,
  });
}

export async function sendAdminConsignmentAlertEmail(input: {
  consignor: string;
  title: string;
  startingBid: number;
  buyNowPrice: number;
}) {
  const desk = `${publicAppUrl()}/admin/notifications`;
  const buyNow = input.buyNowPrice > 0 ? formatCurrency(input.buyNowPrice) : "not listed";
  return sendTransactionalEmail({
    templateId: "admin_consignment_alert",
    to: adminNotifyEmail(),
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: input.consignor || "A consignor",
      item_title: input.title,
      starting_bid: formatCurrency(input.startingBid),
      winning_bid: buyNow,
      payment_link: desk,
      lot_link: desk,
    },
    htmlOverride: `<p><strong>${escapeHtml(input.consignor || "A consignor")}</strong> submitted <strong>${escapeHtml(input.title)}</strong> for approval.</p>
<p>Opening bid: ${escapeHtml(formatCurrency(input.startingBid))}<br/>Buy Now: ${escapeHtml(buyNow)}</p>
<p><a href="${escapeHtml(desk)}" style="color:#111111;font-weight:bold;">Open desk notifications</a></p>`,
  });
}

export async function sendCounterDecisionDeskEmail(input: {
  consignor: string;
  title: string;
  counter: number;
  accepted: boolean;
}) {
  const desk = `${publicAppUrl()}/admin/consignments`;
  const amount = formatCurrency(input.counter);
  const subject = input.accepted
    ? `${input.consignor || "A consignor"} accepted the counter on ${input.title}`
    : `${input.consignor || "A consignor"} declined the counter on ${input.title}`;
  const line = input.accepted
    ? `accepted the counter of ${amount}. It is back in the approval queue. Approve it to file the lot. They are paid ${amount}. You set the price buyers pay.`
    : `declined the counter of ${amount}. The item stays turned down.`;
  return sendTransactionalEmail({
    templateId: "admin_consignment_alert",
    to: adminNotifyEmail(),
    forceDeliver: true,
    simpleLayout: true,
    subjectOverride: subject,
    vars: {
      customer_name: input.consignor || "A consignor",
      item_title: input.title,
      winning_bid: amount,
      payment_link: desk,
      lot_link: desk,
    },
    htmlOverride: `<p><strong>${escapeHtml(input.consignor || "A consignor")}</strong> ${escapeHtml(line)}</p>
<p><a href="${escapeHtml(desk)}" style="color:#111111;font-weight:bold;">Open the consignment desk</a></p>`,
  });
}

export async function sendAdminCashApprovalEmail(input: {
  name: string;
  email: string;
  invoice: string;
  total: number;
}) {
  const desk = `${publicAppUrl()}/admin/notifications`;
  const who = input.name || input.email || "A buyer";
  return sendTransactionalEmail({
    templateId: "admin_cash_alert",
    to: adminNotifyEmail(),
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: who,
      item_title: input.invoice,
      winning_bid: formatCurrency(input.total),
      payment_link: desk,
      lot_link: desk,
    },
    htmlOverride: `<p><strong>${escapeHtml(who)}</strong> (${escapeHtml(input.email)}) asked to pay <strong>cash on pickup</strong>.</p>
<p>Invoice: <strong>${escapeHtml(input.invoice)}</strong><br/>Amount due: ${escapeHtml(formatCurrency(input.total))}</p>
<p><a href="${escapeHtml(desk)}" style="color:#111111;font-weight:bold;">Open desk notifications</a></p>`,
  });
}

export async function sendCashBidAuthEmail(input: {
  name: string;
  email: string;
  auctionLabel: string;
  eventId: string;
  requestedAt: string;
}) {
  const desk = `${publicAppUrl()}/admin`;
  const to = adminNotifyEmail();
  const when = new Date(input.requestedAt).toLocaleString("en-CA", { timeZone: "America/Edmonton" });
  return sendTransactionalEmail({
    templateId: "cash_bid_auth",
    to,
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: input.name || "Bidder",
      item_title: input.email,
      winning_bid: input.auctionLabel,
      payment_link: desk,
      lot_link: desk,
      invoice_total: when,
    },
    htmlOverride: `<p><strong>${escapeHtml(input.name)}</strong> (${escapeHtml(input.email)}) asked to bid with cash on pickup.</p>
<p>Auction: <strong>${escapeHtml(input.auctionLabel)}</strong><br/>Requested: ${escapeHtml(when)}</p>
<p><a href="${escapeHtml(desk)}" style="color:#111111;font-weight:bold;">Open cash bidding queue</a></p>`,
  });
}

export async function sendCashBidReceivedEmail(input: {
  to: string;
  name: string;
  auctionLabel: string;
}) {
  const live = `${publicAppUrl()}/live`;
  return sendTransactionalEmail({
    templateId: "cash_bid_received",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: input.name || "Bidder",
      item_title: input.auctionLabel,
      winning_bid: input.auctionLabel,
      payment_link: live,
      lot_link: live,
    },
    htmlOverride: `<p>Hi ${escapeHtml(input.name || "there")},</p>
<p>DealFinder received your <strong>cash-on-pickup</strong> request for <strong>${escapeHtml(input.auctionLabel)}</strong>.</p>
<p>The desk still has to approve it. You will get another email when you can bid. Until then you can keep browsing the floor.</p>
<p><a href="${escapeHtml(live)}" style="color:#111111;font-weight:bold;">Back to live lots</a></p>`,
  });
}

export async function sendCashBidDecisionEmail(input: {
  to: string;
  name: string;
  auctionLabel: string;
  approved: boolean;
  permanent?: boolean;
}) {
  const live = `${publicAppUrl()}/live`;
  if (!input.approved) {
    return sendTransactionalEmail({
      templateId: "cash_bid_rejected",
      to: input.to,
      forceDeliver: true,
      simpleLayout: true,
      vars: {
        customer_name: input.name || "Bidder",
        item_title: input.auctionLabel,
        winning_bid: input.auctionLabel,
        payment_link: live,
        lot_link: live,
      },
      htmlOverride: `<p>Hi ${escapeHtml(input.name || "there")},</p>
<p>The desk did not approve cash-on-pickup bidding for <strong>${escapeHtml(input.auctionLabel)}</strong>.</p>
<p>You can still bid on that sale by authorizing the $50 Helcim card hold from the lot page.</p>
<p><a href="${escapeHtml(live)}" style="color:#111111;font-weight:bold;">Open live lots</a></p>`,
    });
  }
  const extra = input.permanent
    ? " This paddle is now trusted for cash pickup on future DealFinder sales too."
    : " This approval is for this auction.";
  return sendTransactionalEmail({
    templateId: "cash_bid_approved",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: input.name || "Bidder",
      item_title: input.auctionLabel,
      winning_bid: input.auctionLabel,
      payment_link: live,
      lot_link: live,
    },
    htmlOverride: `<p>Hi ${escapeHtml(input.name || "there")},</p>
<p>You are approved to bid with <strong>cash on pickup</strong> on <strong>${escapeHtml(input.auctionLabel)}</strong>.</p>
<p>${escapeHtml(extra)}</p>
<p>Go back to the lot and place your bid. Pay in cash when you pick up after the sale.</p>
<p><a href="${escapeHtml(live)}" style="color:#111111;font-weight:bold;">Open live lots</a></p>`,
  });
}

export async function sendShippingQuoteEmail(input: {
  to: string;
  name: string;
  invoice: string;
  postage: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  lots: string[];
}) {
  const size = `${input.lengthCm} × ${input.widthCm} × ${input.heightCm} cm, ${input.weightKg} kg`;
  const lotList = input.lots.filter(Boolean).join(", ") || "your lots";
  return sendTransactionalEmail({
    templateId: "shipping_quote",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: input.name || "there",
      item_title: input.invoice,
      winning_bid: formatCurrency(input.postage),
      payment_link: `${publicAppUrl()}/checkout`,
      lot_link: `${publicAppUrl()}/checkout`,
      item_list: `${size}. Lots: ${lotList}`,
    },
    htmlOverride: `<p>Hi ${escapeHtml(input.name || "there")},</p>
<p>Your settlement <strong>${escapeHtml(input.invoice)}</strong> is paid and set for Canada Post shipping from the Airdrie desk.</p>
<p>Estimated Canada Post postage: <strong>${escapeHtml(formatCurrency(input.postage))}</strong><br/>
Parcel: ${escapeHtml(size)}<br/>
Lots: ${escapeHtml(lotList)}</p>
<p>The $10 handling fee is separate from this postage. We will email tracking when the parcel is on its way.</p>
<p>${escapeHtml(SITE.addressLine)}, ${escapeHtml(SITE.cityLine)}</p>`,
  });
}

export async function sendOrderShippedEmail(input: {
  to: string;
  name: string;
  invoice: string;
  postage: number;
  tracking: string;
  lots: string[];
}) {
  const lotList = input.lots.filter(Boolean).join(", ") || "your lots";
  const tracking = input.tracking.trim() || "The desk has not entered a tracking number yet.";
  return sendTransactionalEmail({
    templateId: "order_shipped",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: input.name || "there",
      item_title: input.invoice,
      winning_bid: formatCurrency(input.postage),
      item_list: tracking,
      payment_link: `${publicAppUrl()}/checkout`,
      lot_link: `${publicAppUrl()}/checkout`,
    },
    subjectOverride: `Your DealFinder order is on the way — ${input.invoice}`,
    htmlOverride: `<p>Hi ${escapeHtml(input.name || "there")},</p>
<p>Your order <strong>${escapeHtml(input.invoice)}</strong> has left the Airdrie desk.</p>
<p>Lots: ${escapeHtml(lotList)}<br/>
Postage: <strong>${escapeHtml(formatCurrency(input.postage))}</strong><br/>
Handling: <strong>${escapeHtml(formatCurrency(SHIPPING_HANDLING_FEE))}</strong><br/>
Tracking: <strong>${escapeHtml(tracking)}</strong></p>
<p>${escapeHtml(SITE.addressLine)}, ${escapeHtml(SITE.cityLine)}</p>`,
  });
}

export async function notifyWin(input: Parameters<typeof sendWinInvoiceEmail>[0]) {
  return sendWinInvoiceEmail(input);
}

export { invoiceFees };
