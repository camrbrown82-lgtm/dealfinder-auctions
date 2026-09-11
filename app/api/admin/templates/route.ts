import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { adminSnapshot, saveTemplate } from "@/lib/store";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const snap = await adminSnapshot();
  return NextResponse.json({ templates: snap.templates });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const template = await saveTemplate({
      id: body.id,
      name: String(body.name || "Template"),
      subject: String(body.subject || ""),
      body: String(body.body || ""),
    });
    return NextResponse.json({ template });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save template." }, { status: 400 });
  }
}
