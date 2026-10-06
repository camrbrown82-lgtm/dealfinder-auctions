import { readFileSync } from "fs";
import path from "path";
import Link from "next/link";

export const dynamic = "force-static";

function inline(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim() === "---") {
      i += 1;
      continue;
    }
    if (line.startsWith("# ")) {
      html.push(`<h1 class="font-display text-4xl text-brand-red">${inline(line.slice(2))}</h1>`);
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      html.push(`<h2 class="mt-8 font-display text-3xl text-brand-red">${inline(line.slice(3))}</h2>`);
      i += 1;
      continue;
    }
    if (line.startsWith("### ")) {
      html.push(`<h3 class="mt-6 font-display text-2xl">${inline(line.slice(4))}</h3>`);
      i += 1;
      continue;
    }
    if (line.startsWith("| ")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i]);
        i += 1;
      }
      const body = rows.filter((row) => !/^\|\s*-+/.test(row));
      const cells = body.map((row) =>
        row
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
      const head = cells[0] ?? [];
      const rest = cells.slice(1);
      html.push(
        `<div class="overflow-x-auto border-4 border-black"><table class="w-full min-w-[520px] border-collapse font-comic text-sm"><thead class="bg-brand-red text-left text-white"><tr>${head
          .map((cell) => `<th class="border-b-4 border-black p-2">${inline(cell)}</th>`)
          .join("")}</tr></thead><tbody>${rest
          .map(
            (row) =>
              `<tr class="bg-[#FFF7D1]">${row
                .map((cell) => `<td class="border-b-2 border-black p-2 align-top">${inline(cell)}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    if (line.startsWith("- ") || /^\d+\.\s/.test(line)) {
      const items: string[] = [];
      const ordered = /^\d+\.\s/.test(line);
      while (i < lines.length && (lines[i].startsWith("- ") || /^\d+\.\s/.test(lines[i]) || lines[i].startsWith("  "))) {
        items.push(lines[i].replace(/^(- |\d+\.\s)/, "").trim());
        i += 1;
      }
      const tag = ordered ? "ol" : "ul";
      html.push(
        `<${tag} class="list-inside ${ordered ? "list-decimal" : "list-disc"} space-y-1 font-comic">${items
          .map((item) => `<li>${inline(item)}</li>`)
          .join("")}</${tag}>`,
      );
      continue;
    }
    html.push(`<p class="font-comic">${inline(line)}</p>`);
    i += 1;
  }
  return html.join("");
}

export default function OperationsGuidePage() {
  const markdown = readFileSync(
    path.join(process.cwd(), "docs", "DealFinder-Auction-Operations-Guide.md"),
    "utf8",
  );
  return (
    <main className="mx-auto max-w-4xl space-y-4 bg-white p-6 print:p-0">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Link href="/admin" className="comic-btn-invert">
          Back to admin
        </Link>
        <a className="comic-btn" href="/DealFinder-Auction-Operations-Guide.pdf">
          Download PDF
        </a>
        <a className="comic-btn" href="/operations-guide/poster">
          Download DealFinder Poster
        </a>
      </div>
      <article
        className="space-y-3 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
      />
    </main>
  );
}
