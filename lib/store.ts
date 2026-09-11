import { createHash, randomBytes, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { ANTI_SNIPE_MS, HOUSE_COMMISSION, profileComplete } from "./catalog";
import { seedEvents, seedLots, seedTemplates } from "./seed";
import type {
  AuctionEvent,
  BidKind,
  Lot,
  ProfileFields,
  PublicUser,
  StoreData,
  User,
} from "./types";

const STORE_PATH = path.join(process.cwd(), "data", "store.json");

let memory: StoreData | null = null;
let writeChain: Promise<void> = Promise.resolve();

function hashPassword(password: string, salt?: string) {
  const usedSalt = salt ?? randomBytes(8).toString("hex");
  const digest = createHash("sha256").update(`${usedSalt}:${password}`).digest("hex");
  return `${usedSalt}:${digest}`;
}

function checkPassword(password: string, stored: string) {
  const [salt] = stored.split(":");
  return hashPassword(password, salt) === stored;
}

function publicUser(user: User): PublicUser {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return rest;
}

function freshStore(): StoreData {
  const now = Date.now();
  return {
    users: [],
    lots: seedLots(now),
    bids: [],
    events: seedEvents(now),
    templates: seedTemplates(),
    outbox: [],
    emailLogo: null,
  };
}

async function loadStore(): Promise<StoreData> {
  if (memory) return memory;
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    memory = JSON.parse(raw) as StoreData;
    return memory;
  } catch {
    memory = freshStore();
    await persist(memory);
    return memory;
  }
}

