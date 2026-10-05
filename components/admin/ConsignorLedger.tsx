"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { LotImage } from "@/components/LotImage";
import type { ConsignorLedgerGroup, ConsignorLedgerItem, LedgerStage } from "@/lib/consignorLedger";
import { formatCurrency } from "@/lib/utils";

type StageFilter = "all" | "waiting" | "scheduled" | "live" | "sold" | "closed";

const FILTERS: Array<{ id: StageFilter; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "waiting", label: "Needs approval" },
  { id: "scheduled", label: "Filed" },
  { id: "live", label: "Live" },
  { id: "sold", label: "Sold" },
  { id: "closed", label: "Unsold / rejected" },
];

const STAGE_TINT: Record<LedgerStage, string> = {
  waiting: "bg-brand-red text-white",
  held: "bg-brand-red text-white",
  live: "bg-[#19692C] text-white",
  scheduled: "bg-[#FFE066] text-black",
  sold: "bg-black text-white",
  paid: "bg-[#19692C] text-white",
  unsold: "bg-white text-black",
  rejected: "bg-white text-black",
};

function inFilter(stage: LedgerStage, filter: StageFilter) {
  if (filter === "all") return true;
  if (filter === "waiting") return stage === "waiting" || stage === "held";
  if (filter === "scheduled") return stage === "scheduled";
  if (filter === "live") return stage === "live";
  if (filter === "sold") return stage === "sold" || stage === "paid";
  return stage === "unsold" || stage === "rejected";
}

function shortDate(value: string | null) {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function Thumb({ item }: { item: ConsignorLedgerItem }) {
  const photo = item.images[0];
  if (!photo) {
    return (
      <div className="flex h-16 w-16 items-center justify-center border-4 border-black bg-white text-center font-display text-[10px] leading-tight">
        NO PHOTO
      </div>
    );
  }
  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden border-4 border-black bg-white">
      <LotImage src={photo} alt={item.title} fill className="object-cover" sizes="64px" />
    </div>
  );
}

function StageBadge({ item }: { item: ConsignorLedgerItem }) {
  return (
    <span
      className={`inline-block border-2 border-black px-2 py-1 font-display text-[11px] leading-none tracking-wide ${STAGE_TINT[item.stage]}`}
    >
      {item.stageLabel}
    </span>
  );
}

