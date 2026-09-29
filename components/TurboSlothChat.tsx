"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";

type Turn = { role: "user" | "assistant"; content: string };

const OPENER =
  "Hey, I'm Turbo Sloth. Though I can't bid for you, I can answer any questions you have about bids, max bids, consignments, or any other inquiries in your bidding journey.";

export function TurboSlothChat() {
  const pathname = usePathname();
  const [compact, setCompact] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Turn[]>([{ role: "assistant", content: OPENER }]);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function measure() {
      setCompact(window.innerWidth < 768);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    setHeaderSlot(document.getElementById("turbo-sloth-header"));
  }, [pathname]);

  useEffect(() => {
    if (!open || !compact) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, compact]);

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
        <Image
          src="/turbo-sloth.jpg"
          alt=""
          width={48}
          height={48}
          className="h-10 w-10 shrink-0 border-2 border-black bg-brand-red object-cover object-top"
        />
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
                width={40}
                height={40}
                className="h-8 w-8 shrink-0 border-2 border-black bg-brand-red object-cover object-top"
              />
            ) : null}
            <p
              className={`min-w-0 max-w-[85%] break-words px-3 py-2 font-comic text-sm leading-snug ${
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

  const launcher = (
    <button
      type="button"
      className="pointer-events-auto flex w-24 flex-col items-stretch border-4 border-black bg-brand-red p-1 text-white shadow-comic"
      aria-label="Chat with me"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
    >
      <Image
        src="/turbo-sloth.jpg"
        alt=""
        width={96}
        height={96}
        className="h-24 w-full border-2 border-black bg-brand-red object-cover object-top"
      />
      <span className="px-1 py-1 text-center font-display text-sm leading-tight">Chat with me</span>
    </button>
  );

  return (
    <>
      {open && compact ? (
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
      <div className="pointer-events-none fixed bottom-4 right-4 z-30 hidden flex-col items-end gap-3 print:hidden md:flex">
        {open && !compact ? (
          <section
            className="pointer-events-auto flex h-[min(32rem,70vh)] w-[min(26rem,calc(100vw-6rem))] flex-col overflow-hidden border-4 border-black bg-[#FFF7D1] shadow-comic"
            role="dialog"
            aria-label="Turbo Sloth chat"
          >
            {panel}
          </section>
        ) : null}
        {launcher}
      </div>
    </>
  );
}
