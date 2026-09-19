import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import type { EmailOtpType } from "@supabase/supabase-js";
import { setBidderCookie } from "@/lib/bidderAuth";
import { otpTypesToTry } from "@/lib/authEmail";
import { findDemoUserByEmail, hashPassword, updateDemoUser } from "@/lib/demoUsers";
import { getSupabaseAdmin, getSupabaseAuthClient, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

function readDemoToken(raw: string) {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      email?: string;
      exp?: number;
      mac?: string;
    };
    const email = String(parsed.email ?? "").trim().toLowerCase();
    const exp = Number(parsed.exp ?? 0);
    const mac = String(parsed.mac ?? "");
    if (!email || !mac || !Number.isFinite(exp) || exp < Date.now()) return null;
    const expected = createHmac("sha256", process.env.ADMIN_PASSWORD || "hammer")
      .update(`${email}.${exp}`)
      .digest("hex");
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return email;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    password?: string;
    tokenHash?: string;
    type?: string;
    demo?: string;
  };
  const password = String(body.password ?? "");
  if (password.length < 6) {
    return NextResponse.json({ error: "Use a password of at least 6 characters." }, { status: 400 });
  }

  const demoToken = String(body.demo ?? "").trim();
  if (demoToken) {
    const email = readDemoToken(demoToken);
    const user = email ? findDemoUserByEmail(email) : null;
    if (!user) {
      return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 403 });
    }
    updateDemoUser(user.id, { passwordHash: hashPassword(password) });
    const response = NextResponse.json({ ok: true, redirect: "/live" });
    return setBidderCookie(response, user.id);
  }

  const tokenHash = String(body.tokenHash ?? "").trim();
  if (!tokenHash || !isSupabaseConfigured) {
    return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  }

  const authClient = getSupabaseAuthClient();
  const admin = getSupabaseAdmin();
  if (!authClient || !admin) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 400 });
  }

  let userId = "";
  let lastError = "This reset link is invalid or expired.";
  for (const type of otpTypesToTry(body.type || "recovery")) {
    const { data, error } = await authClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (!error && data.user) {
      userId = data.user.id;
      break;
    }
    if (error?.message) lastError = error.message;
  }
  if (!userId) {
    return NextResponse.json({ error: lastError }, { status: 403 });
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true, redirect: "/live" });
  return setBidderCookie(response, userId);
}
