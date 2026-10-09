import { writeFileSync } from "node:fs";
import { zipStoredTextFiles } from "../lib/xlsxWorkbook";

type Row = {
  email: string;
  setup: "Automated" | "Manual" | "Saved only";
  recipient: string;
  desk: "Yes" | "No";
  trigger: string;
  template: string;
  subject: string;
};

const invoiceRules: Array<[string, string, string]> = [
  [
    "Buy Now, paid online",
    "One invoice. Subject starts with Pay now.",
    "The moment the buyer claims the item.",
  ],
  [
    "Auction win, paid online",
    "One invoice for that buyer's lots in the sale.",
    "Sunday, when the auction closes (about 6:05 p.m. Calgary).",
  ],
  [
    "Cash permission, pays cash",
    "One invoice. Subject says pickup.",
    "When the desk marks the lots picked up. Approving a cash request also marks them picked up, so that button sends the invoice too. Mark paid in cash by itself does not send anything.",
  ],
  [
    "Cash permission, then pays by card",
    "One invoice.",
    "When the Helcim payment clears, and only if an invoice has not already gone out.",
  ],
  [
    "Delivery",
    "One shipping email with the lots, postage, the $10 handling fee, and the tracking number.",
    "When the desk presses Mark shipped. Tracking has to be filled in first. This does not replace the pay invoice.",
  ],
];

