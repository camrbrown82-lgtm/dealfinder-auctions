import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  EBAY_APP_SCOPES,
  EBAY_INSIGHTS_SCOPES,
  EBAY_USER_SCOPES,
  ebayApiHost,
  ebayAuthHost,
  ebayClientId,
  ebayClientSecret,
  ebayConfigured,
  ebayRuName,
} from "@/lib/ebay/config";
import { adminPassword } from "@/lib/adminAuth";

export const EBAY_OAUTH_COOKIE = "df_ebay_oauth";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function basicAuth() {
  return Buffer.from(`${ebayClientId()}:${ebayClientSecret()}`).toString("base64");
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(`${ebayApiHost()}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth()}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `eBay token HTTP ${response.status}`);
  }
  return json;
}

export function signOauthState() {
  const nonce = randomBytes(16).toString("hex");
  const mac = createHmac("sha256", adminPassword()).update(`ebay-oauth:${nonce}`).digest("hex");
  return `${nonce}.${mac}`;
}

export function oauthStateValid(value: string | undefined) {
  if (!value || !value.includes(".")) return false;
  const [nonce, mac] = value.split(".");
  if (!nonce || !mac) return false;
  const expected = createHmac("sha256", adminPassword()).update(`ebay-oauth:${nonce}`).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function ebayAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: ebayClientId(),
    redirect_uri: ebayRuName(),
    response_type: "code",
    scope: EBAY_USER_SCOPES.join(" "),
    state,
  });
  return `${ebayAuthHost()}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeAuthorizationCode(code: string) {
  if (!ebayConfigured()) throw new Error("eBay app keys are not set.");
  const json = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: ebayRuName(),
    }),
  );
  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token || "",
    expiresAt: Date.now() + Math.max(60, Number(json.expires_in) || 7200) * 1000,
  };
}

export async function refreshUserAccessToken(refreshToken: string) {
  const json = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: EBAY_USER_SCOPES.join(" "),
    }),
  );
  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token || refreshToken,
    expiresAt: Date.now() + Math.max(60, Number(json.expires_in) || 7200) * 1000,
  };
}

const appTokenCache = new Map<string, { token: string; expiresAt: number }>();

async function applicationToken(scopes: string[]) {
  if (!ebayConfigured()) return "";
  const key = scopes.join(" ");
  const cached = appTokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  try {
    const json = await tokenRequest(
      new URLSearchParams({
        grant_type: "client_credentials",
        scope: key,
      }),
    );
    const token = json.access_token as string;
    appTokenCache.set(key, {
      token,
      expiresAt: Date.now() + Math.max(60, Number(json.expires_in) || 7200) * 1000,
    });
    return token;
  } catch {
    return "";
  }
}

export function ebayAppToken() {
  return applicationToken(EBAY_APP_SCOPES);
}

export function ebayInsightsToken() {
  return applicationToken(EBAY_INSIGHTS_SCOPES);
}
