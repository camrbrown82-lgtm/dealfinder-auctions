import { readdirSync, readFileSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { zipStoredTextFiles } from "@/lib/xlsxWorkbook";

export const dynamic = "force-static";

export function GET() {
  const root = path.join(process.cwd(), "extension");
  const files = readdirSync(root)
    .filter((name) => !name.startsWith("."))
    .map((name) => ({
      name: `extension/${name}`,
      body: readFileSync(path.join(root, name), "utf8"),
    }));
  const zip = zipStoredTextFiles(files);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="DealFinder-Poster.zip"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
