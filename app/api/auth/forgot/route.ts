import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { generateRecoveryLink, resetPasswordHref } from "@/lib/authEmail";
import { findDemoUserByEmail } from "@/lib/demoUsers";
import { sendPasswordResetEmail } from "@/lib/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const GENERIC =
  "If that email is on a paddle, we sent a reset link. Check inbox and spam.";

function demoResetHref(email: string) {
  const exp = Date.now() + 60 * 60 * 1000;
  const mac = createHmac("sha256", process.env.ADMIN_PASSWORD || "hammer")
    .update(`${email}.${exp}`)
    .digest("hex");
  const token = Buffer.from(JSON.stringify({ email, exp, mac })).toString("base64url");
  return `${resetPasswordHref()}?demo=${encodeURIComponent(token)}`;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter the email on your paddle." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const profile = await supabase.from("profiles").select("full_name").eq("email", email).maybeSingle();
    const link = await generateRecoveryLink(supabase, email);
    if (link.resetHref) {
      await sendPasswordResetEmail({
        to: email,
        name: String(profile.data?.full_name || email),
        resetHref: link.resetHref,
      });
    }
    return NextResponse.json({ ok: true, message: GENERIC });
  }

  const demo = findDemoUserByEmail(email);
  if (demo) {
    await sendPasswordResetEmail({
      to: demo.email,
      name: demo.fullName,
      resetHref: demoResetHref(demo.email),
    });
  }
  return NextResponse.json({ ok: true, message: GENERIC });
}
