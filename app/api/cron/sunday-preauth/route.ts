import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { runSundayPreauthSweep, sweepIp } from "@/lib/sundayPreauth";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const header = request.headers.get("authorization") || "";
  if (secret) return header === `Bearer ${secret}` || isAdminSession();
  if (request.headers.get("x-vercel-cron")) return true;
  if (request.headers.get("user-agent")?.includes("vercel-cron")) return true;
  return isAdminSession();
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await runSundayPreauthSweep(sweepIp(request));
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
