import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { adminSnapshot, setCustomerStatus } from "@/lib/store";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const snap = await adminSnapshot();
  return NextResponse.json({ customers: snap.customers });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const user = await setCustomerStatus(String(body.id), body.status === "suspended" ? "suspended" : "active");
    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not update bidder." }, { status: 400 });
  }
}
