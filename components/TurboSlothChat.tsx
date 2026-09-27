"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useState, useRef } from "react";

type Turn = { role: "user" | "assistant"; content: string };

const OPENER =
  "Hey, I'm Turbo Sloth. Though I can't bid for you, I can answer any questions you have about bids, max bids, consignments, or any other inquiries in your bidding journey.";

export function TurboSlothChat() {
  const pathname = usePathname();
  const [frame, setFrame] = useState({ top: 16, maxHeight: 320 });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Turn[]>([{ role: "assistant", content: OPENER }]);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let frameId = 0;
    function place() {
      const compact = window.innerWidth < 640;
      const natural = compact ? 112 : 340;
      const minHeight = compact ? 88 : 150;
      const gap = 8;
      const footer = document.querySelector("footer");
      const auctions = document.getElementById("live-auctions");
      const footerTop = footer ? footer.getBoundingClientRect().top : window.innerHeight;
      let top = auctions ? auctions.getBoundingClientRect().top : 12;
      if (top < 12) top = 12;
      let maxHeight = footerTop - top - gap;
      if (maxHeight < minHeight) {
        top = Math.max(12, footerTop - minHeight - gap);
        maxHeight = footerTop - top - gap;
      }
      maxHeight = Math.min(natural, Math.max(72, maxHeight));
      const next = { top: Math.round(top), maxHeight: Math.round(maxHeight) };
      setFrame((current) => (current.top === next.top && current.maxHeight === next.maxHeight ? current : next));
    }
    function onMove() {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(place);
    }
    place();
    window.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [open, messages, busy]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/turbo-sloth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((turn) => turn.content !== OPENER || turn.role === "user") }),
      });
      const json = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !json.reply) throw new Error(json.error || "Turbo Sloth could not answer.");
      setMessages((current) => [...current, { role: "assistant", content: json.reply! }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Turbo Sloth could not answer.");
    } finally {
      setBusy(false);
    }
  }

  const imageMax = Math.max(48, frame.maxHeight - 36);
  return (
    <div
      className="pointer-events-none fixed right-1 z-40 w-[4.25rem] print:hidden sm:right-2 sm:w-40"
      style={{ top: frame.top }}
    >
      {open ? (
        <section
          className="pointer-events-auto absolute right-full top-0 z-40 mr-2 flex h-[min(70vh,28rem)] w-[min(calc(100vw-6rem),22rem)] flex-col overflow-hidden border-4 border-black bg-[#FFF7D1] shadow-comic"
          role="dialog"
          aria-label="Turbo Sloth chat"
        >
          <header className="flex items-center gap-3 border-b-4 border-black bg-brand-red px-3 py-2 text-white">
            <Image
              src="/turbo-sloth.jpg"
              alt=""
              width={240}
              height={320}
              className="h-16 w-12 shrink-0 border-2 border-black bg-brand-red object-contain"
            />
            <div className="min-w-0">
              <p className="font-display text-2xl leading-none">Turbo Sloth</p>
              <p className="font-comic text-xs">Floor guide · DealFinder Auctions</p>
            </div>
            <button
              type="button"
              className="ml-auto border-2 border-black bg-black px-2 py-1 font-display text-sm text-white"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </header>
          <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-white p-3">
            {messages.map((turn, index) => (
              <div
                key={`${turn.role}-${index}`}
                className={`flex items-end gap-2 ${turn.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {turn.role === "assistant" ? (
                  <Image
                    src="/turbo-sloth.jpg"
                    alt=""
                    width={160}
                    height={220}
                    className="h-12 w-9 shrink-0 border-2 border-black bg-brand-red object-contain"
                  />
                ) : null}
                <p
                  className={`max-w-[85%] px-3 py-2 font-comic text-sm ${
                    turn.role === "user"
                      ? "border-4 border-black bg-brand-cream"
                      : "border-4 border-black bg-white"
                  }`}
                >
                  {turn.content}
                </p>
              </div>
            ))}
            {busy ? <p className="font-comic text-xs text-black/60">Turbo Sloth is thinking…</p> : null}
            {error ? <p className="font-comic text-sm text-brand-red">{error}</p> : null}
          </div>
          <form onSubmit={(event) => void send(event)} className="flex gap-2 border-t-4 border-black bg-[#FFF7D1] p-2">
            <label className="sr-only" htmlFor="turbo-sloth-draft">
              Message Turbo Sloth
            </label>
            <textarea
              id="turbo-sloth-draft"
              ref={field}
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="How do Max Bids work?"
              className="min-w-0 flex-1 resize-none border-4 border-black bg-white px-2 py-1 font-comic text-sm"
            />
            <button type="submit" className="comic-btn !px-3 !text-base" disabled={busy || !draft.trim()}>
              Send
            </button>
          </form>
        </section>
      ) : null}
      <button
        type="button"
        className="pointer-events-auto flex w-full flex-col items-stretch border-4 border-black bg-brand-red p-1 text-white shadow-comic"
        aria-label={open ? "Hide Turbo Sloth" : "Chat with me"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Image
          src="/turbo-sloth.jpg"
          alt=""
          width={320}
          height={420}
          style={{ maxHeight: imageMax }}
          className="h-auto w-full border-2 border-black bg-brand-red object-contain object-top"
        />
        <span className="px-0.5 py-1 text-center font-display text-sm leading-none sm:px-1 sm:py-1.5 sm:text-2xl">
          {open ? "Hide" : (
            <>
              <span className="sm:hidden">Chat</span>
              <span className="hidden sm:inline">Chat with me</span>
            </>
          )}
        </span>
      </button>
    </div>
  );
}
