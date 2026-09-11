import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { sendTemplateEmail } from "@/lib/store";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const result = await sendTemplateEmail({
      templateId: body.templateId,
      to: String(body.to || ""),
      customer_name: String(body.customer_name || ""),
      item_title: String(body.item_title || ""),
      winning_bid: String(body.winning_bid || ""),
      payment_link: String(body.payment_link || ""),
      previewOnly: Boolean(body.previewOnly),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Send failed." }, { status: 400 });
  }
}
