import { NextRequest, NextResponse } from "next/server";
import { persistPublicImageUrls } from "@/lib/consignmentStorage";
import { generateStudioListingImage } from "@/lib/studioImage";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set in .env.local" }, { status: 500 });
  }

  const body = (await request.json()) as {
    imageUrls?: string[];
    title?: string;
    objectType?: string;
    materials?: string[];
    condition?: string;
    displaySetting?: string;
  };
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter(Boolean) : [];
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
    return NextResponse.json({ studio_image_url: studioImageUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Listing photo failed.", studio_image_url: null },
      { status: 502 },
    );
  }
}
