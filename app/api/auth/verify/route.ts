import { NextRequest, NextResponse } from "next/server";
import { setBidderCookie } from "@/lib/bidderAuth";
import {
  isAuthEmailConfirmed,
  markWelcomeSent,
  welcomeAlreadySent,
} from "@/lib/authEmail";
import { sendWelcomeEmail } from "@/lib/notify";
import { getSupabaseAdmin, getSupabaseAuthClient } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { accessToken?: string };
  const accessToken = String(body.accessToken ?? "").trim();
  if (!accessToken) {
    return NextResponse.json({ error: "Missing confirmation token." }, { status: 400 });
  }

  const authClient = getSupabaseAuthClient();
  const admin = getSupabaseAdmin();
  if (!authClient || !admin) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 400 });
  }

  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user || !isAuthEmailConfirmed(data.user)) {
    return NextResponse.json(
      { error: "Confirm the link in your inbox first." },
      { status: 403 },
    );
  }

  const profile = await admin.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
  const name = String(profile.data?.full_name || data.user.user_metadata?.full_name || data.user.email || "Bidder");
  if (!(await welcomeAlreadySent(admin, data.user.id))) {
    await sendWelcomeEmail(data.user.email || "", name);
    await markWelcomeSent(admin, data.user.id);
  }

  const response = NextResponse.json({ ok: true, verified: true });
  return setBidderCookie(response, data.user.id);
}
