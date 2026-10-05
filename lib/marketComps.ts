import { compsSearchQuery, identityMarkings } from "@/lib/lotIdentity";

export type MarketPricing = {
  estimated_market_value: number;
  suggested_reserve: number;
  suggested_starting_bid: number;
  comps_note: string;
  openaiIds: string[];
};

type CatalogFacts = {
  title: string;
  maker?: string;
  model?: string;
  objectType: string;
  visibleText: string[];
  condition: string;
  uncertainties: string[];
};

export type CompLookup = {
  snippet: string;
  prices: number[];
};

function asInt(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function searchQuery(facts: CatalogFacts) {
  return (
    compsSearchQuery({
      maker: facts.maker,
      model: facts.model,
      objectType: facts.objectType,
      visibleText: facts.visibleText,
    }) || facts.title.slice(0, 140)
  );
}

function extractUsd(text: string): number[] {
  const amounts: number[] = [];
  const re = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const n = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 3 && n <= 25000) amounts.push(Math.round(n));
  }
  return amounts;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function fetchText(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(8000),
    headers: {
      "user-agent":
        "DealFinderAuctions/1.0 (catalog comps; +https://dealfinder-auctions.vercel.app)",
      accept: "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) return "";
  return response.text();
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

async function ebayRss(query: string): Promise<CompLookup> {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_rss=1&LH_BIN=1`;
  const xml = await fetchText(url);
  if (!xml) return { snippet: "", prices: [] };
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  const items: string[] = [];
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRe.exec(xml)) && items.length < 8) {
    items.push(itemMatch[1]);
  }
  const lines = items.map((item) => {
    const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
    const desc = item.match(
      /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/i,
    );
    return stripHtml(`${title?.[1] || title?.[2] || ""} ${desc?.[1] || desc?.[2] || ""}`);
  });
  const snippet = `eBay listings:\n${lines.join("\n")}`.slice(0, 3500);
  return { snippet, prices: extractUsd(snippet) };
}

/** One public listing fetch. Start this while the catalog text is still being written. */
export function beginCompLookup(query: string): Promise<CompLookup> {
  const q = query.trim().slice(0, 140) || "collectible";
  return ebayRss(q).catch(() => ({ snippet: "", prices: [] }));
}

function parsePricingJson(raw: string): Partial<MarketPricing> & { notes?: string } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      estimated_market_value: asInt(parsed.estimated_market_value, 0),
      suggested_reserve: asInt(parsed.suggested_reserve, 0),
      suggested_starting_bid: asInt(parsed.suggested_starting_bid, 0),
      notes: String(parsed.notes ?? ""),
    };
  } catch {
    return {};
  }
}

async function priceFromSnippets(
  apiKey: string,
  facts: CatalogFacts,
  snippets: string,
  scrapedPrices: number[],
) {
  const openai = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content:
            "You set conservative auction estimates from one batch of comparable listings. Prefer sold prices. Ignore mismatches, lots-of-many, and shipping. Return JSON only.",
        },
        {
          role: "user",
          content: `Lot: ${facts.title}
Maker: ${facts.maker || "unknown"}
Model (confirmed only): ${facts.model || "not printed / do not guess"}
Object: ${facts.objectType}
Markings: ${facts.visibleText.join("; ") || "none"}
Condition: ${facts.condition || "unknown"}
Unconfirmed: ${facts.uncertainties.join("; ") || "none"}
Scraped USD amounts found: ${scrapedPrices.slice(0, 20).join(", ") || "none"}

Public listing snippets:
${snippets.slice(0, 3500)}

Return JSON:
{
  "estimated_market_value": integer,
  "suggested_reserve": integer,
  "suggested_starting_bid": integer,
  "notes": string
}
Buy now (suggested_reserve) = 70-85% of conservative market. Starting bid = 40-60% of market. If comps are weak, go low.`,
        },
      ],
    }),
  });
  const json = (await openai.json()) as {
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  return {
    parsed: parsePricingJson(json.choices?.[0]?.message?.content ?? ""),
    id: json.id ?? "",
  };
}

function finalize(
  parsed: Partial<MarketPricing> & { notes?: string },
  scrapedPrices: number[],
  extraNote?: string,
  openaiIds: string[] = [],
): MarketPricing {
  const mid = median(scrapedPrices);
  let market = asInt(parsed.estimated_market_value, 0);
  if (mid > 0 && scrapedPrices.length >= 2) {
    market = mid;
  } else if (mid > 0) {
    if (market <= 0) market = mid;
    if (market > mid * 2) market = Math.round(mid * 1.15);
    if (market < mid * 0.25) market = Math.round(mid * 0.7);
  }
  if (market <= 0) market = 15;
  let reserve = asInt(parsed.suggested_reserve, 0);
  if (reserve <= 0 || reserve > market) reserve = Math.round(market * 0.8);
  let start = asInt(parsed.suggested_starting_bid, 0);
  if (start <= 0 || start > reserve) {
    start = Math.min(reserve, Math.max(1, Math.round(market * 0.45)));
  }
  const notes = [parsed.notes, extraNote, mid > 0 ? `Public listing median about $${mid}.` : ""]
    .filter(Boolean)
    .join(" ");
  return {
    estimated_market_value: market,
    suggested_reserve: reserve,
    suggested_starting_bid: start,
    comps_note: notes || "Conservative estimate from public comps.",
    openaiIds: openaiIds.filter(Boolean),
  };
}

export async function priceFromMarketComps(
  apiKey: string,
  facts: CatalogFacts,
  started?: Promise<CompLookup>,
): Promise<MarketPricing> {
  const locked: CatalogFacts = {
    ...facts,
    visibleText: identityMarkings(facts.visibleText),
  };
  const lookup = started ?? beginCompLookup(searchQuery(locked) || locked.objectType || "collectible");
  const rss = await lookup;
  const fromSnippets = await priceFromSnippets(apiKey, locked, rss.snippet, rss.prices);
  return finalize(
    fromSnippets.parsed,
    rss.prices,
    rss.snippet ? "Priced from one eBay listing pass." : "Few public comps found; kept conservative.",
    [fromSnippets.id],
  );
}
