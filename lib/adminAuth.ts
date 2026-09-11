import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE = "df_admin";

export function adminPassword() {
  return process.env.ADMIN_PASSWORD || "hammer";
}

export function adminSessionToken() {
  return createHmac("sha256", adminPassword()).update("dealfinder-admin").digest("hex");
}

export function isAdminSession() {
  const value = cookies().get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  const expected = adminSessionToken();
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function unauthorized() {
  return NextResponse.json({ error: "Admin login required." }, { status: 401 });
}
