import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { sendShippingQuoteEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as {
    to?: string;
    name?: string;
    invoice?: string;
    postage?: number;
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    lots?: string[];
  };
  const to = String(body.to ?? "").trim();
  if (!to || !body.invoice) {
    return NextResponse.json({ error: "A customer email and invoice are required." }, { status: 400 });
  }
  const result = await sendShippingQuoteEmail({
    to,
    name: String(body.name ?? ""),
    invoice: String(body.invoice),
    postage: Number(body.postage) || 0,
    weightKg: Number(body.weightKg) || 0,
    lengthCm: Number(body.lengthCm) || 0,
    widthCm: Number(body.widthCm) || 0,
    heightCm: Number(body.heightCm) || 0,
    lots: Array.isArray(body.lots) ? body.lots.map(String) : [],
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Could not send the shipping quote." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
