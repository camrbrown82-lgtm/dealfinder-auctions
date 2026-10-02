import type { SupabaseClient } from "@supabase/supabase-js";

export const FLOOR_CLIPS_BUCKET = "floor-clips";

export type FloorClip = {
  id: string;
  title: string;
  storagePath: string;
  publicUrl: string;
  createdAt: string;
};

let bucketReady = false;

export async function ensureFloorClipBucket(supabase: SupabaseClient) {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(FLOOR_CLIPS_BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(FLOOR_CLIPS_BUCKET, {
      public: true,
      fileSizeLimit: 100 * 1024 * 1024,
    });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(error.message);
    }
  }
  bucketReady = true;
}

export async function listFloorClips(supabase: SupabaseClient): Promise<FloorClip[]> {
  const { data, error } = await supabase
    .from("floor_clips")
    .select("id, title, storage_path, public_url, created_at")
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? "New item"),
    storagePath: String(row.storage_path ?? ""),
    publicUrl: String(row.public_url ?? ""),
    createdAt: String(row.created_at ?? ""),
  }));
}

export function floorClipCaption(title: string) {
  return `New at DealFinder Auctions: ${title}. See it at https://www.dealfinderauctions.com/media`;
}
