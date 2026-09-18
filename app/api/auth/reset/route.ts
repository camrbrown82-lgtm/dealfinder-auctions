import { NextRequest, NextResponse } from "next/server";
import { consumePasswordReset } from "@/lib/passwordReset";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
  };
  const result = await consumePasswordReset(
    String(body.token ?? ""),
    String(body.password ?? ""),
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Could not reset password." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
