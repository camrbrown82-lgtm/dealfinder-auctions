import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getEmailLogoDataUrl, upsertEmailTemplate } from "@/lib/demoEmailStore";
import { loadLiveEmailTemplates } from "@/lib/emailService";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { slugifyTemplateId } from "@/lib/emailTemplates";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  const templates = await loadLiveEmailTemplates();
  return NextResponse.json({
    templates,
    logoPreview: "/api/admin/email-logo",
    hasCustomLogo: Boolean(getEmailLogoDataUrl()),
  });
}

export async function PATCH(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as {
    id?: string;
    name?: string;
    subject?: string;
    body?: string;
  };
  if (!body.id || body.subject == null || body.body == null) {
    return NextResponse.json({ error: "id, subject, and body are required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const name = body.name?.trim();
  if (isSupabaseConfigured && supabase) {
    const existingName =
      (await loadLiveEmailTemplates()).find((row) => row.id === body.id)?.name ?? body.id;
    await supabase.from("email_templates").upsert({
      id: body.id,
      name: name || existingName,
      subject: body.subject,
      body: body.body,
    });
  }

  const saved = upsertEmailTemplate(body.id, body.subject, body.body, name);
  return NextResponse.json({ ok: true, template: saved });
}

export async function POST(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as {
    name?: string;
    subject?: string;
    body?: string;
    id?: string;
  };
  const name = body.name?.trim();
  if (!name || body.subject == null || body.body == null) {
    return NextResponse.json({ error: "name, subject, and body are required." }, { status: 400 });
  }

  const templates = await loadLiveEmailTemplates();
  let id = (body.id || slugifyTemplateId(name)).trim();
  if (templates.some((row) => row.id === id)) {
    id = `${id}_${Date.now().toString(36)}`;
  }

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("email_templates").insert({
      id,
      name,
      subject: body.subject,
      body: body.body,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const saved = upsertEmailTemplate(id, body.subject, body.body, name);
  return NextResponse.json({ ok: true, template: saved });
}
