import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { listLiveLots } from "@/lib/store";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const lots = await listLiveLots();
  return NextResponse.json({ lots });
}
