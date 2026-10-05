import { escapeHtml } from "@/lib/emailHtml";
import { formatCurrency } from "@/lib/utils";
import { SITE } from "@/lib/site";
import type { InvoiceFeeBreakdown } from "@/lib/invoiceFees";
import type { SettlementLot } from "@/lib/settlements";

export function receiptHtml(input: {
  invoice: string;
  name: string;
  email?: string;
  lots: SettlementLot[];
  fees: InvoiceFeeBreakdown;
  downloadHref?: string;
}) {
  const rows = input.lots
    .map((lot, index) => {
      const photo = lot.image
        ? `<img src="${escapeHtml(lot.image)}" alt="" width="72" height="72" style="display:block;width:72px;height:72px;object-fit:cover;border:2px solid #000;" />`
        : `<div style="width:72px;height:72px;border:2px solid #000;font-size:11px;line-height:72px;text-align:center;">No photo</div>`;
      return `<tr style="background:${index % 2 ? "#FFF7D1" : "#FFFFFF"};">
<td style="padding:8px;border:2px solid #000;">${photo}</td>
<td style="padding:8px;border:2px solid #000;font-weight:bold;">${escapeHtml(lot.lotNumber || "—")}</td>
<td style="padding:8px;border:2px solid #000;">${escapeHtml(lot.title || "Untitled lot")}</td>
<td style="padding:8px;border:2px solid #000;text-align:right;font-weight:bold;">${escapeHtml(formatCurrency(lot.hammer))}</td>
</tr>`;
    })
    .join("");
  const totals = [
    ["Hammer", input.fees.hammer],
    ["15% buyer's premium", input.fees.premium],
    ...(input.fees.handling > 0 ? [["Shipping handling", input.fees.handling] as const] : []),
    ...(input.fees.shipping > 0 ? [["Shipping", input.fees.shipping] as const] : []),
    ["5% GST", input.fees.gst],
    ["Total due", input.fees.total],
  ];
  const totalRows = totals
    .map(
      ([label, value], index) =>
        `<tr style="background:${index % 2 ? "#FFF7D1" : "#FFFFFF"};">
<td style="padding:8px;border:2px solid #000;">${escapeHtml(String(label))}</td>
<td style="padding:8px;border:2px solid #000;text-align:right;font-weight:bold;">${escapeHtml(formatCurrency(Number(value)))}</td>
</tr>`,
    )
    .join("");
  const download = input.downloadHref
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(input.downloadHref)}" style="display:inline-block;background:#111;color:#fff;padding:12px 18px;font-weight:bold;text-decoration:none;">Download receipt</a></p>`
    : "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(input.invoice)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  @media print { a { display: none; } }
</style>
</head>
<body>
<p style="letter-spacing:0.12em;font-size:12px;font-weight:bold;">DEALFINDER AUCTIONS</p>
<h1>Receipt ${escapeHtml(input.invoice)}</h1>
<p>${escapeHtml(input.name || "Bidder")}${input.email ? ` · ${escapeHtml(input.email)}` : ""}</p>
<p>These are the lots you won and the price each one sold for.</p>
<table>
<tr style="background:#FF0000;color:#fff;">
<th style="padding:8px;border:2px solid #000;text-align:left;">Photo</th>
<th style="padding:8px;border:2px solid #000;text-align:left;">Lot</th>
<th style="padding:8px;border:2px solid #000;text-align:left;">Item</th>
<th style="padding:8px;border:2px solid #000;text-align:right;">Sold for</th>
</tr>
${rows || `<tr><td colspan="4" style="padding:8px;border:2px solid #000;">No lots on this receipt.</td></tr>`}
</table>
<table>${totalRows}</table>
${download}
<p>${escapeHtml(SITE.name)}<br/>${escapeHtml(SITE.addressLine)}<br/>${escapeHtml(SITE.cityLine)}<br/>${escapeHtml(SITE.phoneDisplay)}</p>
</body>
</html>`;
}
