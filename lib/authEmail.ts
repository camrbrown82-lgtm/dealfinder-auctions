import type { EmailOtpType, User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicAppUrl } from "@/lib/appUrl";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";

export function isAuthEmailConfirmed(user: User | null | undefined) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

export function verifyEmailHref() {
  return `${publicAppUrl()}/verify-email`;
}

export function confirmationPageHref(tokenHash: string, type: string) {
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: otpType(type),
  });
  return `${verifyEmailHref()}?${params.toString()}`;
}

function otpType(value: string): EmailOtpType {
  const type = value.toLowerCase().replace(/-/g, "");
  if (type === "magiclink" || type === "invite" || type === "recovery" || type === "emailchange" || type === "email") {
    return type === "emailchange" ? "email_change" : (type as EmailOtpType);
  }
  return "signup";
}

export async function loadAuthUser(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user;
}

export async function markWelcomeSent(supabase: SupabaseClient, userId: string) {
  const at = new Date().toISOString();
  const { error } = await supabase.from("profiles").update({ welcome_email_sent_at: at }).eq("id", userId);
  if (error && /welcome_email_sent_at/i.test(error.message)) return;
}

export async function welcomeAlreadySent(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("welcome_email_sent_at")
    .eq("id", userId)
    .maybeSingle();
  if (error && /welcome_email_sent_at/i.test(error.message)) return false;
  return Boolean(data?.welcome_email_sent_at);
}

type LinkProperties = {
  hashed_token?: string;
  verification_type?: string;
  action_link?: string;
  redirect_to?: string;
};

function hrefFromGeneratedLink(properties: LinkProperties | undefined, raw?: unknown) {
  const extra = raw && typeof raw === "object" ? (raw as LinkProperties) : {};
  const bag: LinkProperties = { ...extra, ...properties };
  let hash = bag.hashed_token?.trim();
  if (!hash && bag.action_link) {
    try {
      hash = new URL(bag.action_link).searchParams.get("token") ?? undefined;
    } catch {
      hash = undefined;
    }
  }
  if (hash) return confirmationPageHref(hash, bag.verification_type || extra.verification_type || "signup");
  const action = bag.action_link?.trim();
  if (!action) return null;
  try {
    const url = new URL(action);
    url.searchParams.set("redirect_to", verifyEmailHref());
    return url.toString();
  } catch {
    return action;
  }
}

export async function generateSignupConfirmation(
  supabase: SupabaseClient,
  input: { email: string; password: string; fullName: string },
) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "signup",
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName },
      redirectTo: verifyEmailHref(),
    },
  });
  if (error || !data.user) {
    return { user: null as User | null, verifyHref: null as string | null, error: error?.message || "Could not sign up." };
  }
  return {
    user: data.user,
    verifyHref: hrefFromGeneratedLink(data.properties, data),
    error: null as string | null,
  };
}

export async function generateVerifyLink(supabase: SupabaseClient, email: string) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: verifyEmailHref() },
  });
  if (error) return { verifyHref: null as string | null, error: error.message };
  return { verifyHref: hrefFromGeneratedLink(data.properties, data), error: null as string | null };
}

export async function fallbackSupabaseConfirmEmail(email: string) {
  const authClient = getSupabaseAuthClient();
  if (!authClient) return { ok: false, error: "Auth client missing" };
  const { error } = await authClient.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: verifyEmailHref() },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null as string | null };
}
