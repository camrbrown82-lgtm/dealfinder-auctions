import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { sendTemplateEmail } from "@/lib/sendTemplateEmail";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();

  const body = (await request.json()) as {
    templateId?: string;
    to?: string;
    broadcast?: boolean;
    customer_name?: string;
    item_title?: string;
    winning_bid?: string;
    payment_link?: string;
  };

  const recipients = (body.to ?? "")
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!body.broadcast && recipients.length === 0) {
    return NextResponse.json({ error: "Add at least one recipient email." }, { status: 400 });
  }

  const to = body.broadcast && recipients.length === 0 ? ["floor@dealfinder.auctions"] : recipients;
  const result = await sendTemplateEmail({
    templateId: body.templateId || "",
    to,
    vars: {
      customer_name: body.customer_name,
      item_title: body.item_title,
      winning_bid: body.winning_bid,
      payment_link: body.payment_link,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Could not send email." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    mode: result.mode,
    preview: result.preview,
  });
}
