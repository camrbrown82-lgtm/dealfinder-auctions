import { NextRequest, NextResponse } from "next/server";
import { persistPublicImageUrls } from "@/lib/consignmentStorage";
import { generateStudioListingImage } from "@/lib/studioImage";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const maxDuration = 120;

async function readStudioBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      imageUrls?: unknown;
      title?: string;
      objectType?: string;
      materials?: unknown;
      condition?: string;
      displaySetting?: string;
      photoBrief?: string;
    };
    return {
      imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.map(String).filter(Boolean) : [],
      title: body.title,
      objectType: body.objectType,
      materials: Array.isArray(body.materials) ? body.materials.map(String) : [],
      condition: body.condition,
      displaySetting: body.displaySetting,
      photoBrief: body.photoBrief,
    };
  }

  const form = await request.formData();
  const fromFields = form.getAll("imageUrls").map(String).filter(Boolean);
  const files = form
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const fromFiles = await Promise.all(
    files.slice(0, 4).map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mime = file.type || "image/jpeg";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    }),
  );

  return {
    imageUrls: [...fromFields, ...fromFiles].slice(0, 4),
    title: String(form.get("title") ?? ""),
    objectType: String(form.get("objectType") ?? ""),
    materials: form.getAll("materials").map(String).filter(Boolean),
    condition: String(form.get("condition") ?? ""),
    displaySetting: String(form.get("displaySetting") ?? ""),
    photoBrief: String(form.get("photoBrief") ?? ""),
  };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set in .env.local" }, { status: 500 });
  }

  const body = await readStudioBody(request);
  const imageUrls = body.imageUrls;
  if (imageUrls.length === 0) {
    return NextResponse.json({ error: "Warehouse photos are required for the listing shot." }, { status: 400 });
  }

  try {
    const result = await generateStudioListingImage(apiKey, imageUrls, {
      title: body.title?.trim() || "Auction lot",
      objectType: body.objectType?.trim() || "",
      materials: Array.isArray(body.materials) ? body.materials.map(String) : [],
      condition: body.condition?.trim() || "",
      displaySetting: body.displaySetting?.trim() || "",
      photoBrief: body.photoBrief?.trim() || "",
    });
    if (!result.url) {
      return NextResponse.json(
        { error: result.error || "Could not create a listing photo.", studio_image_url: null },
        { status: 502 },
      );
    }
    let studioImageUrl = result.url;
    const supabase = getSupabaseAdmin();
    if (isSupabaseConfigured && supabase) {
      const saved = await persistPublicImageUrls(supabase, [studioImageUrl]);
      if (saved[0]) studioImageUrl = saved[0];
    }
    return NextResponse.json({
      studio_image_url: studioImageUrl,
      ai: result.id ? { ids: [result.id], features: ["studio"] } : { ids: [], features: ["studio"] },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Listing photo failed.", studio_image_url: null },
      { status: 502 },
    );
  }
}
