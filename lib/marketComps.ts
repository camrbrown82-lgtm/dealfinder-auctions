export type MarketPricing = {
  estimated_market_value: number;
  suggested_reserve: number;
  suggested_starting_bid: number;
  comps_note: string;
};

type CatalogFacts = {
  title: string;
  objectType: string;
  visibleText: string[];
  condition: string;
  uncertainties: string[];
};

const COMP_DOMAINS = [
  "ebay.com",
  "liveauctioneers.com",
  "invaluable.com",
  "etsy.com",
  "reverb.com",
  "chairish.com",
  "1stdibs.com",
];

function asInt(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function searchQuery(facts: CatalogFacts) {
  const bits = [
    facts.title,
    facts.objectType,
    ...facts.visibleText.slice(0, 3),
  ]
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(bits.map((part) => part.toLowerCase())));
  return unique.join(" ").slice(0, 140);
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

async function ebayRss(query: string) {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_rss=1&LH_BIN=1`;
  const xml = await fetchText(url);
  if (!xml) return { snippet: "", prices: [] as number[] };
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

async function duckDuckGo(query: string) {
  const html = await fetchText("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `q=${encodeURIComponent(query)}`,
  });
  if (!html) return { snippet: "", prices: [] as number[] };
  const snippet = `Search (${query}):\n${stripHtml(html)}`.slice(0, 3500);
  return { snippet, prices: extractUsd(snippet) };
}

async function openaiWebComps(apiKey: string, facts: CatalogFacts, query: string) {
  const prompt = `Find recent comparable prices for this auction lot from public listings.
Prefer SOLD or completed prices over asking prices.
Search eBay, LiveAuctioneers, Invaluable, Etsy, Reverb, Chairish, and similar public marketplaces.
Do not use a rare/branded variant unless the photos confirmed it.

Lot title: ${facts.title}
Object: ${facts.objectType}
Visible markings: ${facts.visibleText.join("; ") || "none"}
Condition: ${facts.condition || "unknown"}
Unconfirmed: ${facts.uncertainties.join("; ") || "none"}
Search query: ${query}

Return JSON only:
{
  "sources": [{"site": string, "listing": string, "price_usd": number, "sold_or_asking": "sold"|"asking", "url": string}],
  "estimated_market_value": integer,
  "suggested_reserve": integer,
  "suggested_starting_bid": integer,
  "notes": string
}
Rules: estimated_market_value is a conservative typical retail/auction hammer for THIS visible object. suggested_reserve is 70-85% of that. suggested_starting_bid is 40-60%. If comps are thin or identity is unclear, go low. Ignore shipping, lot-of-many, and obvious mismatches.`;

  const body = {
    model: "gpt-4o",
    tools: [
      {
        type: "web_search",
        filters: { allowed_domains: COMP_DOMAINS },
      },
    ],
    tool_choice: { type: "web_search" },
    temperature: 0.1,
    text: { format: { type: "json_object" } },
    input: prompt,
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const retry = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(25000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        tools: [{ type: "web_search" }],
        input: prompt,
      }),
    });
    const retryJson = (await retry.json()) as Record<string, unknown>;
    if (!retry.ok) return { text: "", prices: [] as number[] };
    return parseOpenAiResponse(retryJson);
  }
  return parseOpenAiResponse(json);
}

function parseOpenAiResponse(data: Record<string, unknown>) {
  const chunks: string[] = [];
  if (typeof data.output_text === "string") chunks.push(data.output_text);
  for (const item of (data.output as Array<Record<string, unknown>> | undefined) ?? []) {
    for (const content of (item.content as Array<Record<string, unknown>> | undefined) ?? []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  const text = chunks.join("\n");
  return { text, prices: extractUsd(text) };
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
      model: "gpt-4o",
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "You set conservative auction estimates from comparable listings. Prefer sold prices. Ignore mismatches, lots-of-many, and shipping. Return JSON only.",
        },
        {
          role: "user",
          content: `Lot: ${facts.title}
Object: ${facts.objectType}
Markings: ${facts.visibleText.join("; ") || "none"}
Condition: ${facts.condition || "unknown"}
Unconfirmed: ${facts.uncertainties.join("; ") || "none"}
Scraped USD amounts found: ${scrapedPrices.slice(0, 20).join(", ") || "none"}

Public listing snippets:
${snippets.slice(0, 8000)}

Return JSON:
{
  "estimated_market_value": integer,
  "suggested_reserve": integer,
  "suggested_starting_bid": integer,
  "notes": string
}
Reserve = 70-85% of conservative market. Starting bid = 40-60%. If comps are weak, go low.`,
        },
      ],
    }),
  });
  const json = (await openai.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parsePricingJson(json.choices?.[0]?.message?.content ?? "");
}

function finalize(
  parsed: Partial<MarketPricing> & { notes?: string },
  scrapedPrices: number[],
  extraNote?: string,
): MarketPricing {
  const mid = median(scrapedPrices);
  let market = asInt(parsed.estimated_market_value, 0);
  if (mid > 0) {
    if (market <= 0) market = mid;
    if (market > mid * 2) market = Math.round(mid * 1.15);
    if (market < mid * 0.25) market = Math.round(mid * 0.7);
  }
  if (market <= 0) market = 15;
  let reserve = asInt(parsed.suggested_reserve, 0);
  if (reserve <= 0 || reserve > market) reserve = Math.round(market * 0.8);
  let start = asInt(parsed.suggested_starting_bid, 0);
  if (start <= 0 || start > reserve) start = Math.max(5, Math.round(market * 0.45));
  const notes = [parsed.notes, extraNote, mid > 0 ? `Public listing median about $${mid}.` : ""]
    .filter(Boolean)
    .join(" ");
  return {
    estimated_market_value: market,
    suggested_reserve: reserve,
    suggested_starting_bid: start,
    comps_note: notes || "Conservative estimate from public comps.",
  };
}

export async function priceFromMarketComps(
  apiKey: string,
  facts: CatalogFacts,
): Promise<MarketPricing> {
  const query = searchQuery(facts) || facts.objectType || "collectible";
  const [rss, ddgEbay, ddgAuction, web] = await Promise.allSettled([
    ebayRss(query),
    duckDuckGo(`${query} sold ebay`),
    duckDuckGo(`${query} sold site:liveauctioneers.com OR site:invaluable.com`),
    openaiWebComps(apiKey, facts, query),
  ]);

  const snippets: string[] = [];
  const prices: number[] = [];

  for (const result of [rss, ddgEbay, ddgAuction, web]) {
    if (result.status !== "fulfilled") continue;
    if ("snippet" in result.value && result.value.snippet) snippets.push(result.value.snippet);
    if ("text" in result.value && result.value.text) snippets.push(result.value.text);
    prices.push(...result.value.prices);
  }

  const fromWeb = web.status === "fulfilled" ? parsePricingJson(web.value.text) : {};
  if (fromWeb.estimated_market_value) {
    return finalize(fromWeb, prices, "Referenced public marketplace listings.");
  }

  const fromSnippets = await priceFromSnippets(apiKey, facts, snippets.join("\n\n"), prices);
  return finalize(
    fromSnippets,
    prices,
    snippets.length ? "Priced from eBay/search listing references." : "Few public comps found; kept conservative.",
  );
}
