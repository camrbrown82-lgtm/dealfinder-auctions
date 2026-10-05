import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { deleteFloorClip, ensureFloorClipBucket, FLOOR_CLIPS_BUCKET, listFloorClips } from "@/lib/floorClips";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  }
  try {
    const clips = await listFloorClips(supabase);
    return NextResponse.json({ clips });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load clips.";
    return NextResponse.json({ error: message, clips: [] }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  }
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "Missing video." }, { status: 400 });
  try {
    await deleteFloorClip(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete that video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  }
  const body = (await request.json()) as {
    action?: string;
    title?: string;
    path?: string;
    contentType?: string;
  };
  const title = String(body.title ?? "").trim() || "New item";

  try {
    await ensureFloorClipBucket(supabase);
    if (body.action === "prepare") {
      const ext = body.contentType?.includes("mp4") ? "mp4" : "webm";
      const path = `items/${crypto.randomUUID()}.${ext}`;
      const signed = await supabase.storage.from(FLOOR_CLIPS_BUCKET).createSignedUploadUrl(path);
      if (signed.error || !signed.data) {
        return NextResponse.json({ error: signed.error?.message || "Could not start the upload." }, { status: 400 });
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from(FLOOR_CLIPS_BUCKET).getPublicUrl(path);
      return NextResponse.json({
        path: signed.data.path,
        token: signed.data.token,
        publicUrl,
      });
    }

    if (body.action === "publish") {
      const path = String(body.path ?? "").trim();
      if (!path) return NextResponse.json({ error: "Missing clip path." }, { status: 400 });
      const {
        data: { publicUrl },
      } = supabase.storage.from(FLOOR_CLIPS_BUCKET).getPublicUrl(path);
      const { data, error } = await supabase
        .from("floor_clips")
        .insert({ title, storage_path: path, public_url: publicUrl })
        .select("id, title, storage_path, public_url, created_at")
        .single();
      if (error) {
        const missing = /floor_clips|schema cache/i.test(error.message);
        return NextResponse.json(
          {
            error: missing
              ? "Run supabase/migrations/20261001000031_floor_clips.sql in the Supabase SQL editor, then record again."
              : error.message,
          },
          { status: 400 },
        );
      }
      return NextResponse.json({
        clip: {
          id: data.id,
          title: data.title,
          storagePath: data.storage_path,
          publicUrl: data.public_url,
          createdAt: data.created_at,
        },
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the clip.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
