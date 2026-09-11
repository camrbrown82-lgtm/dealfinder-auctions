import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { setEmailLogo } from "@/lib/store";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("logo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Could not save logo." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || ".png";
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const filename = `email-logo${ext}`;
  await writeFile(path.join(dir, filename), bytes);
  const url = `/uploads/${filename}?t=${Date.now()}`;
  await setEmailLogo(url);
  return NextResponse.json({ url });
}

export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  await setEmailLogo(null);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
