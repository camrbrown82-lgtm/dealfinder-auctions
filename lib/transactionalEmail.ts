import { publicEmailLogoUrl } from "@/lib/appUrl";
import { SITE } from "@/lib/site";
import { Resend } from "resend";
import { getOutbox } from "@/lib/demoEmailStore";
import { buildEmailHtml, buildSimpleEmailHtml, htmlToText, looksLikeHtml } from "@/lib/emailHtml";
import { loadLiveEmailTemplates } from "@/lib/emailService";
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
  subjectOverride?: string;
  forceDeliver?: boolean;
  skipLogo?: boolean;
  simpleLayout?: boolean;
}) {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, mode: "demo-outbox", error: "No recipient" } satisfies MailResult;
  }

  const templates = await loadLiveEmailTemplates();
  const template = templates.find((row) => row.id === input.templateId) ?? templates.find((row) => row.id === "welcome");
  if (!template) {
    return { ok: false, mode: "demo-outbox", error: "Unknown template" } satisfies MailResult;
  }

  const rendered = renderTemplate(template, input.vars);
  const subject = input.subjectOverride || rendered.subject;
  const key = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.RESEND_FROM || "DealFinder Auctions <onboarding@resend.dev>").trim();
  const body = input.htmlOverride || rendered.body;
  const logoSrc = publicEmailLogoUrl();
  const simple = Boolean(
    input.simpleLayout ||
      input.templateId === "welcome" ||
      input.templateId === "consignment_approved" ||
      input.templateId === "consignment_rejected" ||
      input.templateId === "consignment_received" ||
      input.templateId === "cash_bid_auth" ||
      input.templateId === "cash_bid_received" ||
      input.templateId === "cash_bid_approved" ||
      input.templateId === "cash_bid_rejected" ||
      input.templateId === "password_reset" ||
      input.templateId === "sunday_bid_reminder" ||
      input.templateId === "hold_failed" ||
      input.templateId === "admin_consignment_alert" ||
      input.templateId === "admin_cash_alert",
  );
  const html = simple ? buildSimpleEmailHtml(body, logoSrc) : buildEmailHtml(body, logoSrc);
  const text = looksLikeHtml(body) ? htmlToText(html) : body.replaceAll("{{logo}}", "");
  const test = isPaymentTestMode();
  const useResend = Boolean(key) && (input.forceDeliver || !test);

  if (useResend) {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: SITE.email,
      subject,
      text,
      html,
      headers: {
        "X-Entity-Ref-ID": `${input.templateId}-${Date.now()}`,
      },
    });
    if (error) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String((error as { message: string }).message)
          : "Resend failed";
      console.error("resend_send_failed", { templateId: input.templateId, message });
      getOutbox().unshift({
        to,
        subject,
        body: text,
        at: new Date().toISOString(),
        mode: "demo-outbox",
        error: message,
        templateId: input.templateId,
      });
      return { ok: false, mode: "demo-outbox", error: message } satisfies MailResult;
    }
  } else if (!key) {
    console.error("resend_missing_api_key", { templateId: input.templateId });
  }

  getOutbox().unshift({
    to,
    subject,
    body: text,
    at: new Date().toISOString(),
    mode: useResend ? "resend" : "demo-outbox",
    templateId: input.templateId,
  });

  return { ok: true, mode: useResend ? "resend" : "demo-outbox" } satisfies MailResult;
}
