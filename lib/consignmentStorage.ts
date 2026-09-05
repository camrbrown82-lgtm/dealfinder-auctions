import type { SupabaseClient } from "@supabase/supabase-js";

export const CONSIGNMENT_IMAGES_BUCKET = "consignment-images";

export function consignmentImagePath(fileName: string) {
  return `items/${fileName}`;
}

export function uniqueConsignmentFileName(file: { name?: string; type?: string }) {
  const fromName = file.name?.split(".").pop()?.toLowerCase() ?? "";
  const fromType = file.type?.split("/")[1]?.toLowerCase() ?? "";
  const ext = (fromName || fromType || "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
  return `${crypto.randomUUID()}.${ext}`;
}

export async function uploadConsignmentImage(
  supabase: SupabaseClient,
  file: File | Blob,
  fileName: string,
) {
  const path = consignmentImagePath(fileName);
  const { data, error } = await supabase.storage
    .from(CONSIGNMENT_IMAGES_BUCKET)
    .upload(path, file);

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CONSIGNMENT_IMAGES_BUCKET).getPublicUrl(path);

  return { path: data.path, publicUrl };
}
