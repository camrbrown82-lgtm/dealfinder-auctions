import { SITE } from "@/lib/site";

export const TURBO_SLOTH_OPEN_EVENT = "dealfinder-open-turbo-sloth";

export const REGISTER_FAQ = [
  {
    question: "How do I register for DealFinder Auctions?",
    answer:
      "Tap Log in, then Sign up. Add your name, email, and password, then confirm the email we send. You can browse before you register. You need the account before you bid.",
  },
  {
    question: "Does it cost anything to sign up for DealFinder Auctions?",
    answer: "No. Signing up is free. Nothing is charged for creating the account.",
  },
  {
    question: "What is the $50 when I register to bid?",
    answer:
      "The $50 is a Sunday card hold, not a signup fee and not the hammer. On Sunday, the day the auction ends, DealFinder places a $50 pre-authorization on the card. It confirms the card is valid. The hammer is charged only at checkout, and the hold is reversed once that sale goes through.",
  },
  {
    question: "Where do I pick up after I win at DealFinder Auctions?",
    answer: `Pickup is at ${SITE.addressLine}, ${SITE.cityLine}. Bring photo ID that matches your bidder profile.`,
  },
] as const;

export const REGISTER_FAQ_QUESTION = REGISTER_FAQ[0].question;

export function registerFaqReply() {
  return REGISTER_FAQ.map((item) => `${item.question}\n${item.answer}`).join("\n\n");
}

export function registerFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    name: "Register for DealFinder Auctions",
    mainEntity: REGISTER_FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
