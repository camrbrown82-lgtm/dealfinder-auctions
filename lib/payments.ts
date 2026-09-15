import type { PaymentMethod } from "@/lib/profileTypes";

export const INTERAC_EMAIL =
  process.env.NEXT_PUBLIC_INTERAC_EMAIL || "payments@dealfinder.auctions";

export const PICKUP_INSTRUCTIONS =
  process.env.NEXT_PUBLIC_PICKUP_INSTRUCTIONS ||
  "DealFinder Auctions desk — pay on arrival with cash, debit, or in-person credit. Bring photo ID that matches your bidder profile. Pickup window: weekdays 10:00–18:00.";

export const CANADIAN_PROVINCES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
] as const;

export function paymentMethodLabel(method: PaymentMethod) {
  return method === "interac_etransfer"
    ? "Interac e-Transfer"
    : "Pay on Arrival / Local Pickup";
}

export function settlementInvoice(auctionNumber: string | null | undefined, buyerKey: string) {
  const sale = (auctionNumber ?? "SALE").replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase() || "SALE";
  const paddle = buyerKey.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "FLOOR";
  return `DF-${sale}-${paddle}`;
}

export function invoiceNumber(lotId: string, userId: string) {
  const stamp = lotId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
  const paddle = userId.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  return `DF-${paddle}-${stamp}`;
}

export function paymentInstructions(method: PaymentMethod, invoice: string) {
  if (method === "interac_etransfer") {
    return [
      `Send an Interac e-Transfer to ${INTERAC_EMAIL}.`,
      `Put ${invoice} in the message / memo field.`,
      "Auto-deposit is enabled — no security question required.",
    ].join(" ");
  }
  return `${PICKUP_INSTRUCTIONS} Quote invoice ${invoice} at the desk.`;
}

export type FulfillmentChoice = "unset" | "ship" | "pickup";

export function isFulfillmentChoice(value: unknown): value is FulfillmentChoice {
  return value === "unset" || value === "ship" || value === "pickup";
}

export function fulfillmentLabel(choice: FulfillmentChoice) {
  if (choice === "ship") return "Ship it";
  if (choice === "pickup") return "Pick up";
  return "Choose delivery";
}

export function fulfillmentInstructions(
  choice: FulfillmentChoice,
  address?: string,
) {
  if (choice === "ship") {
    return address
      ? `We will ship to ${address}. Staff confirms postage before it leaves the desk.`
      : "Add your shipping address on your bidder card, then we can mail this lot.";
  }
  if (choice === "pickup") {
    return PICKUP_INSTRUCTIONS;
  }
  return "After you win, choose ship or pick up. That choice is what the house uses to pack the lot.";
}
