export const BID_PREAUTH_AMOUNT = Number(process.env.HELCIM_BID_PREAUTH_AMOUNT || 50);

export const PREAUTH_DISCLAIMER_TITLE = "Why we hold $50";

export const PREAUTH_DISCLAIMER = `DealFinder places a $50 pre-authorization on your card the moment you bid. It is a hold, not a charge — we use it to confirm the card is real and to protect the house if a winning paddle walks away. When you pay the hammer at checkout, we reverse that hold so the $50 is released back to you. You are only billed for lots you actually win.`;

export const PREAUTH_DISCLAIMER_SHORT =
  "$50 card hold when you bid (not a charge). Released when you settle the hammer at checkout.";
