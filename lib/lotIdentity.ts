const STOP = new Set(
  "the a an and or for with from wireless wired game gamepad controller pad remote item lot photo".split(" "),
);

export function normalizeMarking(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isSerialLike(value: string) {
  const text = normalizeMarking(value);
  const compact = text.replace(/[\s\-]/g, "");
  if (/[A-Z]{2,5}-[A-Z0-9]{3,}/i.test(text)) return false;
  if (/^(s\/?n|serial|barcode|upc|ean)\b/i.test(text)) return true;
  if (/^[A-Z0-9]{10,}$/i.test(compact) && !/[a-z]/i.test(compact.slice(0, 3))) return true;
  if (/^\d{8,}$/.test(compact)) return true;
  return false;
}

const LABEL_MODELS: Array<{ re: RegExp; model: string }> = [
  { re: /CFI-ZCT1[A-Z0-9]*/i, model: "DualSense CFI-ZCT1" },
  { re: /CUH-ZCT2[A-Z0-9]*/i, model: "DualShock 4 CUH-ZCT2" },
  { re: /CUH-ZCT1[A-Z0-9]*/i, model: "DualShock 4 CUH-ZCT1" },
  { re: /CECHZC2[A-Z0-9]*/i, model: "DualShock 3 CECHZC2" },
];

export function modelFromLabels(visibleText: string[]) {
  const hay = visibleText.join(" ");
  for (const rule of LABEL_MODELS) {
    const match = hay.match(rule.re);
    if (match?.[0]) return `${rule.model.replace(/\s[A-Z0-9-]+$/i, "")} ${match[0].toUpperCase()}`.replace(/\s+/g, " ").trim();
  }
  const code = hay.match(/\b[A-Z]{2,5}-[A-Z0-9]{3,10}\b/i);
  return code?.[0] ? code[0].toUpperCase() : "";
}

export function resolveModel(claimed: string, visibleText: string[]) {
  return modelFromLabels(visibleText) || confirmedModel(claimed, visibleText);
}

export function identityMarkings(visibleText: string[]) {
  return visibleText
    .map(normalizeMarking)
    .filter(Boolean)
    .filter((text) => !isSerialLike(text));
}

export function confirmedModel(claimed: string, visibleText: string[]) {
  const model = normalizeMarking(claimed);
  if (!model) return "";
  const hay = identityMarkings(visibleText).join(" ").toLowerCase();
  const hayCompact = hay.replace(/[^a-z0-9]+/g, "");
  const tokens = model
    .toLowerCase()
    .split(/[\s/_-]+/)
    .map((token) => token.replace(/[^a-z0-9]+/g, ""))
    .filter((token) => token.length >= 2 && !STOP.has(token));
  if (tokens.length === 0) {
    return hay.includes(model.toLowerCase()) ? model : "";
  }
  const distinctive = tokens.filter((token) => !/^(controller|gamepad|wireless|edition)$/.test(token));
  const needed = distinctive.length ? distinctive : tokens;
  const ok = needed.every((token) => hay.includes(token) || hayCompact.includes(token));
  return ok ? model : "";
}

export function catalogTitle(parts: { maker?: string; model?: string; objectType?: string; color?: string }) {
  const maker = normalizeMarking(parts.maker ?? "");
  const model = normalizeMarking(parts.model ?? "");
  const objectType = normalizeMarking(parts.objectType ?? "");
  const color = normalizeMarking(parts.color ?? "");
  const bits: string[] = [];
  if (maker) bits.push(maker);
  if (model && !bits.join(" ").toLowerCase().includes(model.toLowerCase())) bits.push(model);
  if (objectType && !bits.join(" ").toLowerCase().includes(objectType.toLowerCase())) bits.push(objectType);
  if (color && !bits.join(" ").toLowerCase().includes(color.toLowerCase())) bits.push(color);
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

export function compsSearchQuery(facts: {
  maker?: string;
  model?: string;
  objectType?: string;
  visibleText?: string[];
}) {
  const markings = identityMarkings(facts.visibleText ?? []).slice(0, 4);
  const bits = [facts.maker, facts.model, facts.objectType, ...markings]
    .map((part) => normalizeMarking(part ?? ""))
    .filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const bit of bits) {
    const key = bit.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(bit);
  }
  return unique.join(" ").slice(0, 140);
}
