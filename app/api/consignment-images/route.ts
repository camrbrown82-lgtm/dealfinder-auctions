import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  uniqueConsignmentFileName,
  uploadConsignmentImage,
} from "@/lib/consignmentStorage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured.", urls: [] },
      { status: 400 },
    );
  }

  const form = await request.formData();
  const files = form
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
    .slice(0, 4);

  if (files.length === 0) {
    return NextResponse.json({ error: "No images uploaded.", urls: [] }, { status: 400 });
  }

  const urls: string[] = [];
  for (const file of files) {
    try {
      const fileName = uniqueConsignmentFileName(file);
      const { publicUrl } = await uploadConsignmentImage(supabase, file, fileName);
      urls.push(publicUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      return NextResponse.json(
        {
          error: `${message} Confirm the public bucket consignment-images exists (see supabase/migrations/20260903000009_consignment_images.sql).`,
          urls,
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: true, urls, bucket: "consignment-images" });
}
