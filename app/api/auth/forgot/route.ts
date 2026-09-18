import { NextRequest, NextResponse } from "next/server";
import { issuePasswordReset } from "@/lib/passwordReset";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const result = await issuePasswordReset(String(body.email ?? ""));
  return NextResponse.json({
    ok: true,
    message: "If that email has a paddle, we sent a reset link. Check inbox and spam.",
    mode: result.mode,
    ...(result.devResetUrl ? { devResetUrl: result.devResetUrl } : {}),
  });
}
