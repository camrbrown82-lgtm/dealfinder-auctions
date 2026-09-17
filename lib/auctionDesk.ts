import type { AdminBid, CustomerRow } from "@/lib/adminTypes";
import { listAuctionRegistrations } from "@/lib/auctionRegistrations";
import { getAdminDemo, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { listDemoUsers } from "@/lib/demoUsers";
import { mapProfilePayment } from "@/lib/helcim";
import { mapAuctionEvent } from "@/lib/mapAuctionEvent";
import { mapLot, type LotRow } from "@/lib/mappers";
import { listSettlementInvoices } from "@/lib/settlementDb";
import { demoSettlementInvoices } from "@/lib/demoSettlementStore";
import { buildAuctionSettlements, lotWasSold, type BuyerSettlement } from "@/lib/settlements";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AuctionEvent, AuctionLot } from "@/lib/utils";

export type AuctionDeskEvent = AuctionEvent;

export type AuctionDeskRegistration = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  termsAgreedAt: string;
  preauthAgreedAt: string;
  preauthStatus: string;
  hasCardOnFile: boolean;
  paymentFlag: string;
};

export type AuctionDeskSaleLine = {
  invoice: string;
  lotId: string;
  lotNumber: string;
  title: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  hammer: number;
  paymentStatus: string;
  paidAt: string;
  helcimPurchaseId: string;
  buyerPreauthStatus: string;
  buyerHasCard: boolean;
};

export type AuctionDeskStats = {
  lots: number;
  live: number;
  sold: number;
  unsold: number;
  hammer: number;
  bidders: number;
  registered: number;
  preauthHeld: number;
  preauthDenied: number;
  preauthNone: number;
  paidLots: number;
};

export type AuctionDeskPayload = {
  events: AuctionDeskEvent[];
  event: AuctionDeskEvent | null;
  stats: AuctionDeskStats;
  lots: AuctionLot[];
  bids: Array<AdminBid & { lotTitle: string; lotNumber: string }>;
  registrations: AuctionDeskRegistration[];
  sales: AuctionDeskSaleLine[];
};

function emptyStats(): AuctionDeskStats {
  return {
    lots: 0,
    live: 0,
    sold: 0,
    unsold: 0,
    hammer: 0,
    bidders: 0,
    registered: 0,
    preauthHeld: 0,
    preauthDenied: 0,
    preauthNone: 0,
    paidLots: 0,
  };
}

function customerFromProfile(row: Record<string, unknown>, inventory: AuctionLot[]): CustomerRow {
  const wins = inventory.filter(
    (lot) => lot.highBidderId === String(row.id) && lotWasSold(lot),
  );
  const spend = wins.reduce((sum, lot) => sum + lot.currentBid, 0);
  const payment = mapProfilePayment(row);
  return {
    id: String(row.id),
    email: String(row.email ?? ""),
    fullName: String(row.full_name ?? ""),
    status: row.status === "suspended" ? "suspended" : "active",
    phone: String(row.phone ?? ""),
    street: String(row.street ?? ""),
    city: String(row.city ?? ""),
    province: String(row.province ?? ""),
    postalCode: String(row.postal_code ?? ""),
    paymentMethod: String(row.payment_method ?? "helcim_card"),
    auctionsWon: wins.length,
    lifetimeSpend: spend,
    paymentFlag: payment.preauthStatus === "held" ? "helcim-hold" : spend > 0 ? "helcim-paid" : "helcim",
  };
}

