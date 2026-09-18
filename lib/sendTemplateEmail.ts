import { Resend } from "resend";
import { getOutbox } from "@/lib/demoEmailStore";
import { renderTemplate } from "@/lib/emailTemplates";
import { buildEmailHtml, EMAIL_LOGO_CID, htmlToText, looksLikeHtml } from "@/lib/emailBrand";
import { loadLiveEmailTemplates, resolveEmailLogo } from "@/lib/emailService";

export type TemplateEmailVars = {
  customer_name?: string;
  item_title?: string;
  winning_bid?: string;
  payment_link?: string;
};

export async function sendTemplateEmail(input: {
  templateId: string;
  to: string | string[];
  vars?: TemplateEmailVars;
}): Promise<{
  ok: boolean;
  error?: string;
  mode: "resend" | "demo-outbox";
  sent: number;
  preview?: { subject: string; body: string; html: string };
}> {
  const templates = await loadLiveEmailTemplates();
  const template = templates.find((row) => row.id === input.templateId);
  if (!template) {
    return { ok: false, error: "Unknown template.", mode: "demo-outbox", sent: 0 };
  }

  const to = (Array.isArray(input.to) ? input.to : [input.to])
    .map((item) => item.trim())
    .filter(Boolean);
  if (to.length === 0) {
    return { ok: false, error: "Add at least one recipient email.", mode: "demo-outbox", sent: 0 };
  }

  const rendered = renderTemplate(template, {
    customer_name: input.vars?.customer_name || "Paddle",
    item_title: input.vars?.item_title || "Lot",
    winning_bid: input.vars?.winning_bid || "$0",
    payment_link: input.vars?.payment_link || "/checkout",
  });

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "DealFinder Auctions <onboarding@resend.dev>";
  const logo = await resolveEmailLogo();
  const html = buildEmailHtml(rendered.body, logo ? `cid:${EMAIL_LOGO_CID}` : "/logo.webp");
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
      return { ok: false, error: message, mode: "resend", sent: 0 };
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

  return {
    ok: true,
    mode: key ? "resend" : "demo-outbox",
    sent: to.length,
    preview: { subject: rendered.subject, body: text, html },
  };
}
