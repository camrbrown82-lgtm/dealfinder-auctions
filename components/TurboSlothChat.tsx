"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";

type Turn = { role: "user" | "assistant"; content: string };

const OPENER =
  "Hey, I'm Turbo Sloth. Though I can't bid for you, I can answer any questions you have about bids, max bids, consignments, or any other inquiries in your bidding journey.";

type Frame = {
  top: number;
  maxHeight: number;
  compact: boolean;
  panelHeight: number;
  panelWidth: number;
  imageMax: number;
};

export function TurboSlothChat() {
  const pathname = usePathname();
  const [frame, setFrame] = useState<Frame>({
    top: 16,
    maxHeight: 320,
    compact: false,
    panelHeight: 384,
    panelWidth: 384,
    imageMax: 280,
  });
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
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
      const compact = window.innerWidth < 768;
      const natural = compact ? 112 : 196;
      const minHeight = compact ? 88 : 150;
      const gap = 8;
      const footer = document.querySelector("footer");
      const footerTop = footer ? footer.getBoundingClientRect().top : window.innerHeight;
      let top = 12;
      let maxHeight = footerTop - top - gap;
      if (maxHeight < minHeight) {
        top = Math.max(12, footerTop - minHeight - gap);
        maxHeight = footerTop - top - gap;
      }
      maxHeight = Math.min(natural, Math.max(72, maxHeight));
      const bottomLimit = Math.min(window.innerHeight - 12, footerTop - 12);
      let panelHeight = 384;
      let panelWidth = 384;
      let imageMax = compact ? 56 : Math.max(48, maxHeight - 36);
      const main = document.querySelector("main");
      if (!compact && main) {
        const box = main.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(main).paddingRight) || 0;
        const contentRight = box.right - pad;
        const buttonRight = window.innerWidth - 8;
        panelWidth = Math.min(384, Math.max(160, buttonRight - contentRight - 12));
      }
      if (!compact) {
        const buttonBlock = imageMax + 70;
        const room = bottomLimit - top - buttonBlock - 8;
        panelHeight = Math.min(500, Math.max(160, room));
      }
      const next: Frame = {
        top: Math.round(top),
        maxHeight: Math.round(maxHeight),
        compact,
        panelHeight: Math.round(panelHeight),
        panelWidth: Math.round(panelWidth),
        imageMax: Math.round(imageMax),
      };
      setFrame((current) =>
        current.top === next.top &&
        current.maxHeight === next.maxHeight &&
        current.compact === next.compact &&
        current.panelHeight === next.panelHeight &&
        current.panelWidth === next.panelWidth &&
        current.imageMax === next.imageMax
          ? current
          : next,
      );
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
    setHeaderSlot(document.getElementById("turbo-sloth-header"));
  }, [pathname]);

  useEffect(() => {
    if (!open || !frame.compact) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, frame.compact]);

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

  const panel = (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b-4 border-black bg-brand-red px-3 py-2 text-white">
        <div className="min-w-0">
          <p className="font-display text-2xl leading-none">Turbo Sloth</p>
          <p className="font-comic text-xs">Floor guide · DealFinder Auctions</p>
        </div>
        <button
          type="button"
          className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-black font-display text-xl leading-none text-white"
          aria-label="Close chat"
          onClick={() => setOpen(false)}
        >
          X
        </button>
      </header>
      <div
        ref={scroller}
        className={`space-y-2 overflow-y-auto bg-white p-3 ${
          frame.compact ? "min-h-0 flex-1" : "max-h-72"
        }`}
      >
        {messages.map((turn, index) => (
          <div
            key={`${turn.role}-${index}`}
            className={`flex items-end gap-2 ${turn.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {turn.role === "assistant" ? (
              <Image
                src="/turbo-sloth.jpg"
                alt=""
                width={64}
                height={64}
                className="h-8 w-8 shrink-0 border-2 border-black bg-brand-red object-cover object-top"
              />
            ) : null}
            <p
              className={`min-w-0 max-w-[85%] px-3 py-2 font-comic text-sm ${
                turn.role === "user" ? "border-4 border-black bg-brand-cream" : "border-4 border-black bg-white"
              }`}
            >
              {turn.content}
            </p>
          </div>
        ))}
        {busy ? <p className="font-comic text-xs text-black/60">Turbo Sloth is thinking…</p> : null}
        {error ? <p className="font-comic text-sm text-brand-red">{error}</p> : null}
      </div>
      <form onSubmit={(event) => void send(event)} className="flex shrink-0 gap-2 border-t-4 border-black bg-[#FFF7D1] p-2">
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
        <button type="submit" className="comic-btn shrink-0 self-end !px-3 !text-base" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </>
  );

  return (
    <>
      {open && frame.compact ? (
        <section
          className="pointer-events-auto fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#FFF7D1] print:hidden"
          role="dialog"
          aria-label="Turbo Sloth chat"
        >
          {panel}
        </section>
      ) : null}
      {headerSlot
        ? createPortal(
            <button
              type="button"
              className="flex h-11 w-9 items-center justify-center border-4 border-brand-cream bg-brand-red p-0.5 shadow-comic-sm"
              aria-label="Chat with Turbo Sloth"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Image
                src="/turbo-sloth.jpg"
                alt=""
                width={48}
                height={64}
                className="h-full w-full object-cover object-top"
              />
            </button>,
            headerSlot,
          )
        : null}
      <div
        className="pointer-events-none fixed right-2 z-40 hidden w-40 print:hidden md:block"
        style={{ top: frame.top }}
      >
        <button
          type="button"
          className="pointer-events-auto relative z-10 flex w-full flex-col items-stretch border-4 border-black bg-brand-red p-1 text-white shadow-comic"
          aria-label="Chat with me"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Image
            src="/turbo-sloth.jpg"
            alt=""
            width={320}
            height={420}
            style={{ maxHeight: frame.imageMax }}
            className="h-auto w-full border-2 border-black bg-brand-red object-contain object-top"
          />
          <span className="px-1 py-1.5 text-center font-display text-2xl leading-none">Chat with me</span>
        </button>
        {open && !frame.compact ? (
          <section
            className="pointer-events-auto absolute right-0 top-full z-50 mt-2 flex w-96 max-h-[500px] flex-col overflow-hidden border-4 border-black bg-[#FFF7D1] shadow-comic"
            style={{ width: frame.panelWidth }}
            role="dialog"
            aria-label="Turbo Sloth chat"
          >
            {panel}
          </section>
        ) : null}
      </div>
    </>
  );
}
