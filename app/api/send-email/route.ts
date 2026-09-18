import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getOutbox } from "@/lib/demoEmailStore";
import { renderTemplate } from "@/lib/emailTemplates";
import { buildEmailHtml, EMAIL_LOGO_CID, htmlToText, looksLikeHtml } from "@/lib/emailBrand";
import { loadLiveEmailTemplates, resolveEmailLogo } from "@/lib/emailService";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  return NextResponse.json({ outbox: getOutbox().slice(0, 40) });
}

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

  const templates = await loadLiveEmailTemplates();
  const template = templates.find((row) => row.id === body.templateId);
  if (!template) {
    return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  }

  const rendered = renderTemplate(template, {
    customer_name: body.customer_name || "Paddle",
    item_title: body.item_title || "Lot",
    winning_bid: body.winning_bid || "$0",
    payment_link: body.payment_link || "/checkout",
  });

  const recipients = (body.to ?? "")
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!body.broadcast && recipients.length === 0) {
    return NextResponse.json({ error: "Add at least one recipient email." }, { status: 400 });
  }

  const to = body.broadcast && recipients.length === 0 ? ["floor@dealfinder.auctions"] : recipients;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "DealFinder Auctions <onboarding@resend.dev>";
  const logo = await resolveEmailLogo();
  const html = buildEmailHtml(
    rendered.body,
    logo ? `cid:${EMAIL_LOGO_CID}` : "/logo.webp",
  );
  const text = looksLikeHtml(rendered.body) ? htmlToText(html) : rendered.body.replaceAll("{{logo}}", "");

  if (key) {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from,
      to,
      subject: rendered.subject,
      text,
      html,
      attachments: logo
        ? [
            {
              filename: logo.filename,
              content: logo.buffer,
              contentType: logo.contentType,
              contentId: EMAIL_LOGO_CID,
            },
          ]
        : undefined,
    });
    if (error) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String((error as { message: string }).message)
          : "Resend failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  for (const address of to) {
    getOutbox().unshift({
      to: address,
      subject: rendered.subject,
      body: text,
      at: new Date().toISOString(),
      mode: key ? "resend" : "demo-outbox",
    });
  }

  return NextResponse.json({
    ok: true,
    sent: to.length,
    mode: key ? "resend" : "demo-outbox",
    preview: { subject: rendered.subject, body: text, html },
  });
}
