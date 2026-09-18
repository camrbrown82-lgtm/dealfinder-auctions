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
  "{{lot_link}}",
  "{{cash_link}}",
  "{{invoice_total}}",
  "{{verify_link}}",
] as const;

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "outbid",
    name: "Outbid Notifications",
    subject: "You've been outbid on {{item_title}}",
    body: `Hey {{customer_name}},

Another paddle just jumped {{item_title}}. Current high is {{winning_bid}}.

Re-bid now: {{lot_link}}

DealFinder Auctions`,
  },
  {
    id: "winning_invoice",
    name: "Winning Bidder Invoice & Pickup Instructions",
    subject: "You won {{item_title}} — invoice enclosed",
    body: `POW, {{customer_name}}!

You hammered {{item_title}} at {{winning_bid}}.

Choose local pickup or shipping, then pay with Helcim: {{payment_link}}

Or request cash payment on pickup: {{cash_link}}

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
    subject: "Confirm your DealFinder Auctions email",
    body: `Hi {{customer_name}},

Thanks for creating a DealFinder Auctions bidder account. Please confirm this email address so you can bid.

Confirm your email: {{verify_link}}

If you did not create this account, you can ignore this message.

    DealFinder Auctions
529 Gateway Rd NE, Airdrie, AB T4B 0J6`,
  },
  {
    id: "consignment_approved",
    name: "Consignment Approved",
    subject: "Your consignment is approved — {{item_title}}",
    body: `Hi {{customer_name}},

Good news: DealFinder approved {{item_title}} and filed it into the live sale.

View the lot: {{lot_link}}

Track your consignments after you log in: {{payment_link}}

DealFinder Auctions
529 Gateway Rd NE, Airdrie, AB T4B 0J6`,
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
  {
    id: "cash_receipt",
    name: "Cash Payment Receipt",
    subject: "Paid in cash — {{item_title}}",
    body: `{{customer_name}},

Cash payment for {{item_title}} ({{winning_bid}}) is approved. This email is your receipt.

See invoices: {{payment_link}}

DealFinder Auctions`,
  },
  {
    id: "cash_bid_auth",
    name: "Cash Bid Authorization Request",
    subject: "Cash bidding request — {{customer_name}}",
    body: `{{customer_name}} ({{item_title}}) asked to bid with cash on pickup.

Auction: {{winning_bid}}
Requested: {{invoice_total}}

Review and approve or reject: {{payment_link}}

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
    const body =
      row &&
      !(
        base.id === "welcome" &&
        (/helcim|payment_link|checkout|Nothing is charged|paste this link/i.test(row.body) ||
          !/verify_link|Verify Account/i.test(row.body))
      )
        ? row.body
        : base.body;
    return row
      ? {
          id: base.id,
          name: row.name?.trim() || base.name,
          subject: base.id === "welcome" ? base.subject : row.subject,
          body,
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
    Object.entries(vars).reduce(
      (current, [key, value]) => current.replaceAll(`{{${key}}}`, value ?? ""),
      text,
    );
  return { subject: fill(template.subject), body: fill(template.body) };
}
