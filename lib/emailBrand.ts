import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export {
  EMAIL_LOGO_CID,
  buildEmailHtml,
  buildSimpleEmailHtml,
  escapeHtml,
  htmlToText,
  logoImgTag,
  looksLikeHtml,
} from "@/lib/emailHtml";

export function parseDataUrl(dataUrl: string) {
  const match = dataUrl.trim().match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { contentType: match[1], buffer: Buffer.from(match[2], "base64") };
}

const LOGO_FILES = [
  { file: "email-logo.png", contentType: "image/png" },
  { file: "email-logo.jpg", contentType: "image/jpeg" },
  { file: "logo.png", contentType: "image/png" },
  { file: "logo.jpg", contentType: "image/jpeg" },
  { file: "logo.webp", contentType: "image/webp" },
];

export function readSiteLogoFile() {
  const publicDir = join(process.cwd(), "public");
  for (const item of LOGO_FILES) {
    const path = join(publicDir, item.file);
    if (existsSync(path)) {
      return {
        buffer: readFileSync(path),
        filename: item.file,
        contentType: item.contentType,
      };
    }
  }
  return null;
}

export function logoFromDataUrl(dataUrl: string) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const ext = parsed.contentType.includes("png")
    ? "png"
    : parsed.contentType.includes("jpeg") || parsed.contentType.includes("jpg")
      ? "jpg"
      : parsed.contentType.includes("gif")
        ? "gif"
        : parsed.contentType.includes("webp")
          ? "webp"
          : "png";
  return {
    buffer: parsed.buffer,
    filename: `email-logo.${ext}`,
    contentType: parsed.contentType,
  };
}
