import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";

export function cronAuthorized(request: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const header = request.headers.get("authorization") || "";
  if (secret) return header === `Bearer ${secret}` || isAdminSession();
  if (request.headers.get("x-vercel-cron")) return true;
  if (request.headers.get("user-agent")?.includes("vercel-cron")) return true;
  return isAdminSession();
}
