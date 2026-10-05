import { createHmac, timingSafeEqual } from "crypto";
import { absoluteUrl } from "@/lib/seo";

function secret() {
  return (process.env.RECEIPT_SECRET || process.env.ADMIN_PASSWORD || "dealfinder-receipt").trim();
}

export function receiptToken(invoice: string) {
  return createHmac("sha256", secret()).update(invoice.trim()).digest("hex").slice(0, 32);
}

export function receiptTokenOk(invoice: string, token: string | null | undefined) {
  const given = String(token ?? "").trim();
  const expected = receiptToken(invoice);
  if (!given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function receiptPageUrl(invoice: string, download = false) {
  const token = receiptToken(invoice);
  const path = `/receipt/${encodeURIComponent(invoice)}?token=${token}${download ? "&download=1" : ""}`;
  return absoluteUrl(path);
}
