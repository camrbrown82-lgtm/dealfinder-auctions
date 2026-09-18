import { BID_PREAUTH_AMOUNT, PREAUTH_AGREEMENT } from "@/lib/helcimCopy";
import { FEE_DISCLOSURE } from "@/lib/invoiceFees";
import { resolvedAuctionTerms } from "@/lib/tcTemplates";
import type { AuctionEvent } from "@/lib/utils";

export type AuctionTermsSection = {
  heading: string;
  paragraphs: string[];
};

export type AuctionTermsPack = {
  title: string;
  auctionName: string;
  auctionNumber: string;
  endsAt: string;
  preauthAmount: number;
  intro: string;
  termsText: string;
  sections: AuctionTermsSection[];
  termsCheckbox: string;
  preauthCheckbox: string;
};

export function formatAuctionEnd(endsAt: string) {
  const date = new Date(endsAt);
  if (Number.isNaN(date.getTime())) return endsAt;
  return date.toLocaleString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Edmonton",
  });
}

export function auctionTermsPack(
  event: Pick<
    AuctionEvent,
    "name" | "auctionNumber" | "startsAt" | "endsAt" | "bidderTerms" | "termsAndConditions" | "tcTemplateType"
  >,
): AuctionTermsPack {
  const auctionNumber = event.auctionNumber?.trim() || "this sale";
  const auctionName = event.name?.trim() || "Weekly sale";
  const endsLabel = formatAuctionEnd(event.endsAt);
  const baseTerms = resolvedAuctionTerms(event);
  const termsText = /\$10|handling fee|15%/i.test(baseTerms)
    ? baseTerms
    : `${baseTerms.trim()}\n\n${FEE_DISCLOSURE}`;
  const sections: AuctionTermsSection[] = termsText
    .split(/\n(?=\d+\.\s)/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [first, ...rest] = block.split("\n");
      return {
        heading: first?.trim() || `${auctionNumber} terms`,
        paragraphs: rest.join("\n").trim() ? [rest.join("\n").trim()] : [],
      };
    });

  return {
    title: `Terms & Conditions · ${auctionNumber}`,
    auctionName,
    auctionNumber,
    endsAt: event.endsAt,
    preauthAmount: BID_PREAUTH_AMOUNT,
    intro: `Read the terms for ${auctionName} before you drop a paddle. The $${BID_PREAUTH_AMOUNT} pre-authorization is for this auction only — not a charge until you pay a winning invoice. Winning invoices add a 15% buyer's premium and 5% GST; shipped orders also add a $10 handling fee plus carrier postage.`,
    termsText,
    sections: sections.length
      ? sections
      : [{ heading: `${auctionNumber} terms`, paragraphs: [termsText] }],
    termsCheckbox: `I have read and agree to the Terms & Conditions for ${auctionNumber} (${auctionName}), ending ${endsLabel}, including the 15% buyer's premium, 5% GST, and $10 shipping handling fee plus carrier postage on shipped lots.`,
    preauthCheckbox: PREAUTH_AGREEMENT,
  };
}
