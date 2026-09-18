import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { issuePasswordReset } from "@/lib/passwordReset";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as { id?: string; email?: string };
  const email = String(body.email ?? "").trim();
  if (!email) return NextResponse.json({ error: "User email required." }, { status: 400 });

  const result = await issuePasswordReset(email);
  return NextResponse.json({
    ok: true,
    mode: result.mode,
    ...(result.devResetUrl ? { devResetUrl: result.devResetUrl } : {}),
  });
}
