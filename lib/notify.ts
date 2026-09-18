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

export async function sendWelcomeEmail(to: string, name: string) {
  return sendTransactionalEmail({
    templateId: "welcome",
    to,
    vars: {
      customer_name: name || "Bidder",
      item_title: "the floor",
      winning_bid: "",
      payment_link: `${publicAppUrl()}/live`,
      lot_link: `${publicAppUrl()}/live`,
    },
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
