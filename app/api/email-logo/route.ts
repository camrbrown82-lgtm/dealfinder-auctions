import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { resolveEmailLogo } from "@/lib/emailService";

export const dynamic = "force-dynamic";

export async function GET() {
  const pngPath = join(process.cwd(), "public", "email-logo.png");
  if (existsSync(pngPath)) {
    return new NextResponse(new Uint8Array(readFileSync(pngPath)), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }
  const logo = await resolveEmailLogo();
  if (!logo) {
    return new NextResponse("Logo not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(logo.buffer), {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
