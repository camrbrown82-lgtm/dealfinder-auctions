import { cookies } from "next/headers";
import { getUserById } from "./store";
import type { PublicUser } from "./types";

const BIDDER_COOKIE = "df_bidder";
const ADMIN_COOKIE = "df_admin";

export async function getSessionUser(): Promise<PublicUser | null> {
  const jar = await cookies();
  const id = jar.get(BIDDER_COOKIE)?.value;
  if (!id) return null;
  return getUserById(id);
}

export async function setBidderCookie(userId: string) {
  const jar = await cookies();
  jar.set(BIDDER_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearBidderCookie() {
  const jar = await cookies();
  jar.delete(BIDDER_COOKIE);
}

export async function isAdmin() {
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE)?.value === "ok";
}

export async function setAdminCookie() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "ok", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

export function adminPassword() {
  return process.env.ADMIN_PASSWORD || "hammer";
}
