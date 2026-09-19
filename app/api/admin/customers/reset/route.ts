import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { generateRecoveryLink } from "@/lib/authEmail";
import { getDemoUser } from "@/lib/demoUsers";
import { sendPasswordResetEmail } from "@/lib/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as { id?: string; email?: string };
  const supabase = getSupabaseAdmin();
  const email = String(body.email ?? getDemoUser(body.id ?? "")?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) return NextResponse.json({ error: "User email required." }, { status: 400 });

  if (isSupabaseConfigured && supabase) {
    const profile = await supabase.from("profiles").select("full_name").eq("email", email).maybeSingle();
    const link = await generateRecoveryLink(supabase, email);
    if (link.error || !link.resetHref) {
      return NextResponse.json({ error: link.error || "Could not build reset link." }, { status: 400 });
    }
    const mail = await sendPasswordResetEmail({
      to: email,
      name: String(profile.data?.full_name || email),
      resetHref: link.resetHref,
    });
    if (!mail.ok) {
      return NextResponse.json({ error: mail.error || "Could not send reset email." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, mode: "supabase" });
  }

  return NextResponse.json({ error: "Auth is not configured." }, { status: 400 });
}
