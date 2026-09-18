"use client";

import { useEffect, useState } from "react";

type CashRequest = {
  userId: string;
  eventId: string;
  fullName: string;
  email: string;
  auctionLabel: string;
  requestedAt: string;
  trustedCash: boolean;
};

export function CashAuthDesk({ onNotice }: { onNotice: (message: string) => void }) {
  const [requests, setRequests] = useState<CashRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/cash-auth");
    const json = await response.json();
    if (response.ok) setRequests(json.requests ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(row: CashRequest, decision: "approve_auction" | "approve_permanent" | "reject") {
    const id = `${row.userId}:${row.eventId}:${decision}`;
    setBusy(id);
    try {
      const response = await fetch("/api/admin/cash-auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.userId, eventId: row.eventId, decision }),
      });
      const json = await response.json();
      if (!response.ok) {
        onNotice(json.error || "Could not update cash request.");
        return;
      }
      onNotice(
        decision === "reject"
          ? "Cash request rejected. Bidding stays gated."
          : decision === "approve_permanent"
            ? "Approved this auction and marked trusted cash bidder."
            : "Approved cash bidding for this auction.",
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3" id="cash-queue">
      <div className="comic-panel p-4">
        <h2 className="font-display text-2xl text-brand-red sm:text-4xl">Cash bidding queue</h2>
        <p className="font-comic text-sm">
          Pending cash-on-pickup authorizations. Approve this auction, approve permanently, or reject.
        </p>
      </div>
      {requests.length === 0 ? (
        <p className="comic-panel p-4 font-comic">No cash bidding requests waiting.</p>
      ) : (
        requests.map((row) => (
          <article key={`${row.userId}:${row.eventId}`} className="comic-panel space-y-2 p-4 font-comic">
            <p className="font-display text-2xl">{row.fullName || "Bidder"}</p>
            <p>{row.email}</p>
            <p>Auction: {row.auctionLabel}</p>
            <p>Requested: {row.requestedAt ? new Date(row.requestedAt).toLocaleString() : "—"}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="comic-btn"
                disabled={Boolean(busy)}
                onClick={() => void decide(row, "approve_auction")}
              >
                Approve this auction
              </button>
              <button
                type="button"
                className="comic-btn"
                disabled={Boolean(busy)}
                onClick={() => void decide(row, "approve_permanent")}
              >
                Approve permanently
              </button>
              <button
                type="button"
                className="comic-btn-invert"
                disabled={Boolean(busy)}
                onClick={() => void decide(row, "reject")}
              >
                Reject
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
