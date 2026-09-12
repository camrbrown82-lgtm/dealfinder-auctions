export async function requestStudioImage(payload: {
  imageUrls: string[];
  title: string;
  objectType?: string;
  materials?: string[];
  condition?: string;
  displaySetting?: string;
}) {
  const response = await fetch("/api/ai-intake/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await response.json()) as { studio_image_url?: string; error?: string };
  if (!response.ok || !json.studio_image_url) {
    throw new Error(json.error || "Could not create a listing photo.");
  }
  return json.studio_image_url;
}
