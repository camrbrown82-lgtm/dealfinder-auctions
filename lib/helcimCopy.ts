export const BID_PREAUTH_AMOUNT = Number(process.env.HELCIM_BID_PREAUTH_AMOUNT || 50);

export const PREAUTH_DISCLAIMER_TITLE = "Sunday $50 pre-authorization";

export const PREAUTH_DISCLAIMER = `Auctions close every Sunday. On that day DealFinder places a $50 pre-authorization on your card. It is a hold, not a charge — it confirms the card is valid and protects the house. After you agree, you can bid all week without being billed. The hammer is only charged at Helcim checkout; we reverse the $50 hold once that sale goes through. If Sunday's pre-authorization is denied or cannot be completed, or if checkout payment does not go through, those bids are forfeited.`;

export const PREAUTH_DISCLAIMER_SHORT =
  "$50 card hold on Sunday, the day the auction ends (not a charge). Denied hold or failed checkout forfeits the bid.";

export const PREAUTH_AGREEMENT =
  "I agree. DealFinder will pre-authorize $50 on my card on Sunday, the day the auction ends. I will not be charged until I pay a hammer at checkout. If that Sunday hold cannot go through or my checkout payment is denied, my bids on that sale are forfeited.";
