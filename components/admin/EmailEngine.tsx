"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { filesToDataUrls } from "@/lib/files";
import { buildEmailHtml } from "@/lib/emailHtml";
import {
  TEMPLATE_VARIABLES,
  renderTemplate,
  type EmailTemplate,
  type EmailTemplateId,
} from "@/lib/emailTemplates";

export function EmailEngine({ onNotice }: { onNotice: (message: string) => void }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [active, setActive] = useState<EmailTemplateId>("outbid");
  const [to, setTo] = useState("");
  const [customerName, setCustomerName] = useState("Pat Paddle");
  const [itemTitle, setItemTitle] = useState("Silver Age Amazing #15 reprint folio");
  const [winningBid, setWinningBid] = useState("$250");
  const [paymentLink, setPaymentLink] = useState("https://localhost:3001/checkout");
  const [logoStamp, setLogoStamp] = useState(Date.now());
  const [logoSrc, setLogoSrc] = useState("data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=");
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const logoInput = useRef<HTMLInputElement>(null);
  const htmlInput = useRef<HTMLInputElement>(null);

  async function load() {
    const response = await fetch("/api/admin/templates");
    const json = await response.json();
    if (response.ok) {
      const next = (json.templates ?? []) as EmailTemplate[];
      setTemplates(next);
      setActive((current) =>
        next.some((row) => row.id === current) ? current : next[0]?.id ?? "outbid",
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/email-logo?t=${logoStamp}`)
      .then((response) => (response.ok ? response.blob() : Promise.reject()))
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      )
      .then((dataUrl) => {
        if (!cancelled) setLogoSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setLogoSrc("/logo.webp");
      });
    return () => {
      cancelled = true;
    };
  }, [logoStamp]);

  const current = templates.find((row) => row.id === active);

  const preview = useMemo(() => {
    if (!current) return { subject: "", html: "" };
    const rendered = renderTemplate(current, {
      customer_name: customerName,
      item_title: itemTitle,
      winning_bid: winningBid,
      payment_link: paymentLink,
    });
    return {
      subject: rendered.subject,
      html: buildEmailHtml(rendered.body, logoSrc),
    };
  }, [current, customerName, itemTitle, winningBid, paymentLink, logoSrc]);

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (!current) return;
    const response = await fetch("/api/admin/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: current.id,
        name: current.name,
        subject: current.subject,
        body: current.body,
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      onNotice(json.error || "Could not save template.");
      return;
    }
    onNotice(`Saved ${current.name}`);
    await load();
  }

  async function addTemplate(subject: string, body: string, name: string) {
    const response = await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, subject, body }),
    });
    const json = await response.json();
    if (!response.ok) {
      onNotice(json.error || "Could not add template.");
      return;
    }
    onNotice(`Added ${json.template?.name ?? name}`);
    setNewName("");
    setNewSubject("");
    await load();
    if (json.template?.id) setActive(json.template.id);
  }

  async function send(broadcast: boolean) {
    const response = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: active,
        to,
        broadcast,
        customer_name: customerName,
        item_title: itemTitle,
        winning_bid: winningBid,
        payment_link: paymentLink,
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      onNotice(json.error || "Send failed.");
      return;
    }
    onNotice(
      json.mode === "resend"
        ? `Sent ${json.sent} via Resend.`
        : `Queued ${json.sent} in demo outbox (set RESEND_API_KEY to deliver).`,
    );
  }

  function patch(field: "name" | "subject" | "body", value: string) {
    setTemplates((list) =>
      list.map((row) => (row.id === active ? { ...row, [field]: value } : row)),
    );
  }

  async function onLogoFile(file: File | undefined) {
    if (!file) return;
    const [dataUrl] = await filesToDataUrls([file]);
    const response = await fetch("/api/admin/email-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });
    const json = await response.json();
    if (!response.ok) {
      onNotice(json.error || "Could not save logo.");
      return;
    }
    setLogoStamp(Date.now());
    onNotice("Email logo saved. PNG or JPEG shows in more inboxes than WebP.");
  }

  async function resetLogo() {
    const response = await fetch("/api/admin/email-logo", { method: "DELETE" });
    if (!response.ok) {
      onNotice("Could not reset logo.");
      return;
    }
    setLogoStamp(Date.now());
    onNotice("Using the site logo from public/logo.webp.");
  }

  async function onHtmlFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const title = file.name.replace(/\.(html?|txt)$/i, "").replace(/[_-]+/g, " ");
    await addTemplate("DealFinder Auctions", text, title || "Imported template");
  }

  return (
    <section className="space-y-4">
      <div className="border-4 border-black bg-[#FF0000] p-4 text-white shadow-[6px_6px_0_0_#000]">
        <h2 className="font-display text-4xl">Email template & marketing engine</h2>
        <p className="font-comic text-sm">
          Variables: {TEMPLATE_VARIABLES.join(" ")}. Logo is inlined in every send. Paste HTML
          or import a file if you already have house templates.
        </p>
      </div>

      <div className="grid gap-4 border-4 border-black bg-[#FFF7D1] p-4 shadow-[6px_6px_0_0_#000] sm:grid-cols-[160px_1fr]">
        <div className="border-4 border-black bg-black p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/admin/email-logo?t=${logoStamp}`}
            alt="Email logo"
            className="mx-auto h-28 w-28 object-contain"
          />
        </div>
        <div className="space-y-2 font-comic">
          <p className="font-bold">Logo in emails</p>
          <p className="text-sm">
            Defaults to <code>public/logo.webp</code>. Upload a PNG or JPEG for better inbox
            support, or put <code>{"{{logo}}"}</code> in a custom HTML template.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="comic-btn" onClick={() => logoInput.current?.click()}>
              Upload logo
            </button>
            <button type="button" className="comic-btn-invert" onClick={() => void resetLogo()}>
              Use site logo
            </button>
          </div>
          <input
            ref={logoInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(event) => {
              void onLogoFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {templates.map((row) => (
          <button
            key={row.id}
            type="button"
            className={row.id === active ? "comic-btn" : "comic-btn-invert"}
            onClick={() => setActive(row.id)}
          >
            {row.name}
          </button>
        ))}
      </div>

      {current && (
        <form
          onSubmit={saveTemplate}
          className="space-y-3 border-4 border-black bg-[#FFF7D1] p-4 shadow-[6px_6px_0_0_#000]"
        >
          <label className="block font-comic font-bold">
            Template name
            <input
              value={current.name}
              onChange={(e) => patch("name", e.target.value)}
              className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="block font-comic font-bold">
            Subject
            <input
              value={current.subject}
              onChange={(e) => patch("subject", e.target.value)}
              className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="block font-comic font-bold">
            Body (plain text or HTML)
            <textarea
              value={current.body}
              onChange={(e) => patch("body", e.target.value)}
              rows={12}
              className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-mono text-sm font-normal"
            />
          </label>
          <button type="submit" className="comic-btn-invert">
            Save template
          </button>
        </form>
      )}

      <div className="space-y-3 border-4 border-black bg-white p-4 shadow-[6px_6px_0_0_#000]">
        <p className="font-display text-2xl">Add / import a house template</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block font-comic font-bold">
            Name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full border-4 border-black px-3 py-2 font-normal"
              placeholder="Lot preview blast"
            />
          </label>
          <label className="block font-comic font-bold">
            Subject
            <input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              className="mt-1 w-full border-4 border-black px-3 py-2 font-normal"
              placeholder="This week at DealFinder"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="comic-btn"
            onClick={() => {
              if (!newName.trim()) {
                onNotice("Name the template first.");
                return;
              }
              void addTemplate(
                newSubject.trim() || "DealFinder Auctions",
                `{{logo}}\n\nHey {{customer_name}},\n\n`,
                newName.trim(),
              );
            }}
          >
            New blank template
          </button>
          <button type="button" className="comic-btn-invert" onClick={() => htmlInput.current?.click()}>
            Import HTML / TXT
          </button>
        </div>
        <input
          ref={htmlInput}
          type="file"
          accept=".html,.htm,.txt,text/html,text/plain"
          className="hidden"
          onChange={(event) => {
            void onHtmlFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      <div className="border-4 border-black bg-[#FFF7D1] p-4 shadow-[6px_6px_0_0_#000]">
        <p className="font-display text-2xl">Preview</p>
        <p className="font-comic text-sm">Subject: {preview.subject}</p>
        <iframe
          title="Email preview"
          className="mt-3 h-[420px] w-full border-4 border-black bg-white"
          srcDoc={preview.html}
        />
      </div>

      <div className="grid gap-3 border-4 border-black bg-white p-4 shadow-[6px_6px_0_0_#000] sm:grid-cols-2">
        <label className="block font-comic font-bold sm:col-span-2">
          Recipients (comma-separated)
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full border-4 border-black px-3 py-2 font-normal"
            placeholder="bidder@example.com"
          />
        </label>
        <label className="block font-comic font-bold">
          {"{{customer_name}}"}
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="mt-1 w-full border-4 border-black px-3 py-2 font-normal"
          />
        </label>
        <label className="block font-comic font-bold">
          {"{{item_title}}"}
          <input
            value={itemTitle}
            onChange={(e) => setItemTitle(e.target.value)}
            className="mt-1 w-full border-4 border-black px-3 py-2 font-normal"
          />
        </label>
        <label className="block font-comic font-bold">
          {"{{winning_bid}}"}
          <input
            value={winningBid}
            onChange={(e) => setWinningBid(e.target.value)}
            className="mt-1 w-full border-4 border-black px-3 py-2 font-normal"
          />
        </label>
        <label className="block font-comic font-bold">
          {"{{payment_link}}"}
          <input
            value={paymentLink}
            onChange={(e) => setPaymentLink(e.target.value)}
            className="mt-1 w-full border-4 border-black px-3 py-2 font-normal"
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="button" className="comic-btn" onClick={() => void send(false)}>
            Send to recipient
          </button>
          <button type="button" className="comic-btn-invert" onClick={() => void send(true)}>
            Broadcast / floor copy
          </button>
        </div>
      </div>
    </section>
  );
}
