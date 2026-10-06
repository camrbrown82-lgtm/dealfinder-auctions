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

export type CompHit = {
  title: string;
  price: number;
  kind: "sold" | "asking";
};

export type CompLookup = {
  snippet: string;
  prices: number[];
  hits: CompHit[];
};

const GENERIC = new Set(
  "the a an and or for with from wireless wired game gamepad controller pad remote item lot photo edition series new used official genuine original black white red blue green yellow pink purple gray grey silver gold brown orange clear".split(
    " ",
  ),
);

const REJECT_TITLE =
  /\b(lot of|lots of|bundle|bundles|for parts|parts only|empty box|box only|manual only|broken lot|replacement shell|shell only|buttons only|sticker only|qty \d|set of \d|x\d{1,2}\b)\b/i;

function asInt(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => (token.length >= 2 || /^\d$/.test(token)) && !GENERIC.has(token));
}

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function searchQuery(facts: CatalogFacts) {
  const maker = (facts.maker ?? "").trim();
  const model = (facts.model ?? "").trim();
  if (maker && model) return `${maker} ${model}`.slice(0, 80);
  if (model) return model.slice(0, 80);
  return (
    compsSearchQuery({
      maker: facts.maker,
      model: facts.model,
      objectType: facts.objectType,
      visibleText: facts.visibleText,
    }) || facts.title.slice(0, 80)
  );
}

function partCodes(value: string) {
  const re = /\b[A-Z]{1,6}(?:-[A-Z0-9]{2,})+\b|\b[A-Z]{2,}\d{3,}[A-Z0-9-]*\b/gi;
  const codes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const code = compact(match[0]);
    if (code.length >= 5) codes.push(code);
  }
  return codes;
}

function hasVersion(title: string, model: string) {
  const versions = model.match(/\b\d{1,2}\b/g) ?? [];
  if (!versions.length) return true;
  const hay = title.toLowerCase();
  return versions.every(
    (version) => new RegExp(`(^|[^0-9])${version}([^0-9]|$)`).test(hay) || hay.includes(`ps${version}`),
  );
}

const EDITIONS = ["pro", "max", "plus", "mini", "lite", "ultra", "edge", "oled", "slim"];

function extraEdition(title: string, model: string) {
  const modelHay = compact(model);
  return EDITIONS.some((edition) => tokens(title).includes(edition) && !modelHay.includes(edition));
}

function matchesLot(title: string, facts: CatalogFacts) {
  if (!title.trim() || REJECT_TITLE.test(title) || extraEdition(title, facts.model ?? "")) return false;
  const hay = compact(title);
  const model = facts.model ?? "";
  const codes = partCodes(`${facts.maker ?? ""} ${model}`);
  if (codes.length && !codes.some((code) => hay.includes(code))) return false;
  if (!hasVersion(title, model)) return false;
  const modelTokens = tokens(model).filter((token) => token.length >= 3 && !/^\d$/.test(token));
  if (modelTokens.length) return modelTokens.every((token) => hay.includes(token));
  const makerToken = tokens(facts.maker ?? "").find((token) => token.length >= 3);
  const objectToken = tokens(facts.objectType).find((token) => token.length >= 4);
  const needed = [makerToken, objectToken].filter((token): token is string => Boolean(token));
  if (!needed.length) return true;
  return needed.every((token) => hay.includes(token));
}

function extractItemPrice(text: string) {
  const cleaned = text
    .replace(/shipping[^.]{0,40}\$\s?\d[\d,]*(?:\.\d{2})?/gi, " ")
    .replace(/postage[^.]{0,40}\$\s?\d[\d,]*(?:\.\d{2})?/gi, " ");
  const amounts: number[] = [];
  const re = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned))) {
    const n = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 3 && n <= 25000) amounts.push(Math.round(n));
  }
  if (!amounts.length) return 0;
  return amounts[amounts.length - 1];
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function tightPrices(hits: CompHit[]) {
  const kept = [...hits].sort((a, b) => a.price - b.price);
  while (kept.length >= 3 && kept[kept.length - 1].price > kept[0].price * 2.5) {
    const mid = median(kept.map((hit) => hit.price));
    const lowGap = mid - kept[0].price;
    const highGap = kept[kept.length - 1].price - mid;
    if (highGap >= lowGap) kept.pop();
    else kept.shift();
  }
  return kept;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5",
    },
  });
  if (!response.ok) return "";
  const text = await response.text();
  if (!text.includes("<item")) return "";
  return text;
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
    .trim();
}

