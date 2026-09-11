import { NextResponse } from "next/server";
import { adminPassword, clearAdminCookie, isAdmin, setAdminCookie } from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (String(body.password || "") !== adminPassword()) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  await setAdminCookie();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearAdminCookie();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
