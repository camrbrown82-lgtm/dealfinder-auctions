export type AuctionCategory =
  | "All"
  | "Comics"
  | "Toys"
  | "Vinyl"
  | "Art"
  | "Oddities";

export type LotCategory = Exclude<AuctionCategory, "All">;

export type LotStatus = "draft" | "live" | "paused" | "ended" | "removed";

export type ConsignmentStatus = "pending" | "approved" | "held" | "rejected";

export type AuctionLot = {
  id: string;
  slug?: string | null;
  title: string;
  category: LotCategory;
  image: string;
  images?: string[];
  currentBid: number;
  minIncrement: number;
  endsAt: string;
  consignor: string;
  description: string;
  status?: LotStatus;
  highBidder?: string | null;
  highBidderId?: string | null;
  eventId?: string | null;
  lotNumber?: string | null;
  auctionNumber?: string | null;
  startingBid?: number | null;
  reservePrice?: number | null;
  commissionRate?: number | null;
};

export type AuctionEvent = {
  id: string;
  name: string;
  auctionNumber?: string | null;
  startsAt: string;
  endsAt: string;
};

export type PayoutRow = {
  consignor: string;
  lots: number;
  hammer: number;
  house: number;
  payout: number;
};

export type Consignment = {
  id: string;
  consignor: string;
  title: string;
  category: LotCategory;
  condition?: string | null;
  description?: string | null;
  notes?: string | null;
  estimatedLow?: number | null;
  estimatedHigh?: number | null;
  reservePrice?: number | null;
  startingBid?: number | null;
  commissionRate?: number | null;
  imageUrls: string[];
  status: ConsignmentStatus;
};

export type PipelineStatus = "pending_approval" | "scheduled" | "live" | "sold";

export type ConsignorItem = {
  id: string;
  title: string;
  consignor: string;
  pipelineStatus: PipelineStatus;
  startingBid: number;
  reservePrice: number;
  commissionRate: number;
};

export function uniqueImageUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const trimmed = url?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function lotImages(lot: Pick<AuctionLot, "image" | "images">): string[] {
  return uniqueImageUrls([lot.image, ...(lot.images ?? [])]);
}

export const CATEGORIES: AuctionCategory[] = [
  "All",
  "Comics",
  "Toys",
  "Vinyl",
  "Art",
  "Oddities",
];

export const MOCK_LOTS: AuctionLot[] = [
  {
    id: "pow-001",
    slug: "pow-001",
    title: "Silver Age Amazing #15 reprint folio",
    category: "Comics",
    image:
      "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1618519764620-7403abdbdfe9?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1588499756884-d725add8dce4?auto=format&fit=crop&w=800&q=80",
    ],
    currentBid: 240,
    minIncrement: 10,
    endsAt: new Date(Date.now() + 1000 * 60 * 42).toISOString(),
    consignor: "Vault Comics Co.",
    description: "Bright cover, crisp corners, bagged and boarded.",
    status: "live",
    lotNumber: "LOT-0001",
    auctionNumber: "AU-2026-001",
  },
  {
    id: "zap-014",
    slug: "zap-014",
    title: "Wind-up robot, original box",
    category: "Toys",
    image:
      "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1558060370-d644479cb6f7?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=800&q=80",
    ],
    currentBid: 85,
    minIncrement: 5,
    endsAt: new Date(Date.now() + 1000 * 60 * 18).toISOString(),
    consignor: "Attic Finds",
    description: "Working key-wind mechanism. Box shows shelf wear.",
    status: "live",
    lotNumber: "LOT-0002",
    auctionNumber: "AU-2026-001",
  },
  {
    id: "bam-077",
    slug: "bam-077",
    title: "1960s jazz LP lot (sealed-looking)",
    category: "Vinyl",
    image:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80",
    ],
    currentBid: 120,
    minIncrement: 10,
    endsAt: new Date(Date.now() + 1000 * 60 * 95).toISOString(),
    consignor: "Spin City",
    description: "Four-record stack. Surfaces look glossy under light.",
    status: "live",
    lotNumber: "LOT-0003",
    auctionNumber: "AU-2026-001",
  },
  {
    id: "wham-003",
    slug: "wham-003",
    title: "Hand-painted pulp poster",
    category: "Art",
    image:
      "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=800&q=80",
    ],
    currentBid: 310,
    minIncrement: 25,
    endsAt: new Date(Date.now() + 1000 * 60 * 210).toISOString(),
    consignor: "Poster Palace",
    description: "Gesso on board. Halftone dots still punchy.",
    status: "live",
    lotNumber: "LOT-0004",
    auctionNumber: "AU-2026-001",
  },
  {
    id: "kapow-9",
    slug: "kapow-9",
    title: "Mystery crate: dime-store oddities",
    category: "Oddities",
    image:
      "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80",
    ],
    currentBid: 45,
    minIncrement: 5,
    endsAt: new Date(Date.now() + 1000 * 60 * 8).toISOString(),
    consignor: "Curious Cabinets",
    description: "Unsorted lot. What you see is what you get.",
    status: "live",
    lotNumber: "LOT-0005",
    auctionNumber: "AU-2026-001",
  },
  {
    id: "sold-001",
    slug: "sold-001",
    title: "Captain Marvel daily strip (sold)",
    category: "Comics",
    image:
      "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=800&q=80",
    currentBid: 175,
    minIncrement: 10,
    endsAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    consignor: "Vault Comics Co.",
    description: "Hammered last week. Payout pending.",
    status: "ended",
    lotNumber: "LOT-0006",
    auctionNumber: "AU-2026-001",
  },
];

