import { NextRequest, NextResponse } from "next/server";
import {
  clearBidderCookie,
  getBidderSession,
  setBidderCookie,
} from "@/lib/bidderAuth";
import {
  createDemoUser,
  findDemoUserByEmail,
  publicProfile,
  verifyPassword,
} from "@/lib/demoUsers";
import { isPaymentMethod, type PaymentMethod } from "@/lib/profileTypes";
import { getSupabaseAdmin, getSupabaseAuthClient, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

type AuthBody = {
  email?: string;
  password?: string;
  fullName?: string;
  phone?: string;
  street?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  paymentMethod?: PaymentMethod;
};

function profileFields(body: AuthBody) {
  const paymentMethod = isPaymentMethod(body.paymentMethod)
    ? body.paymentMethod
    : "interac_etransfer";
  return {
    fullName: String(body.fullName ?? "").trim(),
    phone: String(body.phone ?? "").trim(),
    street: String(body.street ?? "").trim(),
    city: String(body.city ?? "").trim(),
    province: String(body.province ?? "").trim(),
    postalCode: String(body.postalCode ?? "").trim(),
    paymentMethod,
  };
}

export async function GET() {
  const user = await getBidderSession();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AuthBody;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  if (isSupabaseConfigured) {
    const authClient = getSupabaseAuthClient();
    if (authClient) {
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        return NextResponse.json(
          { error: error?.message || "Could not log in." },
          { status: 401 },
        );
      }
      const response = NextResponse.json({ ok: true });
      return setBidderCookie(response, data.user.id);
    }
  }

  const demo = findDemoUserByEmail(email);
  if (!demo || !verifyPassword(password, demo.passwordHash)) {
    return NextResponse.json({ error: "Could not log in." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true, user: publicProfile(demo) });
  return setBidderCookie(response, demo.id);
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as AuthBody;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fields = profileFields(body);

  if (!email || password.length < 6) {
    return NextResponse.json(
      { error: "Use a valid email and a password of at least 6 characters." },
      { status: 400 },
    );
  }
  if (
    !fields.fullName ||
    !fields.phone ||
    !fields.street ||
    !fields.city ||
    !fields.province ||
    !fields.postalCode
  ) {
    return NextResponse.json(
      { error: "Fill in name, phone, and full shipping address." },
      { status: 400 },
    );
  }

  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const created = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fields.fullName },
      });
      if (created.error || !created.data.user) {
        const duplicate = /already/i.test(created.error?.message ?? "");
        if (duplicate) {
          return NextResponse.json(
            { error: created.error?.message || "Could not sign up." },
            { status: 400 },
          );
        }
      } else {
        const userId = created.data.user.id;
        const { error } = await supabase.from("profiles").upsert({
          id: userId,
          email,
          full_name: fields.fullName,
          phone: fields.phone,
          street: fields.street,
          city: fields.city,
          province: fields.province,
          postal_code: fields.postalCode.toUpperCase(),
          payment_method: fields.paymentMethod,
        });
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        const response = NextResponse.json({ ok: true });
        return setBidderCookie(response, userId);
      }
    }
  }

  try {
    const user = createDemoUser({
      email,
      password,
      ...fields,
    });
    const response = NextResponse.json({ ok: true, user: publicProfile(user) });
    return setBidderCookie(response, user.id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sign up." },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  return clearBidderCookie(response);
}
