export type EmailTemplateId = string;

export type EmailTemplate = {
  id: EmailTemplateId;
  name: string;
  subject: string;
  body: string;
};

export const TEMPLATE_VARIABLES = [
  "{{logo}}",
  "{{customer_name}}",
  "{{item_title}}",
  "{{winning_bid}}",
  "{{payment_link}}",
] as const;

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "outbid",
    name: "Outbid Notifications",
    subject: "You've been outbid on {{item_title}}",
    body: `Hey {{customer_name}},

Another paddle just jumped {{item_title}}. Current high is {{winning_bid}}.

Jump back in before the clock hits zero.

DealFinder Auctions`,
  },
  {
    id: "winning_invoice",
    name: "Winning Bidder Invoice & Pickup Instructions",
    subject: "You won {{item_title}} — invoice enclosed",
    body: `POW, {{customer_name}}!

You hammered {{item_title}} at {{winning_bid}}.

Pay this invoice with Helcim at checkout: {{payment_link}}

Bring photo ID matching your bidder card.

DealFinder Auctions desk`,
  },
  {
    id: "payment_reminder",
    name: "Payment Reminder / Overdue Notice",
    subject: "Payment reminder: {{item_title}}",
    body: `{{customer_name}},

Invoice for {{item_title}} ({{winning_bid}}) is waiting.

Settle with Helcim here: {{payment_link}}

Overdue lots may be relisted.

DealFinder Auctions`,
  },
  {
    id: "consignor_payout",
    name: "Consignor Weekly Payout Statement",
    subject: "Weekly payout statement — DealFinder",
    body: `{{customer_name}},

This week's statement includes {{item_title}} at hammer {{winning_bid}}.

Payout detail: {{payment_link}}

DealFinder Auctions`,
  },
  {
    id: "welcome",
    name: "Welcome / Bidder Card",
    subject: "You're on the floor — DealFinder Auctions",
    body: `Hey {{customer_name}},

Your bidder card is live. Browse lots, drop a paddle, and keep an eye on the clock.

If we need a payment, Helcim checkout is here: {{payment_link}}

DealFinder Auctions`,
  },
  {
    id: "password_reset",
    name: "Password Reset / Staff Alert",
    subject: "Reset your DealFinder paddle password",
    body: `{{customer_name}},

Staff requested a password reset for this paddle.

Set a new password: {{payment_link}}

If you did not ask for this, tell the desk.

DealFinder Auctions`,
  },
];

export function slugifyTemplateId(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
  return slug || `template_${Date.now()}`;
}

export function mergeEmailTemplates(
  rows: Array<{ id: string; name?: string; subject: string; body: string }>,
): EmailTemplate[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const merged = DEFAULT_EMAIL_TEMPLATES.map((base) => {
    const row = byId.get(base.id);
    return row
      ? {
          id: base.id,
          name: row.name?.trim() || base.name,
          subject: row.subject,
          body: row.body,
        }
      : { ...base };
  });
  const known = new Set(DEFAULT_EMAIL_TEMPLATES.map((row) => row.id));
  for (const row of rows) {
    if (known.has(row.id)) continue;
    merged.push({
      id: row.id,
      name: row.name?.trim() || row.id,
      subject: row.subject,
      body: row.body,
    });
  }
  return merged;
}

export function renderTemplate(
  template: Pick<EmailTemplate, "subject" | "body">,
  vars: Record<string, string>,
) {
  const fill = (text: string) =>
    text
      .replaceAll("{{customer_name}}", vars.customer_name ?? "")
      .replaceAll("{{item_title}}", vars.item_title ?? "")
      .replaceAll("{{winning_bid}}", vars.winning_bid ?? "")
      .replaceAll("{{payment_link}}", vars.payment_link ?? "");
  return { subject: fill(template.subject), body: fill(template.body) };
}
