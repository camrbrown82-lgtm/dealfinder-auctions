import { NextResponse } from "next/server";
import { listFloorClips } from "@/lib/floorClips";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ clips: [] });
  }
  try {
    const clips = await listFloorClips(supabase);
    return NextResponse.json({ clips });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load clips.";
    const missing = /floor_clips|schema cache/i.test(message);
    return NextResponse.json({
      clips: [],
      error: missing ? "Floor clip table is not on Supabase yet." : message,
    });
  }
}
