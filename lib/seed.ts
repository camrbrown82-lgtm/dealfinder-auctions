import type { AuctionEvent, EmailTemplate, Lot } from "./types";

const nowOffsets = [2520_000, 1080_000, 5_700_000, 12_600_000, 480_000];

export function seedEvents(now = Date.now()): AuctionEvent[] {
  return [
    {
      id: "evt-2026-001",
      name: "POW · BAM · LIVE — Opening Hammer",
      auctionNumber: "AU-2026-001",
      startsAt: new Date(now - 3_600_000).toISOString(),
      endsAt: new Date(now + 12_600_000).toISOString(),
    },
  ];
}

export function seedTemplates(): EmailTemplate[] {
  return [
    {
      id: "tpl-winner",
      name: "Winner invoice",
      subject: "You hammered {{item_title}}",
      body: `Hey {{customer_name}},

You are high paddle on {{item_title}} at {{winning_bid}}.

Settle here: {{payment_link}}

DealFinder Auctions
529 Gateway Rd NE, Airdrie AB`,
    },
    {
      id: "tpl-outbid",
      name: "Outbid alert",
      subject: "Outbid on {{item_title}}",
      body: `Hey {{customer_name}},

Someone jumped the lot. {{item_title}} is now {{winning_bid}}. Jump back in from the live floor.`,
    },
  ];
}

export function seedLots(now = Date.now()): Lot[] {
  const event = seedEvents(now)[0];
  const rows: Array<Omit<Lot, "endsAt" | "auctionId" | "auctionNumber"> & { offset: number }> = [
    {
      offset: nowOffsets[0],
      id: "pow-001",
      slug: "pow-001",
      title: "Silver Age Amazing #15 reprint folio",
      category: "Comics",
      image: "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=800&q=80",
      images: [
        "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1618519764620-7403abdbdfe9?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1588499756884-d725add8dce4?auto=format&fit=crop&w=800&q=80",
      ],
      description: "Bright cover, crisp corners, bagged and boarded.",
      consignor: "Vault Comics Co.",
      currentBid: 240,
      startingBid: 80,
      reserve: 200,
      estimatedValue: 320,
      minIncrement: 10,
      commissionRate: 0.2,
      status: "live",
      pipelineStatus: "live",
      lotNumber: "LOT-0001",
      highBidder: null,
      highBidderId: null,
      bidCount: 0,
      absenteeMax: {},
    },
    {
      offset: nowOffsets[1],
      id: "zap-014",
      slug: "zap-014",
      title: "Wind-up robot, original box",
      category: "Toys",
      image: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80",
      images: [
        "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1558060370-d644479cb6f7?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=800&q=80",
      ],
      description: "Working key-wind mechanism. Box shows shelf wear.",
      consignor: "Attic Finds",
      currentBid: 85,
      startingBid: 25,
      reserve: 60,
      estimatedValue: 120,
      minIncrement: 5,
      commissionRate: 0.2,
      status: "live",
      pipelineStatus: "live",
      lotNumber: "LOT-0002",
      highBidder: null,
      highBidderId: null,
      bidCount: 0,
      absenteeMax: {},
    },
    {
      offset: nowOffsets[2],
      id: "bam-077",
      slug: "bam-077",
      title: "1960s jazz LP lot (sealed-looking)",
      category: "Vinyl",
      image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80",
      images: [
        "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80",
      ],
      description: "Four-record stack. Surfaces look glossy under light.",
      consignor: "Spin City",
      currentBid: 120,
      startingBid: 40,
      reserve: 90,
      estimatedValue: 180,
      minIncrement: 10,
      commissionRate: 0.2,
      status: "live",
      pipelineStatus: "live",
      lotNumber: "LOT-0003",
      highBidder: null,
      highBidderId: null,
      bidCount: 0,
      absenteeMax: {},
    },
    {
      offset: nowOffsets[3],
      id: "wham-003",
      slug: "wham-003",
      title: "Hand-painted pulp poster",
      category: "Art",
      image: "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=800&q=80",
      images: [
        "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=800&q=80",
      ],
      description: "Gesso on board. Halftone dots still punchy.",
      consignor: "Poster Palace",
      currentBid: 310,
      startingBid: 100,
      reserve: 250,
      estimatedValue: 400,
      minIncrement: 25,
      commissionRate: 0.2,
      status: "live",
      pipelineStatus: "live",
      lotNumber: "LOT-0004",
      highBidder: null,
      highBidderId: null,
      bidCount: 0,
      absenteeMax: {},
    },
    {
      offset: nowOffsets[4],
      id: "kapow-9",
      slug: "kapow-9",
      title: "Mystery crate: dime-store oddities",
      category: "Oddities",
      image: "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=800&q=80",
      images: [
        "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80",
      ],
      description: "Unsorted lot. What you see is what you get.",
      consignor: "Curious Cabinets",
      currentBid: 45,
      startingBid: 15,
      reserve: 30,
      estimatedValue: 70,
      minIncrement: 5,
      commissionRate: 0.2,
      status: "live",
      pipelineStatus: "live",
      lotNumber: "LOT-0005",
      highBidder: null,
      highBidderId: null,
      bidCount: 0,
      absenteeMax: {},
    },
  ];

  return rows.map((row) => {
    const { offset, ...lot } = row;
    return {
      ...lot,
      auctionId: event.id,
      auctionNumber: event.auctionNumber,
      endsAt: new Date(now + offset).toISOString(),
    };
  });
}
