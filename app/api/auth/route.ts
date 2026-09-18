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
import { normalizePaymentMethod, type PaymentMethod } from "@/lib/profileTypes";
import { persistTermsAgreement } from "@/lib/helcim";
import { sendWelcomeEmail } from "@/lib/notify";
import {
  fallbackSupabaseConfirmEmail,
  generateSignupConfirmation,
  generateVerifyLink,
  isAuthEmailConfirmed,
  markWelcomeSent,
  verifyEmailHref,
  welcomeAlreadySent,
} from "@/lib/authEmail";
import { getSupabaseAdmin, getSupabaseAuthClient, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

function verificationResponse() {
  return NextResponse.json(
    {
      error: "Check your inbox to verify your email before you can use this paddle.",
      needsVerification: true,
      verifyHref: verifyEmailHref(),
    },
    { status: 403 },
  );
}

async function upsertBidderProfile(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  email: string,
  fields: ReturnType<typeof profileFields>,
) {
  const row = {
    id: userId,
    email,
    full_name: fields.fullName,
    phone: fields.phone,
    street: fields.street,
    city: fields.city,
    province: fields.province,
    postal_code: fields.postalCode.toUpperCase(),
    payment_method: fields.paymentMethod,
    preauth_status: "none",
    preauth_amount: 50,
    preauth_terms_agreed_at: fields.preauthTermsAgreed ? new Date().toISOString() : null,
  };
  let { error } = await supabase.from("profiles").upsert(row);
  if (error && /payment_method|preauth|enum|column|schema/i.test(error.message)) {
    const { preauth_status: _s, preauth_amount: _a, payment_method: _m, ...legacy } = row;
    ({ error } = await supabase.from("profiles").upsert(legacy));
  }
  return error;
}

async function sendWelcomeOnce(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  email: string,
  name: string,
) {
  if (await welcomeAlreadySent(supabase, userId)) return;
  await sendWelcomeEmail(email, name);
  await markWelcomeSent(supabase, userId);
}

async function deliverSignupConfirmation(email: string, name: string, verifyHref: string | null) {
  const mail = await sendWelcomeEmail(email, name, verifyHref || undefined);
  if (mail.ok) return { ...mail, fallback: false as const };
  const fallback = await fallbackSupabaseConfirmEmail(email);
  if (fallback.ok) {
    return { ok: true, mode: "supabase" as const, fallback: true as const, error: mail.error };
  }
  return { ok: false, mode: mail.mode, fallback: false as const, error: mail.error || fallback.error };
}

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
  preauthTermsAgreed?: boolean;
};

function profileFields(body: AuthBody) {
  const paymentMethod = normalizePaymentMethod(body.paymentMethod);
  return {
    fullName: String(body.fullName ?? "").trim(),
    phone: String(body.phone ?? "").trim(),
    street: String(body.street ?? "").trim(),
    city: String(body.city ?? "").trim(),
    province: String(body.province ?? "").trim(),
    postalCode: String(body.postalCode ?? "").trim(),
    paymentMethod,
    preauthTermsAgreed: Boolean(body.preauthTermsAgreed),
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
      const admin = getSupabaseAdmin();
      let { data, error } = await authClient.auth.signInWithPassword({ email, password });
      let pending = /email not confirmed|confirm your email|not verified/i.test(error?.message ?? "");

      if ((error || !data.user || pending) && admin) {
        const profileRow = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
        const stored = profileRow.data?.id
          ? (await admin.auth.admin.getUserById(profileRow.data.id)).data.user
          : null;
        if (isAuthEmailConfirmed(stored)) {
          const retry = await authClient.auth.signInWithPassword({ email, password });
          data = retry.data;
          error = retry.error;
          pending = /email not confirmed|confirm your email|not verified/i.test(error?.message ?? "");
        }
      }

      const authUser = data.user;
      if (pending && !isAuthEmailConfirmed(authUser)) return verificationResponse();
      if (error || !authUser) {
        if (pending) return verificationResponse();
        return NextResponse.json(
          { error: error?.message || "Could not log in." },
          { status: 401 },
        );
      }
      const confirmed = admin
        ? (await admin.auth.admin.getUserById(authUser.id)).data.user ?? authUser
        : authUser;
      if (!isAuthEmailConfirmed(confirmed)) return verificationResponse();
      if (admin) {
        const profile = await admin.from("profiles").select("full_name").eq("id", confirmed.id).maybeSingle();
        await sendWelcomeOnce(
          admin,
          confirmed.id,
          email,
          String(profile.data?.full_name || confirmed.user_metadata?.full_name || email),
        );
      }
      const response = NextResponse.json({ ok: true, verified: true });
      return setBidderCookie(response, confirmed.id);
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
      const created = await generateSignupConfirmation(supabase, {
        email,
        password,
        fullName: fields.fullName,
      });
      if (created.error || !created.user) {
        return NextResponse.json(
          { error: created.error || "Could not sign up." },
          { status: 400 },
        );
      }
      const userId = created.user.id;
      const error = await upsertBidderProfile(supabase, userId, email, fields);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      await persistTermsAgreement(userId, fields.preauthTermsAgreed);

      if (isAuthEmailConfirmed(created.user)) {
        await sendWelcomeOnce(supabase, userId, email, fields.fullName);
        const response = NextResponse.json({ ok: true, verified: true });
        return setBidderCookie(response, userId);
      }

      let verifyHref = created.verifyHref;
      if (!verifyHref) {
        const extra = await generateVerifyLink(supabase, email);
        verifyHref = extra.verifyHref;
      }

      const mail = await deliverSignupConfirmation(email, fields.fullName, verifyHref);
      if (mail.ok) await markWelcomeSent(supabase, userId);
      else console.error("signup_mail_failed", mail.error);

      return NextResponse.json({
        ok: true,
        needsVerification: true,
        verifyHref: verifyEmailHref(),
        mailSent: mail.ok,
        mailError: mail.ok ? undefined : mail.error,
      });
    }
  }

  try {
    const user = createDemoUser({
      email,
      password,
      ...fields,
    });
    void sendWelcomeEmail(user.email, user.fullName);
    const response = NextResponse.json({ ok: true, user: publicProfile(user) });
    return setBidderCookie(response, user.id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sign up." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as { email?: string; action?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 400 });
  }
  const link = await generateVerifyLink(admin, email);
  const profileRow = await admin.from("profiles").select("id, full_name").eq("email", email).maybeSingle();
  const authUser = profileRow.data?.id
    ? (await admin.auth.admin.getUserById(profileRow.data.id)).data.user
    : null;
  if (isAuthEmailConfirmed(authUser)) {
    return NextResponse.json({ ok: true, alreadyVerified: true, needsVerification: false });
  }
  const mail = await deliverSignupConfirmation(
    email,
    String(profileRow.data?.full_name || email),
    link.verifyHref,
  );
  return NextResponse.json({
    ok: true,
    needsVerification: true,
    mailSent: mail.ok,
    mailError: mail.ok ? undefined : mail.error,
  });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  return clearBidderCookie(response);
}
