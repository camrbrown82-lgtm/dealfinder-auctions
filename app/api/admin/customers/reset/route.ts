import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getDemoUser } from "@/lib/demoUsers";
import { getOutbox } from "@/lib/demoEmailStore";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as { id?: string; email?: string };
  const supabase = getSupabaseAdmin();

  if (isSupabaseConfigured && supabase && body.email) {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: body.email,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    getOutbox().unshift({
      to: body.email,
      subject: "Password reset",
      body: data.properties?.action_link ?? "Recovery link generated.",
      at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, mode: "supabase" });
  }

  const user = body.id ? getDemoUser(body.id) : null;
  const email = body.email || user?.email;
  if (!email) return NextResponse.json({ error: "User email required." }, { status: 400 });
  getOutbox().unshift({
    to: email,
    subject: "Password reset / staff alert",
    body: "Demo mode: reset this paddle password from the auth desk. Alert logged.",
    at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, mode: "demo" });
}
