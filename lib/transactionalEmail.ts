import { Resend } from "resend";
import { getOutbox } from "@/lib/demoEmailStore";
import { buildEmailHtml, EMAIL_LOGO_CID, htmlToText, looksLikeHtml } from "@/lib/emailHtml";
import { loadLiveEmailTemplates, resolveEmailLogo } from "@/lib/emailService";
import { renderTemplate } from "@/lib/emailTemplates";
import { isPaymentTestMode } from "@/lib/paymentMode";

export type MailResult = {
  ok: boolean;
  mode: "resend" | "demo-outbox";
  error?: string;
};

export async function sendTransactionalEmail(input: {
  templateId: string;
  to: string;
  vars: Record<string, string>;
  htmlOverride?: string;
}) {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, mode: "demo-outbox", error: "No recipient" } satisfies MailResult;
  }

  const templates = await loadLiveEmailTemplates();
  const template = templates.find((row) => row.id === input.templateId);
  if (!template) {
    return { ok: false, mode: "demo-outbox", error: "Unknown template" } satisfies MailResult;
  }

  const rendered = renderTemplate(template, input.vars);
  const key = (process.env.RESEND_API_KEY || "").trim();
  const from = process.env.RESEND_FROM || "DealFinder Auctions <onboarding@resend.dev>";
  const logo = await resolveEmailLogo();
  const body = input.htmlOverride || rendered.body;
  const html = buildEmailHtml(body, logo ? `cid:${EMAIL_LOGO_CID}` : "/logo.webp");
  const text = looksLikeHtml(body) ? htmlToText(html) : body.replaceAll("{{logo}}", "");
  const test = isPaymentTestMode();
  const useResend = Boolean(key) && !test;

  if (useResend) {
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
      getOutbox().unshift({
        to,
        subject: rendered.subject,
        body: text,
        at: new Date().toISOString(),
        mode: "demo-outbox",
        error: message,
        templateId: input.templateId,
      });
      return { ok: false, mode: "demo-outbox", error: message } satisfies MailResult;
    }
  }

  getOutbox().unshift({
    to,
    subject: rendered.subject,
    body: text,
    at: new Date().toISOString(),
    mode: useResend ? "resend" : "demo-outbox",
    templateId: input.templateId,
  });

  return { ok: true, mode: useResend ? "resend" : "demo-outbox" } satisfies MailResult;
}