export async function loadAuctionDesk(eventId?: string | null): Promise<AuctionDeskPayload> {
  let inventory: AuctionLot[] = [];
  let events: AuctionEvent[] = [];
  let customers: CustomerRow[] = [];
  let profileRows: Record<string, unknown>[] = [];
  let invoices = demoSettlementInvoices();

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const [lots, eventRows, profiles] = await Promise.all([
      supabase.from("lots").select("*"),
      supabase.from("auction_events").select("*").order("ends_at", { ascending: true }),
      supabase.from("profiles").select("*"),
    ]);
    inventory = ((lots.data ?? []) as LotRow[]).map(mapLot).filter((lot) => lot.status !== "draft");
    events = (eventRows.data ?? []).map((row) => mapAuctionEvent(row as Parameters<typeof mapAuctionEvent>[0]));
    const eventNumbers = new Map(events.map((event) => [event.id, event.auctionNumber ?? null]));
    for (const lot of inventory) {
      if (lot.eventId) lot.auctionNumber = eventNumbers.get(lot.eventId) ?? lot.auctionNumber;
    }
    profileRows = (profiles.data ?? []) as Record<string, unknown>[];
    customers = profileRows.map((row) => customerFromProfile(row, inventory));
    try {
      invoices = await listSettlementInvoices(supabase);
    } catch {
      invoices = [];
    }
  } else {
    const demo = getAdminDemo();
    stampAuctionNumbers(demo);
    inventory = demo.inventory.filter((lot) => lot.status !== "draft");
    events = demo.events;
    customers = listDemoUsers().map((user) => {
      const wins = inventory.filter(
        (lot) =>
          (lot.highBidderId === user.id || lot.highBidder === user.fullName) && lotWasSold(lot),
      );
      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status ?? "active",
        phone: user.phone,
        street: user.street,
        city: user.city,
        province: user.province,
        postalCode: user.postalCode,
        paymentMethod: user.paymentMethod,
        auctionsWon: wins.length,
        lifetimeSpend: wins.reduce((sum, lot) => sum + lot.currentBid, 0),
        paymentFlag: user.preauthStatus === "held" ? "helcim-hold" : "helcim",
      };
    });
    profileRows = listDemoUsers().map((user) => ({
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      phone: user.phone,
      preauth_status: user.preauthStatus,
      helcim_card_token: user.helcimCardToken,
    }));
  }

  const ordered = [...events].sort(
    (a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime(),
  );
  const selected =
    ordered.find((event) => event.id === eventId) ??
    ordered.find((event) => !event.archivedAt) ??
    ordered[0] ??
    null;

  if (!selected) {
    return {
      events: ordered,
      event: null,
      stats: emptyStats(),
      lots: [],
      bids: [],
      registrations: [],
      sales: [],
    };
  }

  const lots = inventory.filter((lot) => lot.eventId === selected.id);
  const lotIds = new Set(lots.map((lot) => lot.id));
  const salesBlock = buildAuctionSettlements([selected], lots, customers)[0];
  const marks = new Map(invoices.map((row) => [row.invoice, row]));
  const byId = new Map(customers.map((row) => [row.id, row]));
  const regs = await listAuctionRegistrations(selected.id);
  const paymentById = new Map(
    profileRows.map((row) => [String(row.id), mapProfilePayment(row)]),
  );

  const registrations: AuctionDeskRegistration[] = regs.map((row) => {
    const customer = byId.get(row.userId);
    const payment = paymentById.get(row.userId);
    const demoUser = listDemoUsers().find((user) => user.id === row.userId);
    const preauthStatus = payment?.preauthStatus ?? demoUser?.preauthStatus ?? "none";
    const hasCard = payment?.hasCardOnFile ?? Boolean(demoUser?.helcimCardToken);
    return {
      userId: row.userId,
      name: customer?.fullName || demoUser?.fullName || row.userId,
      email: customer?.email || demoUser?.email || "",
      phone: customer?.phone || demoUser?.phone || "",
      termsAgreedAt: row.termsAgreedAt,
      preauthAgreedAt: row.preauthAgreedAt,
      preauthStatus,
      hasCardOnFile: hasCard,
      paymentFlag:
        preauthStatus === "held" ? "held" : preauthStatus === "denied" ? "denied" : "none",
    };
  });

  const bids: AuctionDeskPayload["bids"] = [];
  if (isSupabaseConfigured && supabase && lotIds.size) {
    const { data } = await supabase
      .from("bids")
      .select("id, lot_id, bidder_name, bidder_email, bidder_id, amount, kind, created_at")
      .in("lot_id", Array.from(lotIds))
      .order("created_at", { ascending: false })
      .limit(400);
    const titles = new Map(lots.map((lot) => [lot.id, lot]));
    for (const row of data ?? []) {
      const lot = titles.get(String(row.lot_id));
      const profile = row.bidder_id ? byId.get(String(row.bidder_id)) : undefined;
      bids.push({
        id: String(row.id),
        lotId: String(row.lot_id),
        bidder: profile?.fullName || String(row.bidder_name ?? ""),
        email: profile?.email || String(row.bidder_email ?? ""),
        amount: Number(row.amount),
        kind: row.kind === "absentee" ? "absentee" : "live",
        createdAt: String(row.created_at),
        bidderId: row.bidder_id ? String(row.bidder_id) : null,
        lotTitle: lot?.title ?? "",
        lotNumber: lot?.lotNumber ?? "",
      });
    }
  } else {
    for (const lot of lots) {
      const tape = getDemoLot(lot.id)?.bids ?? [];
      for (const bid of tape) {
        bids.push({
          ...bid,
          lotTitle: lot.title,
          lotNumber: lot.lotNumber ?? "",
        });
      }
    }
    bids.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const invoicesForSale = salesBlock?.invoices ?? [];
  const sales: AuctionDeskSaleLine[] = invoicesForSale.flatMap((invoice: BuyerSettlement) =>
    invoice.lots.map((line) => {
      const lot = lots.find((item) => item.id === line.id);
      const buyer = customers.find(
        (row) => row.id === invoice.buyerKey || row.fullName === invoice.name,
      );
      const payment = buyer ? paymentById.get(buyer.id) : undefined;
      const mark = marks.get(invoice.invoice);
      return {
        invoice: invoice.invoice,
        lotId: line.id,
        lotNumber: line.lotNumber ?? "",
        title: line.title,
        buyerName: invoice.name,
        buyerEmail: invoice.email,
        buyerPhone: invoice.phone,
        hammer: line.hammer,
        paymentStatus: lot?.paidAt ? "paid" : mark?.payment ?? "unpaid",
        paidAt: lot?.paidAt ?? "",
        helcimPurchaseId: lot?.helcimPurchaseTransactionId ?? "",
        buyerPreauthStatus: payment?.preauthStatus ?? "none",
        buyerHasCard: payment?.hasCardOnFile ?? false,
      };
    }),
  );

  const soldLots = lots.filter(lotWasSold);
  const bidderNames = new Set(
    bids.map((bid) => bid.bidderId || bid.email || bid.bidder).filter(Boolean),
  );
  const stats: AuctionDeskStats = {
    lots: lots.length,
    live: lots.filter((lot) => lot.status === "live" || lot.status === "paused").length,
    sold: soldLots.length,
    unsold: lots.filter((lot) => lot.status === "ended" && !lotWasSold(lot)).length,
    hammer: soldLots.reduce((sum, lot) => sum + lot.currentBid, 0),
    bidders: bidderNames.size,
    registered: registrations.length,
    preauthHeld: registrations.filter((row) => row.preauthStatus === "held").length,
    preauthDenied: registrations.filter((row) => row.preauthStatus === "denied").length,
    preauthNone: registrations.filter((row) => row.preauthStatus === "none" || row.preauthStatus === "released").length,
    paidLots: sales.filter((row) => row.paymentStatus === "paid").length,
  };

  return {
    events: ordered,
    event: selected,
    stats,
    lots,
    bids,
    registrations,
    sales,
  };
}

export function filterAuctionDesk(desk: AuctionDeskPayload, query: string): AuctionDeskPayload {
  const q = query.trim().toLowerCase();
  if (!q) return desk;
  const lots = desk.lots.filter(
    (lot) =>
      lot.title.toLowerCase().includes(q) ||
      (lot.lotNumber ?? "").toLowerCase().includes(q) ||
      (lot.highBidder ?? "").toLowerCase().includes(q),
  );
  const lotIds = new Set(lots.map((lot) => lot.id));
  const bids = desk.bids.filter(
    (bid) =>
      lotIds.has(bid.lotId) ||
      bid.bidder.toLowerCase().includes(q) ||
      bid.email.toLowerCase().includes(q) ||
      bid.lotTitle.toLowerCase().includes(q) ||
      bid.lotNumber.toLowerCase().includes(q),
  );
  const registrations = desk.registrations.filter(
    (row) =>
      row.name.toLowerCase().includes(q) ||
      row.email.toLowerCase().includes(q) ||
      row.phone.toLowerCase().includes(q),
  );
  const sales = desk.sales.filter(
    (row) =>
      row.title.toLowerCase().includes(q) ||
      row.lotNumber.toLowerCase().includes(q) ||
      row.buyerName.toLowerCase().includes(q) ||
      row.buyerEmail.toLowerCase().includes(q) ||
      row.invoice.toLowerCase().includes(q),
  );
  return { ...desk, lots, bids, registrations, sales };
}

export function auctionDeskSheets(desk: AuctionDeskPayload) {
  const event = desk.event;
  return [
    {
      name: "Auction",
      rows: [
        ["Auction #", "Name", "Starts", "Ends", "Lots", "Sold", "Hammer", "Registered", "Held", "Denied"],
        [
          event?.auctionNumber ?? "",
          event?.name ?? "",
          event?.startsAt ?? "",
          event?.endsAt ?? "",
          desk.stats.lots,
          desk.stats.sold,
          desk.stats.hammer,
          desk.stats.registered,
          desk.stats.preauthHeld,
          desk.stats.preauthDenied,
        ],
      ],
    },
    {
      name: "Sales",
      rows: [
        [
          "Invoice",
          "Lot #",
          "Item",
          "Buyer",
          "Email",
          "Phone",
          "Hammer",
          "Payment",
          "Paid at",
          "Helcim purchase",
          "Buyer pre-auth",
          "Card on file",
          "Auction #",
          "Auction name",
        ],
        ...desk.sales.map((row) => [
          row.invoice,
          row.lotNumber,
          row.title,
          row.buyerName,
          row.buyerEmail,
          row.buyerPhone,
          row.hammer,
          row.paymentStatus,
          row.paidAt,
          row.helcimPurchaseId,
          row.buyerPreauthStatus,
          row.buyerHasCard ? "yes" : "no",
          event?.auctionNumber ?? "",
          event?.name ?? "",
        ]),
      ],
    },
    {
      name: "Lots",
      rows: [
        ["Lot #", "Title", "Status", "Current bid", "High bidder", "Ends"],
        ...desk.lots.map((lot) => [
          lot.lotNumber ?? "",
          lot.title,
          lot.status ?? "",
          lot.currentBid,
          lot.highBidder ?? "",
          lot.endsAt,
        ]),
      ],
    },
    {
      name: "Bids",
      rows: [
        ["When", "Lot #", "Item", "Bidder", "Email", "Amount", "Kind"],
        ...desk.bids.map((bid) => [
          bid.createdAt,
          bid.lotNumber,
          bid.lotTitle,
          bid.bidder,
          bid.email,
          bid.amount,
          bid.kind,
        ]),
      ],
    },
    {
      name: "Pre-auth",
      rows: [
        ["Name", "Email", "Phone", "Terms agreed", "Pre-auth agreed", "Hold status", "Card on file"],
        ...desk.registrations.map((row) => [
          row.name,
          row.email,
          row.phone,
          row.termsAgreedAt,
          row.preauthAgreedAt,
          row.preauthStatus,
          row.hasCardOnFile ? "yes" : "no",
        ]),
      ],
    },
  ];
}
