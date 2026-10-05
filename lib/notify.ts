import { checkoutHref, lotHref, publicAppUrl } from "@/lib/appUrl";
import { receiptPageUrl } from "@/lib/receiptToken";
import {
  consignmentCommissionNote,
  consignmentItemListText,
  type ConsignmentMailLine,
} from "@/lib/commission";
import { escapeHtml } from "@/lib/emailHtml";
import { DEFAULT_COMMISSION_RATE, formatCurrency } from "@/lib/utils";
import { invoiceFees, type InvoiceFeeBreakdown } from "@/lib/invoiceFees";
import { PICKUP_INSTRUCTIONS } from "@/lib/payments";
import { SITE, adminNotifyEmail } from "@/lib/site";
import { sendTransactionalEmail } from "@/lib/transactionalEmail";

export const WIN_RESERVATION_DISCLOSURE =
  "Your winning item has been reserved! To save you on processing fees, no payment is required right now. All your winning bids and Buy-Now items from this auction will be consolidated into a single invoice sent automatically when the auction closes on Sunday.";

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
  return `<p>POW, ${escapeHtml(input.name)}!</p>
${intro}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:16px 0;">${table}</table>
<p>Total due: <strong>${escapeHtml(formatCurrency(input.fees.total))}</strong></p>
<p><a href="${escapeHtml(receiptHref)}" style="display:inline-block;background:#111111;color:#FFFFFF;padding:12px 18px;border:4px solid #000;font-weight:bold;text-decoration:none;">Download receipt</a></p>
<p style="font-size:13px;">${escapeHtml(SITE.addressLine)}, ${escapeHtml(SITE.cityLine)}</p>`;
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
  const note = consignmentCommissionNote(rate);
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
}) {
  const dashboard = `${publicAppUrl()}/consignor`;
  const displayName = input.name || "Consignor";
  const items = input.items.filter((item) => item.title.trim());
  if (!items.length) {
    return { ok: false, mode: "demo-outbox" as const, error: "No consignments to email" };
  }
  const rate = input.commissionRate ?? DEFAULT_COMMISSION_RATE;
  const note = consignmentCommissionNote(rate);
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
  });
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
    subjectOverride: `Your DealFinder receipt — ${subjectTitle}`,
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

export async function notifyWin(input: Parameters<typeof sendWinInvoiceEmail>[0]) {
  return sendWinInvoiceEmail(input);
}

export { invoiceFees };