function ItemDetail({ item }: { item: ConsignorLedgerItem }) {
  return (
    <div className="space-y-3 border-t-4 border-black bg-white p-3 font-comic text-sm">
      {item.images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {item.images.map((url) => (
            <div key={url} className="relative h-28 w-28 overflow-hidden border-4 border-black bg-white">
              <LotImage src={url} alt={item.title} fill className="object-cover" sizes="112px" />
            </div>
          ))}
        </div>
      ) : (
        <p className="font-bold">No photos were submitted with this item.</p>
      )}
      <dl className="grid gap-2 sm:grid-cols-2">
        <Field label="Submitted" value={shortDate(item.submittedAt)} />
        <Field label="Condition grade" value={item.listingGrade || "—"} />
        <Field label="Category" value={item.category || "—"} />
        <Field
          label="Sale"
          value={
            item.auctionName
              ? `${item.auctionName}${item.auctionNumber ? ` (${item.auctionNumber})` : ""}`
              : "Not filed yet"
          }
        />
        <Field label="Closes" value={shortDate(item.endsAt)} />
        <Field label="High bidder" value={item.highBidder || "—"} />
        <Field label="Buyer paid" value={item.paidAt ? shortDate(item.paidAt) : "Not yet"} />
        <Field
          label="Delivery"
          value={
            item.fulfillment === "ship" ? "Shipping" : item.fulfillment === "pickup" ? "Pickup" : "Not chosen"
          }
        />
      </dl>
      {item.description ? (
        <div>
          <p className="font-display text-sm tracking-widest text-brand-red">DESCRIPTION</p>
          <p className="whitespace-pre-wrap">{item.description}</p>
        </div>
      ) : null}
      {item.notes ? (
        <div>
          <p className="font-display text-sm tracking-widest text-brand-red">CONSIGNOR NOTES</p>
          <p className="whitespace-pre-wrap">{item.notes}</p>
        </div>
      ) : null}
      {item.lotHref ? (
        <Link href={item.lotHref} target="_blank" className="comic-btn-invert !text-sm">
          Open the public lot page
        </Link>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-display text-xs tracking-widest">{label.toUpperCase()}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function GroupPanel({
  group,
  open,
  onToggle,
}: {
  group: ConsignorLedgerGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { totals } = group;

  return (
    <section className="comic-panel overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
      >
        <span className="min-w-0">
          <span className="block font-display text-2xl text-brand-red sm:text-3xl">
            {group.consignor}
            {group.house ? " (house)" : ""}
          </span>
          <span className="block font-comic text-sm">
            {group.email ?? "No email on file"} · {totals.items} item{totals.items === 1 ? "" : "s"}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2 font-comic text-xs">
          <Pill tone={totals.waiting > 0 ? "red" : "plain"}>{totals.waiting} waiting</Pill>
          <Pill tone={totals.live > 0 ? "green" : "plain"}>{totals.live} live</Pill>
          <Pill tone="plain">{totals.scheduled} filed</Pill>
          <Pill tone="plain">{totals.sold} sold</Pill>
          <span aria-hidden className="font-display text-2xl">
            {open ? "−" : "+"}
          </span>
        </span>
      </button>

      {open ? (
        <div className="border-t-4 border-black">
          <div className="flex flex-wrap gap-4 border-b-4 border-black bg-[#FFF7D1] p-3 font-comic text-sm">
            <Money label="Hammer total" value={totals.hammer} />
            <Money label="House commission" value={totals.houseCut} />
            <Money label="Payout ready" value={totals.payoutReady} />
            <Money label="Payout pending buyer" value={totals.payoutPending} />
          </div>
          <div className="comic-table-wrap">
            <table className="w-full min-w-[920px] border-collapse font-comic text-sm">
              <thead className="bg-[#FF0000] text-left text-white">
                <tr>
                  <th className="border-b-4 border-black p-3">Item</th>
                  <th className="border-b-4 border-black p-3">Stage</th>
                  <th className="border-b-4 border-black p-3">Lot / sale</th>
                  <th className="border-b-4 border-black p-3">Start</th>
                  <th className="border-b-4 border-black p-3">Buy Now</th>
                  <th className="border-b-4 border-black p-3">Current</th>
                  <th className="border-b-4 border-black p-3">Hammer</th>
                  <th className="border-b-4 border-black p-3">Commission</th>
                  <th className="border-b-4 border-black p-3">Their payout</th>
                  <th className="border-b-4 border-black p-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => {
                  const showing = expanded === item.key;
                  return (
                    <Fragment key={item.key}>
                      <tr className="bg-[#FFF7D1] align-top">
                        <td className="border-b-2 border-black p-3">
                          <div className="flex items-start gap-3">
                            <Thumb item={item} />
                            <div className="min-w-0">
                              <p className="font-bold">{item.title}</p>
                              <p className="text-xs">
                                {item.images.length} photo{item.images.length === 1 ? "" : "s"} ·{" "}
                                {shortDate(item.submittedAt)}
                              </p>
                              {item.charity ? (
                                <p className="font-display text-xs text-brand-red">CHARITY</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="border-b-2 border-black p-3">
                          <StageBadge item={item} />
                        </td>
                        <td className="border-b-2 border-black p-3">
                          {item.lotNumber ? <p className="font-bold">Lot {item.lotNumber}</p> : <p>Not filed</p>}
                          <p className="text-xs">{item.auctionNumber ?? item.auctionName ?? "—"}</p>
                        </td>
                        <td className="border-b-2 border-black p-3">{formatCurrency(item.startingBid)}</td>
                        <td className="border-b-2 border-black p-3">
                          {item.onBuyNow ? formatCurrency(item.buyNowPrice) : "—"}
                        </td>
                        <td className="border-b-2 border-black p-3">
                          {item.lotId ? formatCurrency(item.currentBid) : "—"}
                        </td>
                        <td className="border-b-2 border-black p-3">
                          {item.hammer == null ? "—" : formatCurrency(item.hammer)}
                        </td>
                        <td className="border-b-2 border-black p-3">
                          {item.commissionLabel === "—" ? "—" : `${item.commissionLabel} · ${formatCurrency(item.houseCut)}`}
                        </td>
                        <td className="border-b-2 border-black p-3 font-bold">
                          {item.hammer == null ? "—" : formatCurrency(item.payout)}
                        </td>
                        <td className="border-b-2 border-black p-3">
                          <button
                            type="button"
                            className={showing ? "comic-btn !text-sm" : "comic-btn-invert !text-sm"}
                            onClick={() => setExpanded(showing ? null : item.key)}
                          >
                            {showing ? "Hide" : "Photos + details"}
                          </button>
                        </td>
                      </tr>
                      {showing ? (
                        <tr className="bg-white">
                          <td colSpan={10} className="border-b-2 border-black p-0">
                            <ItemDetail item={item} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Pill({ tone, children }: { tone: "red" | "green" | "plain"; children: ReactNode }) {
  const tint =
    tone === "red" ? "bg-brand-red text-white" : tone === "green" ? "bg-[#19692C] text-white" : "bg-[#FFF7D1] text-black";
  return <span className={`border-2 border-black px-2 py-1 font-bold ${tint}`}>{children}</span>;
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="font-display text-xs tracking-widest">{label.toUpperCase()}</span>
      <span className="block font-bold">{formatCurrency(value)}</span>
    </span>
  );
}

export function ConsignorLedger({ refreshKey = 0 }: { refreshKey?: number }) {
  const [groups, setGroups] = useState<ConsignorLedgerGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StageFilter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/consignor-ledger", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json.error || "Could not load the consignor ledger.");
        return;
      }
      setGroups((json.groups ?? []) as ConsignorLedgerGroup[]);
      setError(null);
    } catch {
      setError("Could not reach the consignor ledger.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Approving or rejecting in the queue above bumps the key so totals stay honest.
  }, [refreshKey]);

  /** Catches up any consignor whose lot sold before sold notices went out. */
  async function sendSoldNotices() {
    setSending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sendConsignorSoldNotices" }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(json.error || "Could not send sold notices.");
        return;
      }
      const already = Number(json.skipped?.["already-sent"] ?? 0);
      const missing = Number(json.skipped?.["no-email"] ?? 0);
      setNotice(
        `Sent ${json.sent} sold notice${json.sent === 1 ? "" : "s"}.` +
          (already ? ` ${already} had already gone out.` : "") +
          (missing ? ` ${missing} had no consignor email on file.` : ""),
      );
    } catch {
      setNotice("Could not reach the desk.");
    } finally {
      setSending(false);
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (item: ConsignorLedgerItem) => {
      if (!inFilter(item.stage, filter)) return false;
      if (!q) return true;
      return [item.title, item.lotNumber, item.auctionNumber, item.auctionName, item.highBidder, item.category]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    };
    return groups
      .map((group) => {
        // A name match keeps the whole person; otherwise filter down to their matching items.
        const nameHit = Boolean(q) && group.consignor.toLowerCase().includes(q);
        const emailHit = Boolean(q) && (group.email ?? "").toLowerCase().includes(q);
        const items = group.items.filter((item) =>
          nameHit || emailHit ? inFilter(item.stage, filter) : matches(item),
        );
        return { ...group, items };
      })
      .filter((group) => group.items.length > 0);
  }, [groups, query, filter]);

  const searching = query.trim().length > 0 || filter !== "all";
  const totalItems = visible.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section className="space-y-4">
      <div className="comic-panel space-y-2 p-4">
        <h2 className="font-display text-2xl text-brand-red sm:text-4xl">Consignor tracking</h2>
        <p className="font-comic text-sm">
          Every item ever consigned, grouped by the person who brought it in — from the moment it
          lands in the queue through the sale and the payout. The queue row and the lot it becomes
          are the same line, so nothing is double counted.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search consignor, item, lot number, auction, bidder"
          className="min-w-0 w-full flex-1 border-4 border-black bg-white px-3 py-2 font-comic sm:min-w-[260px]"
        />
        <button type="button" className="comic-btn-invert" onClick={() => void load()}>
          Refresh
        </button>
        <button type="button" className="comic-btn-invert" onClick={() => void sendSoldNotices()}>
          {sending ? "Sending…" : "Email missing sold notices"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? "comic-btn !text-sm" : "comic-btn-invert !text-sm"}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
        <span className="font-comic text-sm">
          {visible.length} consignor{visible.length === 1 ? "" : "s"} · {totalItems} item
          {totalItems === 1 ? "" : "s"}
        </span>
      </div>

      {notice ? <p className="comic-panel p-4 font-comic text-sm font-bold">{notice}</p> : null}
      {error ? <p className="comic-panel p-4 font-display text-xl text-brand-red">{error}</p> : null}

      {loading && groups.length === 0 ? (
        <p className="comic-panel p-4 font-comic">Loading the consignor ledger…</p>
      ) : null}

      {!loading && visible.length === 0 ? (
        <p className="comic-panel p-4 font-comic">
          {searching
            ? "Nothing matches that search. Clear the box or switch back to Everything."
            : "No consignments yet. The first submission will open a table for that person."}
        </p>
      ) : null}

      {visible.map((group) => (
        <GroupPanel
          key={group.consignor}
          group={group}
          open={open[group.consignor] ?? (searching || group.totals.waiting > 0 || visible.length <= 3)}
          onToggle={() =>
            setOpen((current) => ({
              ...current,
              [group.consignor]: !(
                current[group.consignor] ??
                (searching || group.totals.waiting > 0 || visible.length <= 3)
              ),
            }))
          }
        />
      ))}
    </section>
  );
}
