import { parseApiJson } from "@/lib/apiJson";
import { compressImageFiles } from "@/lib/compressImage";
import { parsePastedImageUrls } from "@/lib/imageUrls";

export async function filesToDataUrls(files: File[]) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }),
    ),
  );
}

export async function filesToConsignmentUrls(files: File[], options?: { fallbackDataUrl?: boolean }) {
  if (files.length === 0) return [];
  const photos = await compressImageFiles(files);

  const form = new FormData();
  for (const file of photos) {
    form.append("images", file);
  }

  const response = await fetch("/api/consignment-images", {
    method: "POST",
    body: form,
  });
  const json = await parseApiJson<{ urls?: string[]; error?: string }>(response);

  if (response.ok && json.urls?.length) {
    return json.urls;
  }

  if (options?.fallbackDataUrl) {
    return filesToDataUrls(photos);
  }

  throw new Error(json.error || "Could not upload photos.");
}

export async function collectItemImageUrls(
  files: File[],
  pasted: string,
  options?: { fallbackDataUrl?: boolean },
) {
  const fromPaste = parsePastedImageUrls(pasted);
  const fromFiles = files.length ? await filesToConsignmentUrls(files, options) : [];
  return [...fromPaste, ...fromFiles].slice(0, 4);
}

