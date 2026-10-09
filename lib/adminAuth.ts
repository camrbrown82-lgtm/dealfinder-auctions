import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { BIDDER_COOKIE, readBidderId } from "@/lib/bidderCookie";
import { SITE } from "@/lib/site";

export const ADMIN_COOKIE = "df_admin";

export function adminPassword() {
  const value = process.env.ADMIN_PASSWORD?.trim();
  return value || "hammer";
}

/** House inbox plus any extra staff addresses in ADMIN_EMAILS. */
export function adminEmails() {
  const extras = (process.env.ADMIN_EMAILS || "")
    .split(/[,;\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.includes("@"));
  return Array.from(new Set([SITE.email.toLowerCase(), ...extras]));
}

export function isStaffEmail(email: string | null | undefined) {
  const value = String(email ?? "").trim().toLowerCase();
  return Boolean(value) && adminEmails().includes(value);
}

function signAdminEmail(email: string) {
  return createHmac("sha256", adminPassword()).update(`dealfinder-admin:${email}`).digest("hex");
}

function encodeEmail(email: string) {
  return Buffer.from(email, "utf8").toString("base64url");
}

function decodeEmail(value: string) {
  try {
    return Buffer.from(value, "base64url").toString("utf8").trim().toLowerCase();
  } catch {
    return "";
  }
}

function equalToken(offered: string, expected: string) {
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function adminSessionValue(email: string) {
  const clean = email.trim().toLowerCase();
  return `${signAdminEmail(clean)}.${encodeEmail(clean)}`;
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

/** A paddle signed in on this browser. The desk must not ride along with it. */
export function bidderSignedIn() {
  return Boolean(readBidderId(cookies().get(BIDDER_COOKIE)?.value));
}

export function adminSessionEmail() {
  if (bidderSignedIn()) return null;
  const value = cookies().get(ADMIN_COOKIE)?.value;
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot === -1) return null;
  const email = decodeEmail(value.slice(dot + 1));
  if (!isStaffEmail(email)) return null;
  return equalToken(value.slice(0, dot), signAdminEmail(email)) ? email : null;
}

export function isAdminSession() {
  return Boolean(adminSessionEmail());
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE, "", { ...adminCookieOptions(), maxAge: 0 });
  return response;
}

export function unauthorized() {
  return NextResponse.json({ error: "Admin login required." }, { status: 401 });
}
