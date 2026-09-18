import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "crypto";
import type { AccountStatus, BidderProfile, PaymentMethod, PreauthStatus } from "@/lib/profileTypes";
import { normalizePaymentMethod } from "@/lib/profileTypes";
import { BID_PREAUTH_AMOUNT } from "@/lib/helcimCopy";

export type DemoUser = BidderProfile & {
  passwordHash: string;
  helcimCardToken: string | null;
  helcimCustomerCode: string | null;
  preauthTransactionId: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __dealfinderDemoUsers: Map<string, DemoUser> | undefined;
}

function store() {
  if (!globalThis.__dealfinderDemoUsers) {
    globalThis.__dealfinderDemoUsers = new Map();
  }
  return globalThis.__dealfinderDemoUsers;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const offered = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (offered.length !== expected.length) return false;
  return timingSafeEqual(offered, expected);
}

export function findDemoUserByEmail(email: string) {
  const needle = email.trim().toLowerCase();
  for (const user of Array.from(store().values())) {
    if (user.email === needle) return user;
  }
  return null;
}

export function getDemoUser(id: string) {
  return store().get(id) ?? null;
}

export function createDemoUser(input: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  paymentMethod?: PaymentMethod;
  preauthTermsAgreed?: boolean;
}): DemoUser {
  const email = input.email.trim().toLowerCase();
  if (findDemoUserByEmail(email)) {
    throw new Error("An account already exists for that email.");
  }
  const user: DemoUser = {
    id: randomUUID(),
    email,
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    street: input.street.trim(),
    city: input.city.trim(),
    province: input.province.trim(),
    postalCode: input.postalCode.trim().toUpperCase(),
    paymentMethod: "helcim_card",
    status: "active",
    preauthStatus: "none",
    preauthAmount: BID_PREAUTH_AMOUNT,
    hasCardOnFile: false,
    preauthTermsAgreed: Boolean(input.preauthTermsAgreed),
    preauthTransactionId: null,
    helcimCardToken: null,
    helcimCustomerCode: null,
    passwordHash: hashPassword(input.password),
  };
  store().set(user.id, user);
  return user;
}

export function updateDemoUser(
  id: string,
  patch: Partial<
    Omit<BidderProfile, "id" | "email"> & {
      helcimCardToken?: string | null;
      helcimCustomerCode?: string | null;
      preauthTransactionId?: string | null;
      preauthStatus?: PreauthStatus;
    }
  >,
) {
  const current = store().get(id);
  if (!current) return null;
  const next: DemoUser = {
    ...current,
    ...patch,
    paymentMethod: "helcim_card",
    postalCode: patch.postalCode ? patch.postalCode.trim().toUpperCase() : current.postalCode,
    hasCardOnFile: Boolean(patch.helcimCardToken ?? current.helcimCardToken),
  };
  store().set(id, next);
  return next;
}

export function publicProfile(user: DemoUser): BidderProfile {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    street: user.street,
    city: user.city,
    province: user.province,
    postalCode: user.postalCode,
    paymentMethod: normalizePaymentMethod(user.paymentMethod),
    status: user.status ?? "active",
    preauthStatus: user.preauthStatus ?? "none",
    preauthAmount: user.preauthAmount ?? BID_PREAUTH_AMOUNT,
    hasCardOnFile: Boolean(user.helcimCardToken || user.hasCardOnFile),
    preauthTermsAgreed: Boolean(user.preauthTermsAgreed),
  };
}

export function listDemoUsers() {
  return Array.from(store().values());
}

export function setDemoUserStatus(id: string, status: AccountStatus) {
  const current = store().get(id);
  if (!current) return null;
  const next = { ...current, status };
  store().set(id, next);
  return next;
}

export function setDemoUserPassword(id: string, password: string) {
  const current = store().get(id);
  if (!current) return null;
  const next = { ...current, passwordHash: hashPassword(password) };
  store().set(id, next);
  return next;
}

export function ensureSeedBidders() {
  if (store().size > 0) return;
  const sample = [
    {
      email: "pat.paddle@example.com",
      fullName: "Pat Paddle",
      phone: "4165550101",
      street: "12 Boom Lane",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V 2T6",
    },
    {
      email: "kim.kapow@example.com",
      fullName: "Kim Kapow",
      phone: "4165550102",
      street: "88 Zap Ave",
      city: "Hamilton",
      province: "ON",
      postalCode: "L8P 1A1",
    },
  ];
  for (const row of sample) {
    createDemoUser({ ...row, password: "paddle99" });
  }
}
