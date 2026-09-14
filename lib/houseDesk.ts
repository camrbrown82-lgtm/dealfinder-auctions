import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatLotNumber,
  nextFreeLotNumber,
  parseLotSeq,
  suggestLotNumber,
} from "@/lib/catalogNumbers";

export const DEFAULT_HOUSE_STARTING_BID = 5;

export type HouseDeskSettings = {
  defaultStartingBid: number;
  nextLotNumber: string;
};

export function normalizeHouseSettings(
  input: Partial<HouseDeskSettings> | null | undefined,
  existingLots: Array<{ lotNumber?: string | null }>,
): HouseDeskSettings {
  const bid = Number(input?.defaultStartingBid);
  const next = input?.nextLotNumber?.trim();
  const parsed = parseLotSeq(next);
  return {
    defaultStartingBid: bid > 0 ? bid : DEFAULT_HOUSE_STARTING_BID,
    nextLotNumber: parsed != null ? formatLotNumber(parsed) : suggestLotNumber(existingLots),
  };
}

export function allocateLotNumber(
  requested: string | undefined,
  settings: HouseDeskSettings,
  existingLots: Array<{ lotNumber?: string | null }>,
) {
  const start =
    parseLotSeq(requested) ?? parseLotSeq(settings.nextLotNumber) ?? parseLotSeq(suggestLotNumber(existingLots)) ?? 1;
  return nextFreeLotNumber(start, existingLots);
}

export function settingsAfterUsingLot(
  settings: HouseDeskSettings,
  usedLotNumber: string,
  existingLots: Array<{ lotNumber?: string | null }>,
): HouseDeskSettings {
  const used = parseLotSeq(usedLotNumber) ?? parseLotSeq(settings.nextLotNumber) ?? 1;
  return {
    ...settings,
    nextLotNumber: nextFreeLotNumber(used + 1, existingLots),
  };
}

function missingTable(error: { message?: string } | null) {
  return Boolean(
    error?.message &&
      /house_desk_settings|could not find the table|schema cache/i.test(error.message),
  );
}

export async function readHouseDeskSettings(
  supabase: SupabaseClient,
  existingLots: Array<{ lotNumber?: string | null }>,
): Promise<HouseDeskSettings> {
  const fallback = normalizeHouseSettings(null, existingLots);
  const { data, error } = await supabase
    .from("house_desk_settings")
    .select("default_starting_bid, next_lot_seq")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) {
    if (error && !missingTable(error)) {
      return fallback;
    }
    return fallback;
  }
  return normalizeHouseSettings(
    {
      defaultStartingBid: Number(data.default_starting_bid),
      nextLotNumber: formatLotNumber(Number(data.next_lot_seq) || 1),
    },
    existingLots,
  );
}

export async function writeHouseDeskSettings(
  supabase: SupabaseClient,
  settings: HouseDeskSettings,
) {
  const seq = parseLotSeq(settings.nextLotNumber) ?? 1;
  const { error } = await supabase.from("house_desk_settings").upsert(
    {
      id: 1,
      default_starting_bid: settings.defaultStartingBid,
      next_lot_seq: seq,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error && !missingTable(error)) return error;
  return null;
}
