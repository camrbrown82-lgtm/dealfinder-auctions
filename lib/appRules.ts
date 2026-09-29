import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export type AppRule = {
  category: string;
  title: string;
  body: string;
  sortOrder: number;
};

const EMPTY_RULES =
  "Official platform rules could not be loaded. Do not guess fee structures, consignment clauses, auction types, the $50 card hold, fee waivers, or cash pick-up. Say the rule book is unavailable.";

export function formatAppRules(rules: AppRule[]) {
  if (!rules.length) return EMPTY_RULES;
  return rules
    .map((rule) => `[${rule.category}] ${rule.title}\n${rule.body.trim()}`)
    .join("\n\n");
}

export async function fetchAppRules(): Promise<AppRule[]> {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("app_rules")
    .select("category, title, body, sort_order")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    category: String(row.category ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
  }));
}
