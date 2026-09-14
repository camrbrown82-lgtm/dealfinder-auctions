import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function publicUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
}

function publicAnonKey() {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
}

function serviceRoleKey() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export function getSupabaseClient(): SupabaseClient {
  const url = publicUrl();
  const anonKey = publicAnonKey();
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(url, anonKey);
}

export function getSupabaseAuthClient(): SupabaseClient | null {
  const url = publicUrl();
  const anonKey = publicAnonKey();
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = publicUrl();
  const key = serviceRoleKey() || publicAnonKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