const emails: Row[] = [
  {
    email: "Welcome",
    setup: "Automated",
    recipient: "New bidder",
    desk: "No",
    trigger: "Sent when the account is created. Once.",
    template: "welcome",
    subject: "Confirm your DealFinder Auctions email",
  },
  {
    email: "Password reset",
    setup: "Automated",
    recipient: "That bidder",
    desk: "No",
    trigger: "They use Forgot password, or staff send a reset from the customer desk.",
    template: "password_reset",
    subject: "Reset your DealFinder paddle password",
  },
  {
    email: "Outbid",
    setup: "Automated",
    recipient: "Previous high bidder",
    desk: "No",
    trigger: "Someone else takes the high bid on a lot they were winning.",
    template: "outbid",
    subject: "You've been outbid on {{item_title}}",
  },
  {
    email: "Sunday bid reminder",
    setup: "Automated",
    recipient: "Every active account",
    desk: "No",
    trigger: "Sunday, once, during the reminder window. Cron at 16:00 UTC and 17:00 UTC, and the live clock.",
    template: "sunday_bid_reminder",
    subject: "Sunday reminder: get your bids in before 6 p.m.",
  },
  {
    email: "$50 hold failed",
    setup: "Automated",
    recipient: "Bidder whose hold did not clear",
    desk: "No",
    trigger: "Sunday pre-auth sweep, once that day. Cron Sunday 16:00 UTC. Bids are forfeited if the hold is still missing after the hammer.",
    template: "hold_failed",
    subject: "Your $50 DealFinder hold did not go through",
  },
  {
    email: "Winning invoice",
    setup: "Automated",
    recipient: "Card or online buyer",
    desk: "No",
    trigger: "Buy Now: the moment they claim the item. Auction: Sunday when that sale closes. One email per invoice. A later card payment does not send it again.",
    template: "winning_invoice",
    subject: "Pay now — {title}  or  Your DealFinder receipt",
  },
  {
    email: "Winning invoice — pickup",
    setup: "Automated",
    recipient: "Cash-permitted buyer",
    desk: "No",
    trigger: "Trusted cash client, or cash pickup approved for that auction. Sent when the desk marks the lots picked up, or when a cash request is approved (that also marks pickup). Mark paid in cash does not send this.",
    template: "winning_invoice",
    subject: "Your DealFinder invoice — pickup",
  },
  {
    email: "Winning invoice — card after cash permission",
    setup: "Automated",
    recipient: "Cash-permitted buyer who pays by card",
    desk: "No",
    trigger: "Helcim payment clears, and only if no invoice email was sent yet. Pickup will not send a second copy.",
    template: "winning_invoice",
    subject: "Your DealFinder invoice",
  },
  {
    email: "Order shipped",
    setup: "Automated",
    recipient: "Buyer whose lots are shipping",
    desk: "No",
    trigger: "Desk presses Mark shipped. Includes postage, the $10 handling fee, and the tracking number. Once per invoice.",
    template: "order_shipped",
    subject: "Your DealFinder order is on the way — {invoice}",
  },
  {
    email: "Consignment received",
    setup: "Automated",
    recipient: "Consignor",
    desk: "No",
    trigger: "They submit an item.",
    template: "consignment_received",
    subject: "We received your consignment — {title}",
  },
  {
    email: "Consignment approved",
    setup: "Automated",
    recipient: "Consignor",
    desk: "No",
    trigger: "Desk approves the item.",
    template: "consignment_approved",
    subject: "Your consignment is approved — {title}",
  },
  {
    email: "Consignment rejected",
    setup: "Automated",
    recipient: "Consignor",
    desk: "No",
    trigger: "Desk turns the item down.",
    template: "consignment_rejected",
    subject: "DealFinder did not accept {title}",
  },
  {
    email: "Sold notice",
    setup: "Automated",
    recipient: "Consignor",
    desk: "No",
    trigger: "Their lot sells. House stock is skipped. Once per lot. Buy Now says the sale happened immediately. Auction says it sold.",
    template: "consignor_payout",
    subject: "Sold — {title}  or  Sale invoice — {title}",
  },
  {
    email: "Payout sent",
    setup: "Automated",
    recipient: "Consignor",
    desk: "No",
    trigger: "Desk records that the consignor's share was sent.",
    template: "consignor_payout",
    subject: "Payout sent — {title}",
  },
  {
    email: "Cash bid received",
    setup: "Automated",
    recipient: "Bidder",
    desk: "No",
    trigger: "They ask to bid with cash on pickup. Tells them the desk still has to approve it.",
    template: "cash_bid_received",
    subject: "Cash pickup bidding is with the desk — {auction}",
  },
  {
    email: "Cash bid approved",
    setup: "Automated",
    recipient: "Bidder",
    desk: "No",
    trigger: "Desk approves cash-on-pickup bidding for that auction.",
    template: "cash_bid_approved",
    subject: "You can bid with cash pickup — {auction}",
  },
  {
    email: "Cash bid rejected",
    setup: "Automated",
    recipient: "Bidder",
    desk: "No",
    trigger: "Desk turns down cash-on-pickup bidding. They can still bid with the $50 card hold.",
    template: "cash_bid_rejected",
    subject: "Cash pickup bidding was not approved — {auction}",
  },
  {
    email: "Shipping quote",
    setup: "Manual",
    recipient: "Buyer",
    desk: "No",
    trigger: "Staff press Email quote on the shipping desk. Postage estimate only. Pressing it again sends it again. Tracking goes out later on Mark shipped.",
    template: "shipping_quote",
    subject: "Shipping quote for {invoice}",
  },
  {
    email: "New consignment",
    setup: "Automated",
    recipient: "DealFinder desk",
    desk: "Yes",
    trigger: "A consignor submits an item. Opens the desk notifications.",
    template: "admin_consignment_alert",
    subject: "New consignment waiting for approval — {title}",
  },
  {
    email: "Counter accepted or declined",
    setup: "Automated",
    recipient: "DealFinder desk",
    desk: "Yes",
    trigger: "A consignor accepts or declines a counter-offer.",
    template: "admin_consignment_alert",
    subject: "{name} accepted or declined the counter",
  },
  {
    email: "Cash bid request",
    setup: "Automated",
    recipient: "DealFinder desk",
    desk: "Yes",
    trigger: "A bidder asks for permission to bid with cash on pickup.",
    template: "cash_bid_auth",
    subject: "Cash bidding request — {name}",
  },
  {
    email: "Cash payment request",
    setup: "Automated",
    recipient: "DealFinder desk",
    desk: "Yes",
    trigger: "A buyer asks to pay an invoice in cash, and they are not already a trusted cash client.",
    template: "admin_cash_alert",
    subject: "Cash on pickup waiting for approval — {name}",
  },
  {
    email: "Winning reservation",
    setup: "Saved only",
    recipient: "Nobody",
    desk: "No",
    trigger: "Stored in the email engine. Nothing sends it. It used to say pay on Sunday and would have doubled the real invoice.",
    template: "winning_reservation",
    subject: "Congratulations! You're the Winning Bidder",
  },
  {
    email: "Payment reminder",
    setup: "Saved only",
    recipient: "Nobody",
    desk: "No",
    trigger: "Stored in the email engine. Nothing sends it.",
    template: "payment_reminder",
    subject: "Payment reminder",
  },
  {
    email: "Cash receipt",
    setup: "Saved only",
    recipient: "Nobody",
    desk: "No",
    trigger: "Stored in the email engine. Nothing sends it. Cash buyers get the pickup invoice instead, so they do not get a receipt and an invoice.",
    template: "cash_receipt",
    subject: "Paid in cash — {title}",
  },
];

