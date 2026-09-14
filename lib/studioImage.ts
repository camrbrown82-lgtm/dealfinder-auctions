export type StudioFacts = {
  title: string;
  objectType: string;
  materials: string[];
  condition: string;
  itemDetails?: string;
  listingGrade?: string;
  displaySetting?: string;
  photoBrief?: string;
};

export type StudioResult = {
  url: string | null;
  error: string | null;
  id?: string | null;
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

function catalogScene(facts: StudioFacts) {
  const hay = `${facts.objectType} ${facts.title} ${facts.displaySetting ?? ""}`.toLowerCase();
  if (/lamp|sconce|lantern|light fixture/.test(hay)) {
    return "standing on a stained wooden side table against a warm plaster wall, lamp shade fully visible";
  }
  if (/chair|stool|bench/.test(hay)) {
    return "in a simple interior corner on a hardwood floor with a plain wall behind";
  }
  if (/vinyl|record|album|lp\b/.test(hay)) {
    return "upright on a mid-century record shelf with a hint of living-room depth";
  }
  if (/guitar|ukulele|violin|instrument/.test(hay)) {
    return "resting on a wood bench with a softly blurred studio wall";
  }
  if (/controller|gamepad|console|joystick/.test(hay)) {
    return "on a dark media console with a softly blurred living room behind it";
  }
  if (/jewelry|ring|necklace|watch|bracelet/.test(hay)) {
    return "on a linen jewelry tray on a small vanity table";
  }
  if (/mug|cup|bowl|plate|vase|ceramic|glass/.test(hay)) {
    return "on a rustic wood table with a simple kitchen wall behind";
  }
  if (/book|magazine/.test(hay)) {
    return "stacked on a walnut side table";
  }
  if (/toy|figure|doll/.test(hay)) {
    return "on a painted wood toy shelf";
  }
  const requested = facts.displaySetting?.trim() ?? "";
  if (requested && !/sweep|paper|blank|seamless|cream/i.test(requested)) return requested;
  return "on a simple furniture surface that matches how this object is used, with a shallow-depth interior background — not a blank paper sweep";
}

function studioPrompt(facts: StudioFacts) {
  const setting = catalogScene(facts);
  const materials = facts.materials.length ? `Keep these materials unchanged: ${facts.materials.join(", ")}.` : "";
  const condition = facts.condition ? `Keep this exact wear and condition: ${facts.condition}.` : "";
  const grade = facts.listingGrade ? `Listing grade is ${facts.listingGrade}.` : "";
  const notes = facts.itemDetails ? `Honor these physical notes (size/defects/extras): ${facts.itemDetails}.` : "";
  return [
    "Edit the submitted photograph. The lot in the output MUST be the same physical object as in the input — same silhouette, colors, labels, scratches, and proportions.",
    "Do not invent, swap, or 'improve' the item into a different model or lookalike.",
    `Place that exact object into this catalog scene: ${setting}.`,
    "Build a real environment (table, shelf, or surface plus a tasteful room behind). Do not use a blank paper sweep or empty studio cyc.",
    "Soft even catalog lighting. Center the object. Full item in frame. Supporting furniture is required; keep extra props minimal and behind/under the lot.",
    "No people, no hands, no text, no watermark, no logo.",
    materials,
    condition,
    grade,
    notes,
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
    return {
      url,
      error: url ? null : openaiError(json) || "Image edit returned no picture.",
      id: typeof json.id === "string" ? json.id : null,
    };
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
  return {
    url,
    error: url ? null : openaiError(secondJson),
    id: typeof secondJson.id === "string" ? secondJson.id : null,
  };
}

function openaiError(json: Record<string, unknown>) {
  const err = json.error as { message?: string } | string | undefined;
  if (typeof err === "string") return err;
  return err?.message ?? null;
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
  const edited = await editFromReferences(apiKey, prompt, sourceUrls);
  if (!edited.url) {
    return { url: null, error: edited.error || "Could not restyle the submitted photo." };
  }
  return { url: await asPersistable(edited.url), error: null, id: edited.id ?? null };
}
