import { NextRequest, NextResponse } from "next/server";
import { persistPublicImageUrls } from "@/lib/consignmentStorage";
import { processListingPhotos } from "@/lib/processListingPhotos";
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
      itemDetails?: string;
      listingGrade?: string;
      displaySetting?: string;
      photoBrief?: string;
    };
    return {
      imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.map(String).filter(Boolean) : [],
      title: body.title,
      objectType: body.objectType,
      materials: Array.isArray(body.materials) ? body.materials.map(String) : [],
      condition: body.condition,
      itemDetails: String(body.itemDetails ?? ""),
      listingGrade: String(body.listingGrade ?? ""),
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
    itemDetails: String(form.get("itemDetails") ?? ""),
    listingGrade: String(form.get("listingGrade") ?? ""),
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        send({ phase: "selecting" });
        let heroUrl = imageUrls[0];
        let heroIndex = 0;
        try {
          const plan = await processListingPhotos(apiKey, imageUrls.slice(0, 4));
          if (plan.heroUrl) {
            heroUrl = plan.heroUrl;
            heroIndex = plan.heroIndex;
          }
        } catch {
          heroUrl = imageUrls[0];
        }

        send({ phase: "processing" });
        const result = await generateStudioListingImage(apiKey, [heroUrl], {
          title: body.title?.trim() || "Auction lot",
          objectType: body.objectType?.trim() || "",
          materials: Array.isArray(body.materials) ? body.materials.map(String) : [],
          condition: body.condition?.trim() || "",
          itemDetails: body.itemDetails?.trim() || "",
          listingGrade: body.listingGrade?.trim() || "",
          displaySetting: body.displaySetting?.trim() || "",
          photoBrief: body.photoBrief?.trim() || "",
        });
        if (!result.url) {
          throw new Error(result.error || "Could not create a listing photo.");
        }
        let studioImageUrl = result.url;
        const supabase = getSupabaseAdmin();
        if (isSupabaseConfigured && supabase) {
          const saved = await persistPublicImageUrls(supabase, [studioImageUrl]);
          if (saved[0]) studioImageUrl = saved[0];
        }
        send({
          phase: "done",
          studio_image_url: studioImageUrl,
          hero_index: heroIndex,
          gallery_count: Math.max(0, imageUrls.slice(0, 4).length - 1),
          ai: result.id ? { ids: [result.id], features: ["studio"] } : { ids: [], features: ["studio"] },
        });
      } catch (err) {
        send({
          phase: "error",
          error: err instanceof Error ? err.message : "Listing photo failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
