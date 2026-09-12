export type StudioFacts = {
  title: string;
  objectType: string;
  materials: string[];
  condition: string;
  displaySetting?: string;
};

export type StudioResult = {
  url: string | null;
  error: string | null;
};

function extFromMime(mime: string) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

async function loadImageBlob(url: string): Promise<{ blob: Blob; name: string } | null> {
  try {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!match) return null;
      const mime = match[1] || "image/jpeg";
      const buffer = Buffer.from(match[2], "base64");
      if (!buffer.length) return null;
      return {
        blob: new Blob([new Uint8Array(buffer)], { type: mime }),
        name: `warehouse.${extFromMime(mime)}`,
      };
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return null;
    const mime = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;
    return {
      blob: new Blob([new Uint8Array(buffer)], { type: mime.split(";")[0] }),
      name: `warehouse.${extFromMime(mime)}`,
    };
  } catch {
    return null;
  }
}

function studioPrompt(facts: StudioFacts) {
  const setting =
    facts.displaySetting?.trim() ||
    (facts.objectType
      ? `a tasteful set that suits a ${facts.objectType}`
      : "a clean professional product set");
  const materials = facts.materials.length ? `Materials: ${facts.materials.join(", ")}.` : "";
  const condition = facts.condition ? `Keep visible condition: ${facts.condition}.` : "";
  return [
    `Create one square auction-catalog hero photo of this exact item: ${facts.title || facts.objectType || "consigned object"}.`,
    "Use the warehouse reference photos as the source of truth. Keep the object's shape, colors, labels, markings, and wear identical. Do not invent a different item, brand, or edition.",
    `Replace the warehouse, table, hands, and clutter with ${setting}.`,
    "Soft even catalog lighting, centered, full item in frame, no extra props, no people, no text, no watermark, no logo.",
    materials,
    condition,
  ]
    .filter(Boolean)
    .join(" ");
}

function dataUrlFromResponse(json: Record<string, unknown>): string | null {
  const data = json.data as Array<Record<string, unknown>> | undefined;
  const first = data?.[0];
  if (!first) return null;
  if (typeof first.b64_json === "string" && first.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }
  if (typeof first.url === "string" && first.url) return first.url;
  return null;
}

async function editFromReferences(apiKey: string, prompt: string, sourceUrls: string[]) {
  const refs: Array<{ blob: Blob; name: string }> = [];
  for (const url of sourceUrls.slice(0, 4)) {
    const loaded = await loadImageBlob(url);
    if (loaded) refs.push(loaded);
  }
  if (refs.length === 0) return { url: null, error: "Could not read warehouse photos for the studio shot." };

  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("prompt", prompt);
  form.append("size", "1024x1024");
  for (const ref of refs) {
    form.append("image[]", ref.blob, ref.name);
  }

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (response.ok) {
    const url = dataUrlFromResponse(json);
    return { url, error: url ? null : openaiError(json) || "Image edit returned no picture." };
  }

  const retry = new FormData();
  retry.append("model", "gpt-image-1");
  retry.append("prompt", prompt);
  retry.append("size", "1024x1024");
  retry.append("image", refs[0].blob, refs[0].name);
  const second = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { authorization: `Bearer ${apiKey}` },
    body: retry,
  });
  const secondJson = (await second.json()) as Record<string, unknown>;
  if (!second.ok) {
    return { url: null, error: openaiError(json) || openaiError(secondJson) };
  }
  const url = dataUrlFromResponse(secondJson);
  return { url, error: url ? null : openaiError(secondJson) };
}

function openaiError(json: Record<string, unknown>) {
  const err = json.error as { message?: string } | string | undefined;
  if (typeof err === "string") return err;
  return err?.message ?? null;
}

async function generateFromPrompt(apiKey: string, prompt: string): Promise<StudioResult> {
  const attempts: Array<Record<string, unknown>> = [
    { model: "dall-e-3", size: "1024x1024", n: 1, response_format: "b64_json", quality: "standard" },
    { model: "gpt-image-1", size: "1024x1024" },
  ];
  let lastError: string | null = null;
  for (const body of attempts) {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      lastError = openaiError(json);
      continue;
    }
    const url = dataUrlFromResponse(json);
    if (url) return { url, error: null };
    lastError = openaiError(json) || "Image generation returned no picture.";
  }
  return { url: null, error: lastError };
}

async function asPersistable(url: string) {
  if (url.startsWith("data:")) return url;
  const loaded = await loadImageBlob(url);
  if (!loaded) return url;
  const buffer = Buffer.from(await loaded.blob.arrayBuffer());
  const mime = loaded.blob.type || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function generateStudioListingImage(
  apiKey: string,
  sourceUrls: string[],
  facts: StudioFacts,
): Promise<StudioResult> {
  const prompt = studioPrompt(facts);
  const [edited, generated] = await Promise.all([
    editFromReferences(apiKey, prompt, sourceUrls),
    generateFromPrompt(apiKey, prompt),
  ]);
  const picked = edited.url || generated.url;
  if (!picked) {
    return { url: null, error: edited.error || generated.error || "Could not create a listing photo." };
  }
  return { url: await asPersistable(picked), error: null };
}
