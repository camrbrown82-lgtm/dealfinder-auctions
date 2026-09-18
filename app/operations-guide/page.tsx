import { readFileSync } from "fs";
import path from "path";
import Link from "next/link";

export const dynamic = "force-static";

export default function OperationsGuidePage() {
  const markdown = readFileSync(
    path.join(process.cwd(), "docs", "DealFinder-Auction-Operations-Guide.md"),
    "utf8",
  );
  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white p-6 print:p-0">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Link href="/admin" className="comic-btn-invert">
          Back to admin
        </Link>
        <a className="comic-btn" href="/DealFinder-Auction-Operations-Guide.pdf">
          Download PDF
        </a>
      </div>
      <article className="whitespace-pre-wrap font-comic text-sm leading-relaxed">{markdown}</article>
    </main>
  );
}
