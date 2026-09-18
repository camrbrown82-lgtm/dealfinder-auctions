import { createHash, randomBytes } from "crypto";
import {
  ensureSeedBidders,
  findDemoUserByEmail,
  getDemoUser,
  setDemoUserPassword,
} from "@/lib/demoUsers";
import { publicAppUrl } from "@/lib/appUrl";
import { sendTransactionalEmail } from "@/lib/transactionalEmail";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

const TTL_MS = 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

type MemoryToken = {
  email: string;
  userId: string;
  expiresAt: number;
  used: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __dealfinderResetTokens: Map<string, MemoryToken> | undefined;
  // eslint-disable-next-line no-var
  var __dealfinderResetCooldown: Map<string, number> | undefined;
}

function tokenStore() {
  if (!globalThis.__dealfinderResetTokens) {
    globalThis.__dealfinderResetTokens = new Map();
  }
  return globalThis.__dealfinderResetTokens;
}

function cooldownStore() {
  if (!globalThis.__dealfinderResetCooldown) {
    globalThis.__dealfinderResetCooldown = new Map();
  }
  return globalThis.__dealfinderResetCooldown;
}

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function genericOk(mode = "noop") {
  return { ok: true as const, sent: true as const, mode };
}

type PaddleAccount = { id: string; email: string; fullName: string };

async function findPaddle(email: string): Promise<PaddleAccount | null> {
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .ilike("email", email)
      .maybeSingle();
    if (profile?.id) {
      return {
        id: profile.id,
        email: String(profile.email || email).toLowerCase(),
        fullName: String(profile.full_name || "Paddle"),
      };
    }

    const admin = supabase.auth.admin as {
      getUserByEmail?: (value: string) => Promise<{ data: { user?: { id: string; email?: string; user_metadata?: { full_name?: string } } } | null }>;
    };
    if (typeof admin.getUserByEmail === "function") {
      const { data } = await admin.getUserByEmail(email);
      if (data?.user?.id) {
        return {
          id: data.user.id,
          email: (data.user.email || email).toLowerCase(),
          fullName: data.user.user_metadata?.full_name || "Paddle",
        };
      }
    }

    for (let page = 1; page <= 5; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const match = data.users.find((user) => (user.email || "").toLowerCase() === email);
      if (match) {
        return {
          id: match.id,
          email,
          fullName: (match.user_metadata?.full_name as string | undefined) || "Paddle",
        };
      }
      if (data.users.length < 200) break;
    }
  }

  ensureSeedBidders();
  const demo = findDemoUserByEmail(email);
  if (!demo) return null;
  return { id: demo.id, email: demo.email, fullName: demo.fullName };
}

async function persistToken(row: {
  email: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  tokenStore().set(row.tokenHash, {
    email: row.email,
    userId: row.userId,
    expiresAt: row.expiresAt.getTime(),
    used: false,
  });

  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from("password_reset_tokens").insert({
    email: row.email,
    user_id: row.userId,
    token_hash: row.tokenHash,
    expires_at: row.expiresAt.toISOString(),
  });
  if (error && !/relation|schema|does not exist|password_reset_tokens/i.test(error.message)) {
    console.warn("password_reset_tokens insert:", error.message);
  }
}

export async function issuePasswordReset(emailRaw: string): Promise<{
  ok: true;
  sent: true;
  mode: string;
  devResetUrl?: string;
}> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return genericOk();

  const last = cooldownStore().get(email) ?? 0;
  if (Date.now() - last < RESEND_COOLDOWN_MS) {
    return genericOk("throttled");
  }

  const paddle = await findPaddle(email);
  if (!paddle) return genericOk();

  cooldownStore().set(email, Date.now());

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + TTL_MS);
  await persistToken({
    email: paddle.email,
    userId: paddle.id,
    tokenHash,
    expiresAt,
  });

  const resetUrl = `${publicAppUrl()}/reset-password?token=${token}`;
  const mailed = await sendTransactionalEmail({
    templateId: "password_reset",
    to: paddle.email,
    vars: {
      customer_name: paddle.fullName || "Paddle",
      item_title: "DealFinder paddle",
      winning_bid: "",
      payment_link: resetUrl,
    },
    forceDeliver: true,
  });

  const result: {
    ok: true;
    sent: true;
    mode: string;
    devResetUrl?: string;
  } = {
    ok: true,
    sent: true,
    mode: mailed.ok ? mailed.mode : "demo-outbox",
  };
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") {
    result.devResetUrl = resetUrl;
  }
  return result;
}

export async function consumePasswordReset(token: string, password: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!token) return { ok: false, error: "This reset link is missing a token." };
  if (password.length < 6) {
    return { ok: false, error: "Use a password of at least 6 characters." };
  }

  const tokenHash = hashResetToken(token);
  const now = Date.now();
  let userId: string | null = null;
  let email: string | null = null;

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase
      .from("password_reset_tokens")
      .select("id, email, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (data) {
      if (data.used_at) return { ok: false, error: "This reset link was already used." };
      if (new Date(data.expires_at).getTime() < now) {
        return { ok: false, error: "This reset link has expired. Request a new one." };
      }
      userId = data.user_id;
      email = data.email;
      await supabase
        .from("password_reset_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", data.id);
    }
  }

  if (!userId) {
    const mem = tokenStore().get(tokenHash);
    if (!mem) return { ok: false, error: "This reset link is invalid or expired." };
    if (mem.used) return { ok: false, error: "This reset link was already used." };
    if (mem.expiresAt < now) {
      return { ok: false, error: "This reset link has expired. Request a new one." };
    }
    mem.used = true;
    userId = mem.userId;
    email = mem.email;
  }

  if (isSupabaseConfigured && supabase && userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (!error) return { ok: true };
    if (!/user not found|not found/i.test(error.message)) {
      return { ok: false, error: error.message };
    }
  }

  const demo = (userId && getDemoUser(userId)) || (email ? findDemoUserByEmail(email) : null);
  if (!demo) return { ok: false, error: "Could not update that paddle password." };
  setDemoUserPassword(demo.id, password);
  return { ok: true };
}
