import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { updateProfile } from "@/lib/store";

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Log in to bid." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const next = await updateProfile(user.id, body);
    return NextResponse.json({ user: next });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save profile." }, { status: 400 });
  }
}
