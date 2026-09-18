import { parseTcTemplateType, type TcTemplateType } from "@/lib/tcTemplates";
import type { AuctionEvent } from "@/lib/utils";

export type AuctionEventRow = {
  id: string;
  name: string;
  auction_number?: string | null;
  starts_at: string;
  ends_at: string;
  archived_at?: string | null;
  bidder_terms?: string | null;
  terms_and_conditions?: string | null;
  tc_template_type?: string | null;
  invoice_batch_sent_at?: string | null;
};

export function mapAuctionEvent(row: AuctionEventRow): AuctionEvent {
  const terms =
    String(row.terms_and_conditions ?? "").trim() || String(row.bidder_terms ?? "").trim() || "";
  const tcTemplateType: TcTemplateType = parseTcTemplateType(row.tc_template_type);
  return {
    id: row.id,
    name: row.name,
    auctionNumber: row.auction_number ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    archivedAt: row.archived_at ?? null,
    tcTemplateType,
    termsAndConditions: terms,
    bidderTerms: terms || null,
    invoiceBatchSentAt: row.invoice_batch_sent_at ?? null,
  };
}

export function auctionTermsColumns(input: {
  tcTemplateType?: TcTemplateType | string | null;
  termsAndConditions?: string | null;
}) {
  const type = parseTcTemplateType(input.tcTemplateType);
  const text = String(input.termsAndConditions ?? "").trim();
  return {
    tc_template_type: type,
    terms_and_conditions: text,
    bidder_terms: text,
  };
}
