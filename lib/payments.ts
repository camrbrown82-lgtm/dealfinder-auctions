import type { PaymentMethod } from "@/lib/profileTypes";
import { BID_PREAUTH_AMOUNT, PREAUTH_DISCLAIMER } from "@/lib/helcimCopy";

export {
  BID_PREAUTH_AMOUNT,
  PREAUTH_AGREEMENT,
  PREAUTH_DISCLAIMER,
  PREAUTH_DISCLAIMER_SHORT,
  PREAUTH_DISCLAIMER_TITLE,
} from "@/lib/helcimCopy";

export const PICKUP_INSTRUCTIONS =
  process.env.NEXT_PUBLIC_PICKUP_INSTRUCTIONS ||
  "DealFinder Auctions desk — lots are paid online with Helcim before pickup. Bring photo ID that matches your bidder profile. Pickup window: weekdays 10:00–18:00.";

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

export function paymentMethodLabel(method: PaymentMethod | string) {
  if (method === "helcim_card") return "Helcim card";
  return "Helcim card";
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

export function paymentInstructions(method: PaymentMethod | string, invoice: string) {
  return [
    `Pay invoice ${invoice} by card through Helcim at checkout.`,
    `A $${BID_PREAUTH_AMOUNT.toFixed(0)} hold is placed on Sunday, the day the auction ends. We reverse it as soon as Helcim captures the hammer. Denied Sunday hold or checkout forfeits the bid.`,
    PREAUTH_DISCLAIMER,
  ].join(" ");
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
      ? `We will ship to ${address}. A $10 shipping handling fee is added automatically, plus carrier postage quoted from weight and dimensions, then 5% GST.`
      : "Add your shipping address on your bidder card. Shipped lots include a $10 handling fee plus carrier postage and GST.";
  }
  if (choice === "pickup") {
    return PICKUP_INSTRUCTIONS;
  }
  return "After you win, choose ship or pick up. That choice is what the house uses to pack the lot.";
}
