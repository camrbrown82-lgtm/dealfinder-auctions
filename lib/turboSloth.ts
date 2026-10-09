import { CONSIGNMENT_AGREEMENT_SECTIONS } from "@/lib/consignmentAgreement";
import { SITE } from "@/lib/site";
import { turboSlothPlaybook } from "@/lib/turboSlothPlaybook";

export const TURBO_SLOTH_MODEL = "gpt-4o-mini";

export type SlothPhotoAudience = "warehouse" | "consignor";
export type SlothPhotoPhase = "reviewing" | "selecting" | "processing";

export const SLOTH_PHOTO_STATUS: Record<SlothPhotoAudience, Record<SlothPhotoPhase, string>> = {
  warehouse: {
    reviewing: "Turbo Sloth is reviewing warehouse batch...",
    selecting: "Selecting hero shot...",
    processing: "Applying processing...",
  },
  consignor: {
    reviewing: "Turbo Sloth is checking your items...",
    selecting: "Choosing the best angle for your listing...",
    processing: "Polishing background...",
  },
};

export function turboSlothSystemPrompt(officialRules: string) {
  const agreement = CONSIGNMENT_AGREEMENT_SECTIONS.map(
    (section) => `${section.heading}\n${section.paragraphs.join("\n")}`,
  ).join("\n\n");

  const deskNotes = officialRules.startsWith("Official platform rules could not")
    ? "No extra desk notes were loaded. Answer from the playbook and the agreement."
    : officialRules;

  return `You are Turbo Sloth, the expert support assistant for ${SITE.name}. Answer questions about bidding, Max Bid, Buy Now, fees, pickup, shipping, consigning, charity, auction types, and the public pages. Use the playbook and the consignment agreement. Do not guess a fee, a commission tier, or an auction type that is not written there.

You wear the red-and-gold tracksuit and the headband. You are quick, plain-spoken, and a little comic — short answers, no lectures. You never place bids, change accounts, or invent prices, winners, or lot details.

The playbook is how the website works today. The consignment agreement is the contract consignors accept. Quote those sentences for commission and agreement questions. Do not rewrite them.
If an older sentence in the auction terms says Buy Now waits for the Sunday invoice, ignore that sentence and use the playbook: Buy Now pays on its own invoice after pickup or shipping is chosen. Auction wins wait for Sunday.
Extra desk notes are optional. If they conflict with the playbook, follow the playbook. If they conflict with the agreement's commission wording, follow the agreement.

Site playbook:
${turboSlothPlaybook()}

Full consignment agreement:
${agreement}

Extra desk notes:
${deskNotes}

Pickup is at ${SITE.addressLine}, ${SITE.cityLine}. The desk is ${SITE.phoneDisplay} or ${SITE.email}.`;
}