function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colLetter(index: number) {
  let n = index;
  let out = "";
  while (n >= 0) {
    out = String.fromCharCode((n % 26) + 65) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

const widths = {
  rules: [34, 62, 78],
  emails: [42, 16, 36, 16, 78, 28, 52],
};

function sheetXml(name: string, header: string[], rows: string[][], widthList: number[]) {
  const cols = widthList
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const all = [header, ...rows];
  const body = all
    .map((row, rowIndex) => {
      const setup = row[1];
      const desk = row[3];
      let style = 2;
      if (rowIndex === 0) style = 1;
      else if (name === "Emails" && setup === "Manual") style = 4;
      else if (name === "Emails" && setup === "Saved only") style = 5;
      else if (name === "Emails" && desk === "Yes") style = 3;
      const cells = row
        .map((value, colIndex) => {
          const ref = `${colLetter(colIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
        })
        .join("");
      const lines = Math.max(...row.map((value) => Math.ceil(value.length / 70)), 1);
      const height = rowIndex === 0 ? 22 : Math.min(78, 18 + (lines - 1) * 15);
      return `<row r="${rowIndex + 1}" ht="${height}" customHeight="1">${cells}</row>`;
    })
    .join("");
  const lastCol = colLetter(header.length - 1);
  const lastRow = all.length;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${body}</sheetData>
<autoFilter ref="A1:${lastCol}${lastRow}"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
</fonts>
<fills count="7">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF111111"/><bgColor rgb="FF111111"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF7D1"/><bgColor rgb="FFFFF7D1"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFE0E0"/><bgColor rgb="FFFFE0E0"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF4CC"/><bgColor rgb="FFFFF4CC"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8E8E8"/><bgColor rgb="FFE8E8E8"/></patternFill></fill>
</fills>
<borders count="1"><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="6" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
</styleSheet>`;

function workbook() {
  const rulesSheet = sheetXml(
    "Invoice rules",
    ["Situation", "What the buyer gets", "When"],
    invoiceRules,
    widths.rules,
  );
  const emailSheet = sheetXml(
    "Emails",
    ["Email", "Setup", "Who receives it", "DealFinder desk", "What sets it off", "Template id", "Subject"],
    emails.map((row) => [row.email, row.setup, row.recipient, row.desk, row.trigger, row.template, row.subject]),
    widths.emails,
  );
  const deskRows = emails.filter((row) => row.desk === "Yes");
  const deskSheet = sheetXml(
    "DealFinder desk",
    ["Email", "Setup", "Who receives it", "DealFinder desk", "What sets it off", "Template id", "Subject"],
    deskRows.map((row) => [row.email, row.setup, row.recipient, row.desk, row.trigger, row.template, row.subject]),
    widths.emails,
  );
  const sheets = [
    { name: "Invoice rules", body: rulesSheet },
    { name: "Emails", body: emailSheet },
    { name: "DealFinder desk", body: deskSheet },
  ];
  const workbookSheets = sheets
    .map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  const rels = [
    ...sheets.map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    ),
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ].join("");
  const overrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  return zipStoredTextFiles([
    {
      name: "[Content_Types].xml",
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${overrides}
</Types>`,
    },
    {
      name: "_rels/.rels",
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${workbookSheets}</sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
</Relationships>`,
    },
    { name: "xl/styles.xml", body: STYLES },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, body: sheet.body })),
  ]);
}

const out = "DealFinder-emails.xlsx";
writeFileSync(out, workbook());
console.log(out);