function persist(data: StoreData) {
  memory = data;
  writeChain = writeChain.then(async () => {
    await mkdir(path.dirname(STORE_PATH), { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify(data, null, 2));
  });
  return writeChain;
}

async function mutate<T>(fn: (data: StoreData) => T | Promise<T>) {
  const data = await loadStore();
  const result = await fn(data);
  await persist(data);
  return result;
}

export async function getStore() {
  return loadStore();
}

export async function listLiveLots() {
  const data = await loadStore();
  return data.lots.filter((lot) => lot.status === "live");
}

export async function getLot(idOrSlug: string) {
  const data = await loadStore();
  return data.lots.find((lot) => lot.id === idOrSlug || lot.slug === idOrSlug) ?? null;
}

export async function listBids(lotId: string) {
  const data = await loadStore();
  return data.lots
    ? data.bids
        .filter((bid) => bid.lotId === lotId && !bid.voided)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    : [];
}

export async function getUserById(id: string) {
  const data = await loadStore();
  const user = data.users.find((row) => row.id === id);
  return user ? publicUser(user) : null;
}

export async function getUserByEmail(email: string) {
  const data = await loadStore();
  return data.users.find((row) => row.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function loginUser(email: string, password: string) {
  const user = await getUserByEmail(email);
  if (!user || !checkPassword(password, user.passwordHash)) return null;
  return publicUser(user);
}

export async function signupUser(input: ProfileFields & { email: string; password: string }) {
  return mutate((data) => {
    if (data.users.some((row) => row.email.toLowerCase() === input.email.toLowerCase())) {
      throw new Error("That email already has a paddle.");
    }
    const user: User = {
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      passwordHash: hashPassword(input.password),
      fullName: input.fullName,
      phone: input.phone,
      street: input.street,
      city: input.city,
      province: input.province,
      postalCode: input.postalCode,
      paymentMethod: input.paymentMethod,
      status: "active",
      auctionsWon: 0,
      lifetimeSpend: 0,
      paymentFlag: "clear",
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    return publicUser(user);
  });
}

export async function updateProfile(userId: string, patch: Partial<ProfileFields> & { paymentMethod?: ProfileFields["paymentMethod"] }) {
  return mutate((data) => {
    const user = data.users.find((row) => row.id === userId);
    if (!user) throw new Error("Paddle not found.");
    Object.assign(user, patch);
    return publicUser(user);
  });
}

function nextLotNumber(lots: Lot[]) {
  const max = lots.reduce((acc, lot) => {
    const n = Number(lot.lotNumber.replace(/\D/g, ""));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `LOT-${String(max + 1).padStart(4, "0")}`;
}

export async function suggestedLotNumber() {
  const data = await loadStore();
  return nextLotNumber(data.lots);
}

function applyAbsentee(data: StoreData, lot: Lot, exceptUserId?: string) {
  const contenders = Object.entries(lot.absenteeMax).filter(([id, max]) => {
    if (exceptUserId && id === exceptUserId) return false;
    return max > lot.currentBid;
  });
  if (!contenders.length) return;
  contenders.sort((a, b) => b[1] - a[1]);
  const [userId, max] = contenders[0];
  const user = data.users.find((row) => row.id === userId);
  const next = Math.min(max, lot.currentBid + lot.minIncrement);
  if (next <= lot.currentBid) return;
  lot.currentBid = next;
  lot.highBidder = user?.fullName || "Absentee paddle";
  lot.highBidderId = userId;
  lot.bidCount += 1;
  data.bids.push({
    id: randomUUID(),
    lotId: lot.id,
    bidderId: userId,
    bidder: lot.highBidder,
    email: user?.email || "",
    amount: next,
    kind: "absentee auto",
    createdAt: new Date().toISOString(),
    voided: false,
  });
}

export async function placeBid(input: {
  lotId: string;
  user: PublicUser;
  mode: BidKind;
  amount: number;
  maxAmount?: number;
}) {
  if (input.user.status === "suspended") {
    throw new Error("Bidding privileges suspended.");
  }
  if (!profileComplete(input.user)) {
    throw new Error("Finish your bidder card before placing a paddle.");
  }

  return mutate((data) => {
    const lot = data.lots.find((row) => row.id === input.lotId || row.slug === input.lotId);
    if (!lot) throw new Error("Lot not found.");
    if (lot.status !== "live") throw new Error("Bidding closed");
    const now = Date.now();
    if (new Date(lot.endsAt).getTime() <= now) {
      lot.status = "ended";
      throw new Error("Bidding closed");
    }

    const minLive = lot.currentBid + lot.minIncrement;
    const amount = input.mode === "absentee" ? Number(input.maxAmount || input.amount) : Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a bid amount.");

    if (input.mode === "absentee") {
      lot.absenteeMax[input.user.id] = Math.max(lot.absenteeMax[input.user.id] || 0, amount);
      data.bids.push({
        id: randomUUID(),
        lotId: lot.id,
        bidderId: input.user.id,
        bidder: input.user.fullName || "Paddle",
        email: input.user.email,
        amount,
        kind: "absentee",
        createdAt: new Date().toISOString(),
        voided: false,
      });
      if (lot.highBidderId !== input.user.id) {
        const target = Math.max(minLive, lot.currentBid + lot.minIncrement);
        const fire = Math.min(amount, target);
        if (fire > lot.currentBid) {
          lot.currentBid = fire;
          lot.highBidder = input.user.fullName;
          lot.highBidderId = input.user.id;
          lot.bidCount += 1;
          data.bids.push({
            id: randomUUID(),
            lotId: lot.id,
            bidderId: input.user.id,
            bidder: input.user.fullName,
            email: input.user.email,
            amount: fire,
            kind: "absentee auto",
            createdAt: new Date().toISOString(),
            voided: false,
          });
        }
        applyAbsentee(data, lot, input.user.id);
      }
    } else {
      if (amount < minLive) throw new Error(`Next live paddle is ${minLive}.`);
      lot.currentBid = amount;
      lot.highBidder = input.user.fullName;
      lot.highBidderId = input.user.id;
      lot.bidCount += 1;
      data.bids.push({
        id: randomUUID(),
        lotId: lot.id,
        bidderId: input.user.id,
        bidder: input.user.fullName || "Paddle",
        email: input.user.email,
        amount,
        kind: "live",
        createdAt: new Date().toISOString(),
        voided: false,
      });
      applyAbsentee(data, lot, input.user.id);
    }

    let extended = false;
    const remaining = new Date(lot.endsAt).getTime() - Date.now();
    if (remaining <= ANTI_SNIPE_MS) {
      lot.endsAt = new Date(Date.now() + ANTI_SNIPE_MS).toISOString();
      extended = true;
    }

    const events = data.bids
      .filter((bid) => bid.lotId === lot.id && !bid.voided)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 12);

    return {
      currentBid: lot.currentBid,
      endsAt: lot.endsAt,
      highBidder: lot.highBidder,
      extended,
      events,
    };
  });
}

export async function voidBid(bidId: string) {
  return mutate((data) => {
    const bid = data.bids.find((row) => row.id === bidId);
    if (!bid) throw new Error("Bid not found.");
    bid.voided = true;
    const lot = data.lots.find((row) => row.id === bid.lotId);
    if (!lot) return { currentBid: 0 };
    const remaining = data.bids
      .filter((row) => row.lotId === lot.id && !row.voided && row.kind !== "absentee")
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const high = remaining[0];
    if (high) {
      lot.currentBid = high.amount;
      lot.highBidder = high.bidder;
      lot.highBidderId = high.bidderId;
    } else {
      lot.currentBid = lot.startingBid;
      lot.highBidder = null;
      lot.highBidderId = null;
    }
    lot.bidCount = remaining.length;
    return { currentBid: lot.currentBid };
  });
}

export async function listWins(userId: string) {
  const data = await loadStore();
  return data.lots
    .filter((lot) => lot.highBidderId === userId && (lot.status === "ended" || lot.status === "sold" || lot.status === "live"))
    .map((lot) => ({
      lotId: lot.id,
      slug: lot.slug,
      title: lot.title,
      currentBid: lot.currentBid,
      winning: lot.status === "ended" || lot.status === "sold" || new Date(lot.endsAt).getTime() <= Date.now(),
      invoice: `INV-${lot.auctionNumber}-${lot.lotNumber}`,
      paymentMethod: data.users.find((u) => u.id === userId)?.paymentMethod ?? "interac_etransfer",
      paymentMethodKey: data.users.find((u) => u.id === userId)?.paymentMethod ?? "interac_etransfer",
      instructions:
        (data.users.find((u) => u.id === userId)?.paymentMethod ?? "interac_etransfer") === "interac_etransfer"
          ? `Send an Interac e-Transfer to ${process.env.NEXT_PUBLIC_INTERAC_EMAIL || "payments@dealfinder.auctions"} with the invoice number in the memo.`
          : process.env.NEXT_PUBLIC_PICKUP_INSTRUCTIONS ||
            "DealFinder Auctions desk — pay on arrival with cash, debit, or in-person credit. Bring photo ID that matches your bidder profile. Pickup window: weekdays 10:00–18:00.",
    }));
}

export async function createLot(input: Partial<Lot> & { title: string; consignor: string; goLive?: boolean }) {
  return mutate((data) => {
    const event = data.events.find((row) => row.id === input.auctionId) ?? data.events[0];
    const id = input.id || input.slug || randomUUID().slice(0, 8);
    const images = (input.images ?? []).filter(Boolean).slice(0, 4);
    const lot: Lot = {
      id,
      slug: input.slug || id,
      title: input.title,
      category: input.category ?? "Oddities",
      image: images[0] || input.image || "",
      images,
      description: input.description || "",
      consignor: input.consignor,
      currentBid: Number(input.startingBid || input.currentBid || 0),
      startingBid: Number(input.startingBid || 0),
      reserve: Number(input.reserve || 0),
      estimatedValue: Number(input.estimatedValue || 0),
      minIncrement: Number(input.minIncrement || 10),
      commissionRate: Number(input.commissionRate ?? HOUSE_COMMISSION),
      endsAt: input.endsAt || event?.endsAt || new Date(Date.now() + 3_600_000).toISOString(),
      status: input.goLive ? "live" : input.status ?? "draft",
      pipelineStatus: input.goLive ? "live" : input.pipelineStatus ?? input.status ?? "draft",
      lotNumber: input.lotNumber || nextLotNumber(data.lots),
      auctionNumber: event?.auctionNumber || "AU-2026-001",
      auctionId: event?.id || "",
      highBidder: null,
      highBidderId: null,
      bidCount: 0,
      absenteeMax: {},
    };
    data.lots.push(lot);
    return lot;
  });
}

export async function updateLot(id: string, patch: Partial<Lot>) {
  return mutate((data) => {
    const lot = data.lots.find((row) => row.id === id || row.slug === id);
    if (!lot) throw new Error("Could not save lot.");
    Object.assign(lot, patch);
    if (patch.images?.length) lot.image = patch.images[0];
    return lot;
  });
}

export async function createEvent(input: Pick<AuctionEvent, "name" | "auctionNumber" | "startsAt" | "endsAt">) {
  return mutate((data) => {
    const event: AuctionEvent = { id: randomUUID(), ...input };
    data.events.push(event);
    return event;
  });
}

export async function updateEvent(id: string, patch: Partial<AuctionEvent>) {
  return mutate((data) => {
    const event = data.events.find((row) => row.id === id);
    if (!event) throw new Error("Auction not found.");
    Object.assign(event, patch);
    return event;
  });
}

export async function setCustomerStatus(id: string, status: User["status"]) {
  return mutate((data) => {
    const user = data.users.find((row) => row.id === id);
    if (!user) throw new Error("Could not update bidder.");
    user.status = status;
    return publicUser(user);
  });
}

export async function queueReset(id: string) {
  return mutate((data) => {
    const user = data.users.find((row) => row.id === id);
    if (!user) throw new Error("Could not send reset.");
    data.outbox.push({
      id: randomUUID(),
      to: user.email,
      subject: "Reset Password / Send Alert",
      body: `Paddle recovery for ${user.fullName}. Visit /profile after logging in.`,
      createdAt: new Date().toISOString(),
    });
    return user.email;
  });
}

export async function adminSnapshot() {
  const data = await loadStore();
  const payoutItems = data.lots
    .filter((lot) => lot.status === "sold" || lot.status === "ended" || (lot.status === "live" && lot.bidCount > 0))
    .map((lot) => {
      const house = Math.round(lot.currentBid * lot.commissionRate);
      return {
        lotId: lot.id,
        title: lot.title,
        consignor: lot.consignor,
        hammer: lot.currentBid,
        commissionRate: lot.commissionRate,
        house,
        payout: lot.currentBid - house,
      };
    });
  const payoutsMap = new Map<string, { consignor: string; lots: number; hammer: number; house: number }>();
  for (const item of payoutItems) {
    const row = payoutsMap.get(item.consignor) ?? { consignor: item.consignor, lots: 0, hammer: 0, house: 0 };
    row.lots += 1;
    row.hammer += item.hammer;
    row.house += item.house;
    payoutsMap.set(item.consignor, row);
  }
  return {
    source: process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase-env-present-local-store" : "local-store",
    lots: data.lots,
    events: data.events,
    templates: data.templates,
    customers: data.users.map(publicUser),
    consignments: data.lots.filter((lot) => lot.status === "pending_approval" || lot.pipelineStatus === "pending_approval"),
    payouts: [...payoutsMap.values()],
    payoutItems,
    suggestedLotNumber: nextLotNumber(data.lots),
    emailLogo: data.emailLogo,
  };
}

export async function listConsignments(consignor?: string) {
  const data = await loadStore();
  return data.lots.filter((lot) => {
    const pending = lot.status === "pending_approval" || lot.pipelineStatus === "pending_approval" || lot.status === "draft" || lot.status === "live";
    if (!pending) return false;
    if (!consignor) return true;
    return lot.consignor.toLowerCase() === consignor.toLowerCase();
  });
}

export async function saveTemplate(template: { id?: string; name: string; subject: string; body: string }) {
  return mutate((data) => {
    if (template.id) {
      const existing = data.templates.find((row) => row.id === template.id);
      if (existing) {
        Object.assign(existing, template);
        return existing;
      }
    }
    const created = { id: randomUUID(), name: template.name, subject: template.subject, body: template.body };
    data.templates.push(created);
    return created;
  });
}

export async function sendTemplateEmail(input: {
  templateId?: string;
  to: string;
  customer_name: string;
  item_title: string;
  winning_bid: string;
  payment_link: string;
  previewOnly?: boolean;
}) {
  return mutate((data) => {
    const template = data.templates.find((row) => row.id === input.templateId) ?? data.templates[0];
    if (!template) throw new Error("Could not save template.");
    const fill = (value: string) =>
      value
        .replaceAll("{{customer_name}}", input.customer_name)
        .replaceAll("{{item_title}}", input.item_title)
        .replaceAll("{{winning_bid}}", input.winning_bid)
        .replaceAll("{{payment_link}}", input.payment_link);
    const item = {
      id: randomUUID(),
      to: input.to,
      subject: fill(template.subject),
      body: fill(template.body),
      createdAt: new Date().toISOString(),
    };
    if (!input.previewOnly) data.outbox.push(item);
    return {
      ...item,
      html: wrapEmailHtml(item.body, data.emailLogo),
      sent: Boolean(process.env.RESEND_API_KEY),
      mode: process.env.RESEND_API_KEY ? "resend" : "demo",
    };
  });
}

export function wrapEmailHtml(body: string, logo?: string | null) {
  const inner = /<\/?[a-z][\s\S]*>/i.test(body) ? body : body.replaceAll("\n", "<br/>");
  const logoHtml = logo
    ? `<img src="${logo}" alt="DealFinder Auctions" style="display:block;margin:0 auto;border:4px solid #000000;background:#000000;max-height:96px" />`
    : `<div style="text-align:center;padding:16px;background:#000000;color:#fff;font-weight:bold">DealFinder Auctions</div>`;
  return `<!DOCTYPE html>
<html>
<body style="margin:0;background:#FFF7D1;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#FFF7D1;font-family:Arial,Helvetica,sans-serif;color:#000000;">
    <tr><td style="background:#000000;padding:20px;">${logoHtml}</td></tr>
    <tr><td style="padding:24px;border:4px solid #000000;background:#FFF7D1;font-size:16px;line-height:1.5;">${inner}</td></tr>
  </table>
</body>
</html>`;
}

export async function setEmailLogo(url: string | null) {
  return mutate((data) => {
    data.emailLogo = url;
    return url;
  });
}

export async function seedHouseLots(count = 8) {
  return mutate((data) => {
    const catalog = seedLots(Date.now() + Math.random() * 1000);
    let added = 0;
    for (let i = 0; i < count; i += 1) {
      const base = catalog[i % catalog.length];
      const id = `seed-${randomUUID().slice(0, 6)}`;
      data.lots.push({
        ...base,
        id,
        slug: id,
        title: `${base.title} (house ${i + 1})`,
        lotNumber: nextLotNumber(data.lots),
        currentBid: base.startingBid,
        highBidder: null,
        highBidderId: null,
        bidCount: 0,
        absenteeMax: {},
        consignor: "House stock",
        status: "draft",
        pipelineStatus: "draft",
      });
      added += 1;
    }
    return added;
  });
}

export { publicUser, checkPassword };
