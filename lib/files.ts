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

  const form = new FormData();
  for (const file of files.slice(0, 4)) {
    form.append("images", file);
  }

  const response = await fetch("/api/consignment-images", {
    method: "POST",
    body: form,
  });
  const json = (await response.json()) as { urls?: string[]; error?: string };

  if (response.ok && json.urls?.length) {
    return json.urls;
  }

  if (options?.fallbackDataUrl) {
    return filesToDataUrls(files.slice(0, 4));
  }

  throw new Error(json.error || "Could not upload to consignment-images.");
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

