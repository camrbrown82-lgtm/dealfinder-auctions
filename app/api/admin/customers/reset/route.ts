import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { queueReset } from "@/lib/store";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const email = await queueReset(String(body.id));
    return NextResponse.json({ email });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not send reset." }, { status: 400 });
  }
}
