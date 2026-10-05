"use client";

import { useState } from "react";
import { useAdminDesk } from "@/components/admin/AdminDesk";

const PHRASE = "RESET";

export function ResetTestData() {
  const { mutate, setNotice, setError } = useAdminDesk();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const armed = confirm.trim().toUpperCase() === PHRASE;

  async function run(action: "resetAuctionData" | "purge-test-data") {
    if (!armed) {
      setError(`Type ${PHRASE} first.`);
      return;
    }
    setBusy(true);
    const json = await mutate("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (!json) return;
    setConfirm("");
    setNotice(
      action === "purge-test-data"
        ? "Everything was cleared, including bidder accounts. The floor is empty."
        : "All lots, bids, consignments, invoices, and sale weeks were cleared. Bidder accounts were kept.",
    );
  }

  return (
    <section className="comic-panel space-y-3 border-brand-red p-4">
      <h2 className="font-display text-3xl text-brand-red">Start from scratch</h2>
      <p className="font-comic text-sm">
        Clears every lot on the live page, every bid, every consignment, every sold record and
        invoice, and every sale week. There is no undo. Type <strong>{PHRASE}</strong> to unlock the
        buttons.
      </p>
      <input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={PHRASE}
        className="w-40 border-4 border-black bg-white px-3 py-2 font-comic"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="comic-btn !text-sm"
          disabled={busy || !armed}
          onClick={() => void run("resetAuctionData")}
        >
          Clear auctions, lots and consignments
        </button>
        <button
          type="button"
          className="comic-btn-invert !text-sm"
          disabled={busy || !armed}
          onClick={() => void run("purge-test-data")}
        >
          Also delete every bidder account
        </button>
      </div>
      <p className="font-comic text-xs">
        The first button keeps your customer directory and trusted-cash flags so you can keep
        testing with the same logins. The second wipes those accounts too.
      </p>
    </section>
  );
}
