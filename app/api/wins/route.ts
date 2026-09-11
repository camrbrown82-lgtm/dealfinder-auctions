import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listWins } from "@/lib/store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ wins: [] });
  const wins = await listWins(user.id);
  return NextResponse.json({ wins });
}