export const MOCK_CONSIGNMENTS: Consignment[] = [
  {
    id: "c-101",
    consignor: "Vault Comics Co.",
    title: "Bronze Age long box (unsorted)",
    category: "Comics",
    description: "Awaiting sort and pull.",
    startingBid: 40,
    imageUrls: [],
    status: "pending",
  },
  {
    id: "c-102",
    consignor: "Attic Finds",
    title: "Die-cast cars, 12-count tray",
    category: "Toys",
    description: "Mixed scales, some chrome wear.",
    startingBid: 25,
    imageUrls: [],
    status: "pending",
  },
  {
    id: "c-103",
    consignor: "Spin City",
    title: "45s crate — soul / funk",
    category: "Vinyl",
    description: "Hold for grading.",
    startingBid: 30,
    imageUrls: [],
    status: "held",
  },
];

export function formatCurrency(amount: number, currency = "CAD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function nextBidAmount(currentBid: number, minIncrement: number) {
  return currentBid + minIncrement;
}

export function getLotById(id: string) {
  return MOCK_LOTS.find((lot) => lot.id === id || lot.slug === id);
}

export function filterLots(lots: AuctionLot[], category: AuctionCategory) {
  const live = lots.filter(
    (lot) =>
      lot.status !== "paused" &&
      lot.status !== "draft" &&
      lot.status !== "ended" &&
      lot.status !== "removed",
  );
  if (category === "All") return live;
  return live.filter((lot) => lot.category === category);
}

export function searchLots(lots: AuctionLot[], query: string) {
  const live = filterLots(lots, "All");
  const q = query.trim().toLowerCase();
  if (!q) return live;
  return live.filter((lot) => {
    const haystack = [
      lot.title,
      lot.description,
      lot.category,
      lot.consignor,
      lot.lotNumber,
      lot.auctionNumber,
      lot.id,
      lot.slug,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function formatCountdown(endsAt: string, now = Date.now()) {
  const remaining = new Date(endsAt).getTime() - now;
  if (remaining <= 0) return "ENDED";

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function isLotOpen(lot: Pick<AuctionLot, "endsAt" | "status">, now = Date.now()) {
  return lot.status !== "paused" && lot.status !== "ended" && new Date(lot.endsAt).getTime() > now;
}

export const DEFAULT_COMMISSION_RATE = 0.2;

export function pipelineLabel(status: PipelineStatus) {
  if (status === "pending_approval") return "Pending approval";
  if (status === "scheduled") return "Scheduled by DealFinder";
  if (status === "live") return "Live auction";
  return "Sold";
}

export function consignmentToPipeline(status: ConsignmentStatus): PipelineStatus {
  if (status === "approved") return "scheduled";
  return "pending_approval";
}
