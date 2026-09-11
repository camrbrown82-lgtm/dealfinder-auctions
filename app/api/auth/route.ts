import { NextResponse } from "next/server";
import { emptyProfile } from "@/lib/catalog";
import { clearBidderCookie, getSessionUser, setBidderCookie } from "@/lib/session";
import { loginUser, signupUser } from "@/lib/store";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "");
  const password = String(body.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "You must provide either an email or phone number and a password" }, { status: 400 });
  }
  const user = await loginUser(email, password);
  if (!user) return NextResponse.json({ error: "Could not log in." }, { status: 401 });
  await setBidderCookie(user.id);
  return NextResponse.json({ user });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "");
  const password = String(body.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "You must provide either an email or phone number and a password" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  try {
    const defaults = emptyProfile();
    const user = await signupUser({
      email,
      password,
      fullName: String(body.fullName || defaults.fullName),
      phone: String(body.phone || defaults.phone),
      street: String(body.street || defaults.street),
      city: String(body.city || defaults.city),
      province: String(body.province || defaults.province),
      postalCode: String(body.postalCode || defaults.postalCode),
      paymentMethod: body.paymentMethod === "pay_on_arrival" ? "pay_on_arrival" : "interac_etransfer",
    });
    await setBidderCookie(user.id);
    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not sign up." }, { status: 400 });
  }
}

export async function DELETE() {
  await clearBidderCookie();
  return NextResponse.json({ user: null });
}
