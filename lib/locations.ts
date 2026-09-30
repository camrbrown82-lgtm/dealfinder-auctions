export type ServiceCity = {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  lead: string;
  bid: string;
  consign: string;
  nearby: string[];
};

export const SERVICE_CITIES: ServiceCity[] = [
  {
    slug: "calgary",
    name: "Calgary",
    metaTitle: "Live auctions in Calgary",
    metaDescription:
      "Bid DealFinder Auctions from Calgary. The live floor and pickup desk are at 529 Gateway Rd NE in Airdrie. Consign lots for the next hammer.",
    lead: "Calgary bidders are a short drive north of the city. The floor is in Airdrie, not a second room downtown. Bid the timed sale from Calgary, then pick up at the desk.",
    bid: "The live floor runs on the site. Calgary paddles bid the same lots as the room in Airdrie, including later weeks that are already open.",
    consign: "Calgary consignors send comics, toys, vinyl, art, and oddities to the Airdrie desk. The lot goes on the next hammer with the house commission from the agreement.",
    nearby: ["chestermere", "cochrane", "okotoks", "edmonton"],
  },
  {
    slug: "chestermere",
    name: "Chestermere",
    metaTitle: "Live auctions in Chestermere",
    metaDescription:
      "Chestermere bidders join DealFinder Auctions online. Pickup stays at 529 Gateway Rd NE in Airdrie, north of Calgary.",
    lead: "Chestermere sits on the east side of Calgary. The DealFinder hammer is north of the city, at 529 Gateway Rd NE in Airdrie.",
    bid: "Bid from Chestermere on the live floor. You do not need a Chestermere showroom. The paddle, the timer, and the lot are on the site.",
    consign: "Bring a consignment to the Airdrie desk or start one on the consign form. Chestermere lots sell on the same weekly floor as every other paddle.",
    nearby: ["calgary", "cochrane", "okotoks"],
  },
  {
    slug: "cochrane",
    name: "Cochrane",
    metaTitle: "Live auctions in Cochrane",
    metaDescription:
      "Cochrane can bid DealFinder Auctions online. The floor and pickup are at 529 Gateway Rd NE in Airdrie.",
    lead: "Cochrane is west of Calgary. The auction floor is in Airdrie. Bid the sale from Cochrane and collect winning lots at the Gateway Road desk.",
    bid: "Cochrane paddles use the same live floor. Upcoming weeks stay open for bids, and the lot clock is the one on the site.",
    consign: "Cochrane consignors use the same agreement as Airdrie. Photos, a title, and a buy-now price if you want one. The desk lists the lot.",
    nearby: ["calgary", "chestermere", "okotoks"],
  },
  {
    slug: "okotoks",
    name: "Okotoks",
    metaTitle: "Live auctions in Okotoks",
    metaDescription:
      "Okotoks bidders join the DealFinder Auctions floor online. Pickup is at 529 Gateway Rd NE in Airdrie.",
    lead: "Okotoks is south of Calgary. The hammer is north of the city, in Airdrie. Bid from Okotoks and pick up at 529 Gateway Rd NE.",
    bid: "The live sale is timed on the site. Okotoks bidders see the same lots, the same increments, and the same close as the Airdrie floor.",
    consign: "Okotoks consignments land on that floor. The desk photographs, titles, and prices the lot, then it sells with the weekly hammer.",
    nearby: ["calgary", "chestermere", "cochrane"],
  },
  {
    slug: "red-deer",
    name: "Red Deer",
    metaTitle: "Live auctions in Red Deer",
    metaDescription:
      "Red Deer can bid DealFinder Auctions on the Airdrie floor. Pick up at 529 Gateway Rd NE, or choose shipping on the invoice.",
    lead: "Red Deer is north of Airdrie on the QEII. The floor stays in Airdrie. Bid the timed sale from Red Deer, then pick up at the desk or choose shipping.",
    bid: "Red Deer paddles bid on the live site. You do not drive down for every increment. You come to 529 Gateway Rd NE when the lot is yours, unless the invoice is marked for shipping.",
    consign: "Red Deer consignors can send lots to the Airdrie desk for the next sale. Commission follows the consignment agreement.",
    nearby: ["edmonton", "calgary"],
  },
  {
    slug: "edmonton",
    name: "Edmonton",
    metaTitle: "Live auctions in Edmonton",
    metaDescription:
      "Edmonton bidders join DealFinder Auctions online. The floor and pickup desk are in Airdrie at 529 Gateway Rd NE.",
    lead: "Edmonton can bid the Airdrie floor without a second auction house. The hammer, the lots, and pickup stay at 529 Gateway Rd NE.",
    bid: "Bid from Edmonton on the live sale. Winning lots are picked up in Airdrie, or shipped when you choose shipping on the invoice.",
    consign: "Edmonton consignors list through the same desk. The lot sells on the DealFinder floor with the published commission tiers.",
    nearby: ["red-deer", "calgary"],
  },
];

export function locationBySlug(slug: string) {
  return SERVICE_CITIES.find((city) => city.slug === slug) ?? null;
}

export function nearbyCities(place: ServiceCity) {
  return place.nearby
    .map((slug) => locationBySlug(slug))
    .filter((city): city is ServiceCity => city !== null);
}
