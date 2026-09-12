import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueImageUrls } from "@/lib/utils";

export const CONSIGNMENT_IMAGES_BUCKET = "consignment-images";

let bucketReady = false;

export function consignmentImagePath(fileName: string) {
  return `items/${fileName}`;
}

export function uniqueConsignmentFileName(file: { name?: string; type?: string }) {
  const fromName = file.name?.split(".").pop()?.toLowerCase() ?? "";
  const fromType = file.type?.split("/")[1]?.toLowerCase() ?? "";
  const ext = (fromName || fromType || "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
  return `${crypto.randomUUID()}.${ext}`;
}

export async function ensureConsignmentBucket(supabase: SupabaseClient) {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(CONSIGNMENT_IMAGES_BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(CONSIGNMENT_IMAGES_BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
    });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(error.message);
    }
  }
  bucketReady = true;
}

export async function uploadConsignmentImage(
  supabase: SupabaseClient,
  file: File | Blob | Buffer,
  fileName: string,
  contentType?: string,
) {
  await ensureConsignmentBucket(supabase);
  const path = consignmentImagePath(fileName);
  const { data, error } = await supabase.storage
    .from(CONSIGNMENT_IMAGES_BUCKET)
    .upload(path, file, contentType ? { contentType, upsert: false } : undefined);

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CONSIGNMENT_IMAGES_BUCKET).getPublicUrl(path);

  return { path: data.path, publicUrl };
}

export async function persistPublicImageUrls(supabase: SupabaseClient, urls: string[]) {
  const out: string[] = [];
  for (const raw of urls.slice(0, 8)) {
    const url = raw.trim();
    if (!url) continue;
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!match) throw new Error("Invalid photo data.");
      const mime = match[1] || "image/jpeg";
      const buffer = Buffer.from(match[2], "base64");
      if (!buffer.length) throw new Error("Empty photo.");
      const { publicUrl } = await uploadConsignmentImage(
        supabase,
        buffer,
        uniqueConsignmentFileName({ type: mime, name: `lot.${mime.split("/")[1] || "jpg"}` }),
        mime,
      );
      out.push(publicUrl);
      continue;
    }
    if (/^https?:\/\//i.test(url)) out.push(url);
  }
  return uniqueImageUrls(out).slice(0, 8);
}
