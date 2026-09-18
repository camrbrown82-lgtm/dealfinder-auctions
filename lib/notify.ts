import { checkoutHref, lotHref, publicAppUrl } from "@/lib/appUrl";
import { escapeHtml } from "@/lib/emailHtml";
import { formatCurrency } from "@/lib/utils";
import { invoiceFees, type InvoiceFeeBreakdown } from "@/lib/invoiceFees";
import { PICKUP_INSTRUCTIONS } from "@/lib/payments";
import { sendTransactionalEmail } from "@/lib/transactionalEmail";

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
}) {
  const ship = input.fulfillment === "ship";
  const method = ship ? "Shipping" : input.fulfillment === "pickup" ? "Local Pickup" : "Choose fulfillment at checkout";
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
  return `<p>POW, ${escapeHtml(input.name)}!</p>
<p>You won <strong>${escapeHtml(input.title)}</strong>. Invoice <strong>${escapeHtml(input.invoice)}</strong>.</p>
<p>Fulfillment: <strong>${escapeHtml(method)}</strong><br/>${escapeHtml(input.address || "Confirm your address at checkout.")}</p>
${ship ? "" : `<p>${escapeHtml(PICKUP_INSTRUCTIONS)}</p>`}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:16px 0;">${table}</table>
<p>
  <a href="${escapeHtml(input.payHref)}" style="display:inline-block;background:#FF0000;color:#FFFFFF;padding:12px 18px;border:4px solid #000;font-weight:bold;text-decoration:none;">Pay with Helcim</a>
  &nbsp;
  <a href="${escapeHtml(input.cashHref)}" style="display:inline-block;background:#FFFFFF;color:#000000;padding:12px 18px;border:4px solid #000;font-weight:bold;text-decoration:none;">Request Cash Payment on Pickup</a>
</p>
<p><a href="${escapeHtml(input.lotHref)}">View lot</a> · <a href="${escapeHtml(publicAppUrl() + "/checkout")}">My won items / invoices</a></p>`;
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

export function consignmentApprovedEmailHtml(input: {
  name: string;
  title: string;
  lotHref: string;
  dashboardHref: string;
}) {
  return `<p>Hi ${escapeHtml(input.name || "Consignor")},</p>
<p>Good news: DealFinder approved <strong>${escapeHtml(input.title)}</strong> and filed it into the live sale.</p>
<p><a href="${escapeHtml(input.lotHref)}" style="color:#111111;font-weight:bold;">View the lot</a></p>
<p>You can track your consignments after you log in: <a href="${escapeHtml(input.dashboardHref)}">${escapeHtml(input.dashboardHref)}</a></p>`;
}

export async function sendConsignmentApprovedEmail(input: {
  to: string;
  name: string;
  title: string;
  lotId?: string;
  slug?: string | null;
}) {
  const dashboard = `${publicAppUrl()}/consignor`;
  const link = input.lotId ? lotHref(input.slug || input.lotId) : dashboard;
  const displayName = input.name || "Consignor";
  return sendTransactionalEmail({
    templateId: "consignment_approved",
    to: input.to,
    forceDeliver: true,
    simpleLayout: true,
    vars: {
      customer_name: displayName,
      item_title: input.title,
      winning_bid: "",
      payment_link: dashboard,
      lot_link: link,
    },
    htmlOverride: consignmentApprovedEmailHtml({
      name: displayName,
      title: input.title,
      lotHref: link,
      dashboardHref: dashboard,
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
  };
  lotId?: string;
  slug?: string | null;
  lotTitle?: string;
}) {
  const recipient = await resolveConsignorEmail(input.supabase, input.row);
  if (!recipient) {
    console.warn("consignment_approved_no_email", { title: input.row.title });
    return { ok: false, skipped: true as const };
  }
  return sendConsignmentApprovedEmail({
    to: recipient.email,
    name: recipient.name,
    title: input.lotTitle || String(input.row.title ?? "your item"),
    lotId: input.lotId,
    slug: input.slug,
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
}) {
  const payHref = checkoutHref(input.lotId);
  const cashHref = `${checkoutHref(input.lotId)}&cash=1`;
  const html = invoiceEmailHtml({
    name: input.name,
    invoice: input.invoice,
    title: input.title,
    lotHref: lotHref(input.slug || input.lotId),
    payHref,
    cashHref,
    fees: input.fees,
    fulfillment: input.fulfillment,
    address: input.address,
  });
  return sendTransactionalEmail({
    templateId: "winning_invoice",
    to: input.to,
    vars: {
      customer_name: input.name,
      item_title: input.title,
      winning_bid: formatCurrency(input.fees.hammer),
      payment_link: payHref,
      lot_link: lotHref(input.slug || input.lotId),
      cash_link: cashHref,
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

export async function notifyWin(input: Parameters<typeof sendWinInvoiceEmail>[0]) {
  return sendWinInvoiceEmail(input);
}

export { invoiceFees };
