import { NextResponse } from "next/server";
import { uniqueConsignorNames } from "@/lib/consignors";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const [queue, lots] = await Promise.all([
      supabase.from("consignments").select("consignor_name"),
      supabase.from("lots").select("consignor_name"),
    ]);
    const names = uniqueConsignorNames(
      (queue.data ?? []).map((row) => String(row.consignor_name ?? "")),
      (lots.data ?? []).map((row) => String(row.consignor_name ?? "")),
    );
    return NextResponse.json({ consignors: names });
  }

  const demo = getAdminDemo();
  return NextResponse.json({
    consignors: uniqueConsignorNames(demo.queue, demo.inventory),
  });
}
