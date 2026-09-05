import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { parseDataUrl } from "@/lib/emailBrand";
import { setEmailLogoDataUrl } from "@/lib/demoEmailStore";
import { resolveEmailLogo } from "@/lib/emailService";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const MAX_BYTES = 900_000;

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  const logo = await resolveEmailLogo();
  if (!logo) {
    return new NextResponse("Logo not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(logo.buffer), {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as { dataUrl?: string };
  const dataUrl = body.dataUrl?.trim() ?? "";
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return NextResponse.json({ error: "Upload a PNG, JPEG, GIF, or WebP image." }, { status: 400 });
  }
  if (!parsed.contentType.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image." }, { status: 400 });
  }
  if (parsed.buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: "Logo is too large (keep under ~700KB)." }, { status: 400 });
  }

  setEmailLogoDataUrl(dataUrl);
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("email_settings").upsert({
      id: "default",
      logo_data_url: dataUrl,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      return NextResponse.json(
        {
          error: `${error.message} Run supabase/migrations/20260903000008_email_branding.sql if email_settings is missing.`,
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: true, custom: true });
}

export async function DELETE() {
  if (!isAdminSession()) return unauthorized();
  setEmailLogoDataUrl(null);
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    await supabase
      .from("email_settings")
      .upsert({ id: "default", logo_data_url: null, updated_at: new Date().toISOString() });
  }
  return NextResponse.json({ ok: true, custom: false });
}
