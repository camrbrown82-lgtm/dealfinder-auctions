import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { refreshUserAccessToken } from "@/lib/ebay/oauth";
import { ebayMarketplaceId } from "@/lib/ebay/config";

export type EbayConnection = {
  ebayUserId: string | null;
  ebayUsername: string | null;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  marketplaceId: string;
  merchantLocationKey: string | null;
  fulfillmentPolicyId: string | null;
  paymentPolicyId: string | null;
  returnPolicyId: string | null;
  connectedAt: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __dealfinderEbayConnection: EbayConnection | undefined;
}

function missingTable(error: { message?: string } | null) {
  return Boolean(
    error?.message && /ebay_connections|schema cache|could not find the table/i.test(error.message),
  );
}

function fromRow(row: Record<string, unknown>): EbayConnection {
  return {
    ebayUserId: row.ebay_user_id ? String(row.ebay_user_id) : null,
    ebayUsername: row.ebay_username ? String(row.ebay_username) : null,
    accessToken: String(row.access_token ?? ""),
    refreshToken: String(row.refresh_token ?? ""),
    accessExpiresAt: String(row.access_expires_at ?? ""),
    marketplaceId: String(row.marketplace_id || ebayMarketplaceId()),
    merchantLocationKey: row.merchant_location_key ? String(row.merchant_location_key) : null,
    fulfillmentPolicyId: row.fulfillment_policy_id ? String(row.fulfillment_policy_id) : null,
    paymentPolicyId: row.payment_policy_id ? String(row.payment_policy_id) : null,
    returnPolicyId: row.return_policy_id ? String(row.return_policy_id) : null,
    connectedAt: String(row.connected_at ?? new Date().toISOString()),
  };
}

export async function readEbayConnection(): Promise<EbayConnection | null> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data, error } = await supabase.from("ebay_connections").select("*").eq("id", 1).maybeSingle();
      if (!error && data) return fromRow(data as Record<string, unknown>);
      if (error && !missingTable(error)) {
        console.error("readEbayConnection", error.message);
      }
    }
  }
  return globalThis.__dealfinderEbayConnection ?? null;
}

export async function writeEbayConnection(next: EbayConnection) {
  globalThis.__dealfinderEbayConnection = next;
  if (!isSupabaseConfigured) return next;
  const supabase = getSupabaseAdmin();
  if (!supabase) return next;
  const row = {
    id: 1,
    ebay_user_id: next.ebayUserId,
    ebay_username: next.ebayUsername,
    access_token: next.accessToken,
    refresh_token: next.refreshToken,
    access_expires_at: next.accessExpiresAt,
    marketplace_id: next.marketplaceId,
    merchant_location_key: next.merchantLocationKey,
    fulfillment_policy_id: next.fulfillmentPolicyId,
    payment_policy_id: next.paymentPolicyId,
    return_policy_id: next.returnPolicyId,
    connected_at: next.connectedAt,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("ebay_connections").upsert(row, { onConflict: "id" });
  if (error && !missingTable(error)) {
    console.error("writeEbayConnection", error.message);
  }
  return next;
}

export async function clearEbayConnection() {
  globalThis.__dealfinderEbayConnection = undefined;
  if (!isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from("ebay_connections").delete().eq("id", 1);
}

export async function liveEbayAccessToken() {
  const connection = await readEbayConnection();
  if (!connection?.refreshToken && !connection?.accessToken) return null;
  if (new Date(connection.accessExpiresAt).getTime() > Date.now() + 60_000) {
    return { token: connection.accessToken, connection };
  }
  if (!connection.refreshToken) return { token: connection.accessToken, connection };
  const refreshed = await refreshUserAccessToken(connection.refreshToken);
  const next: EbayConnection = {
    ...connection,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    accessExpiresAt: new Date(refreshed.expiresAt).toISOString(),
  };
  await writeEbayConnection(next);
  return { token: next.accessToken, connection: next };
}

export function connectionPublicStatus(connection: EbayConnection | null) {
  return {
    connected: Boolean(connection?.accessToken || connection?.refreshToken),
    username: connection?.ebayUsername ?? null,
    marketplaceId: connection?.marketplaceId || ebayMarketplaceId(),
    hasPolicies: Boolean(
      connection?.fulfillmentPolicyId && connection?.paymentPolicyId && connection?.returnPolicyId,
    ),
    connectedAt: connection?.connectedAt ?? null,
  };
}