async function ebayRss(query: string, kind: "sold" | "asking"): Promise<CompHit[]> {
  const sold = kind === "sold" ? "&LH_Sold=1&LH_Complete=1&_sop=13" : "&LH_BIN=1";
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_rss=1${sold}`;
  const xml = await fetchText(url);
  if (!xml) return [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  const hits: CompHit[] = [];
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRe.exec(xml)) && hits.length < 20) {
    const item = itemMatch[1];
    const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
    const descMatch = item.match(
      /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/i,
    );
    const title = stripHtml(titleMatch?.[1] || titleMatch?.[2] || "").replace(/\s+\|\s*eBay\s*$/i, "");
    const body = stripHtml(descMatch?.[1] || descMatch?.[2] || "");
    const price = extractItemPrice(`${title} ${body}`);
    if (!title || !(price > 0)) continue;
    hits.push({ title: title.slice(0, 140), price, kind });
  }
  return hits;
}

function lookupFromHits(hits: CompHit[]): CompLookup {
  const lines = hits.map((hit) => `${hit.kind} $${hit.price} ${hit.title}`);
  return {
    hits,
    prices: hits.map((hit) => hit.price),
    snippet: lines.join("\n").slice(0, 4000),
  };
}

/** Public listing fetch. Prefer priceFromMarketComps, which searches the identified product. */
export function beginCompLookup(query: string): Promise<CompLookup> {
  const q = query.trim().slice(0, 80) || "collectible";
  return ebayRss(q, "asking")
    .then(lookupFromHits)
    .catch(() => ({ snippet: "", prices: [], hits: [] }));
}

function extractOutputText(json: { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }) {
  const parts: string[] = [];
  for (const item of json.output ?? []) {
    if (item.type !== "message") continue;
    for (const block of item.content ?? []) {
      if (block.text) parts.push(block.text);
    }
  }
  return parts.join("\n");
}

function hitsFromModelJson(raw: string): CompHit[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as {
      sold?: Array<{ title?: string; price?: number }>;
      asking?: Array<{ title?: string; price?: number }>;
    };
    const sold = (parsed.sold ?? []).map((row) => ({
      title: String(row.title ?? "").trim(),
      price: asInt(row.price, 0),
      kind: "sold" as const,
    }));
    const asking = (parsed.asking ?? []).map((row) => ({
      title: String(row.title ?? "").trim(),
      price: asInt(row.price, 0),
      kind: "asking" as const,
    }));
    return [...sold, ...asking].filter((hit) => hit.title && hit.price >= 3 && hit.price <= 25000);
  } catch {
    return [];
  }
}

async function webSoldComps(apiKey: string, facts: CatalogFacts, tool: "web_search" | "web_search_preview" = "web_search") {
  const product = [facts.maker, facts.model || facts.objectType, facts.title].filter(Boolean).join(" — ");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(28000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      tools: [{ type: tool }],
      input: `Find recent SOLD prices for this exact product. Only report a price if you can see it on a page. Do not invent prices or round from memory.

Product: ${product}
Maker: ${facts.maker || "unknown"}
Model: ${facts.model || "unknown — do not substitute a different model"}
Object: ${facts.objectType}
Condition notes: ${facts.condition || "unknown"}

Rules:
- Prefer completed eBay sales and other sold-price pages from the last 6 months, in USD.
- Reject a different model or generation, bundles, lots of more than one, parts-only, and empty boxes.
- Put current for-sale prices in asking, never in sold.
- Up to 8 sold and 4 asking.

Return JSON only:
{"sold":[{"title":"","price":0}],"asking":[{"title":"","price":0}]}`,
    }),
  });
  if (!response.ok) {
    if (tool === "web_search") {
      const detail = await response.text();
      if (/web_search/i.test(detail)) return webSoldComps(apiKey, facts, "web_search_preview");
    }
    return { hits: [] as CompHit[], id: "" };
  }
  const json = (await response.json()) as {
    id?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  return { hits: hitsFromModelJson(extractOutputText(json)), id: json.id ?? "" };
}

function money(value: number) {
  return `$${value}`;
}

function formatNote(sold: CompHit[], asking: CompHit[], market: number) {
  const lines: string[] = [];
  if (sold.length) {
    const prices = sold.map((hit) => hit.price);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    lines.push(
      `Sold median ${money(median(prices))} from ${sold.length} matching sale${sold.length === 1 ? "" : "s"} (${money(low)}–${money(high)}).`,
    );
    lines.push("Sold:");
    for (const hit of sold.slice(0, 8)) lines.push(`${money(hit.price)} — ${hit.title}`);
  } else {
    lines.push("No matching sold prices.");
  }
  if (asking.length) {
    const prices = asking.map((hit) => hit.price);
    lines.push(
      `Asking median ${money(median(prices))} from ${asking.length} current listing${asking.length === 1 ? "" : "s"}. These are not sold prices.`,
    );
    lines.push("Asking:");
    for (const hit of asking.slice(0, 4)) lines.push(`${money(hit.price)} — ${hit.title}`);
  }
  if (!sold.length && asking.length && market > 0) {
    lines.push(`No sold comps matched, so the estimate follows the asking cluster at about ${money(market)}.`);
  }
  if (!sold.length && !asking.length) {
    lines.push("No close comps. Enter the market value by hand.");
  }
  return lines.join("\n");
}

function priceCluster(sold: CompHit[], asking: CompHit[]) {
  if (sold.length) return median(sold.map((hit) => hit.price));
  if (asking.length >= 2) return median(asking.map((hit) => hit.price));
  if (asking.length === 1) return asking[0].price;
  return 0;
}

export async function priceFromMarketComps(
  apiKey: string,
  facts: CatalogFacts,
): Promise<MarketPricing> {
  const locked: CatalogFacts = {
    ...facts,
    visibleText: identityMarkings(facts.visibleText),
  };
  const query = searchQuery(locked) || locked.objectType || "collectible";
  const [soldFeed, askingFeed] = await Promise.all([
    ebayRss(query, "sold").catch(() => [] as CompHit[]),
    ebayRss(query, "asking").catch(() => [] as CompHit[]),
  ]);
  let hits = [...soldFeed, ...askingFeed].filter((hit) => matchesLot(hit.title, locked));
  const openaiIds: string[] = [];
  const soldCount = hits.filter((hit) => hit.kind === "sold").length;
  if (soldCount < 4) {
    const web = await webSoldComps(apiKey, locked).catch(() => ({ hits: [] as CompHit[], id: "" }));
    if (web.id) openaiIds.push(web.id);
    const seen = new Set(hits.map((hit) => `${hit.kind}|${hit.price}|${compact(hit.title)}`));
    for (const hit of web.hits) {
      if (!matchesLot(hit.title, locked)) continue;
      const key = `${hit.kind}|${hit.price}|${compact(hit.title)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
    }
  }
  const sold = tightPrices(hits.filter((hit) => hit.kind === "sold"));
  const asking = tightPrices(hits.filter((hit) => hit.kind === "asking"));
  const market = priceCluster(sold, asking);
  const reserve = market > 0 ? Math.round(market * 0.8) : 0;
  const start = market > 0 ? Math.max(1, Math.round(market * 0.45)) : 0;
  return {
    estimated_market_value: market,
    suggested_reserve: reserve,
    suggested_starting_bid: Math.min(start, reserve || start),
    comps_note: formatNote(sold, asking, market),
    openaiIds,
  };
}
