import { NextResponse } from "next/server";
import { resolveEmailLogo } from "@/lib/emailService";

export const dynamic = "force-dynamic";

export async function GET() {
  const logo = await resolveEmailLogo();
  if (!logo) {
    return new NextResponse("Logo not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(logo.buffer), {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
