import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicAppUrl } from "@/lib/appUrl";

export function isAuthEmailConfirmed(user: User | null | undefined) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

export function verifyEmailHref() {
  return `${publicAppUrl()}/verify-email`;
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
