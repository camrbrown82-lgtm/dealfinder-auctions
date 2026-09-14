"use client";

import { formatCurrency } from "@/lib/utils";
import type { AdminBid } from "@/lib/adminTypes";

export function BidAuditModal({
  title,
  bids,
  busy,
  onClose,
  onVoid,
}: {
  title: string;
  bids: AdminBid[];
  busy: boolean;
  onClose: () => void;
  onVoid: (bidId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        role="dialog"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto comic-panel"
      >
        <div className="flex items-start justify-between gap-3 border-b-4 border-black bg-brand-cream px-4 py-3">
          <div>
            <p className="font-display text-sm tracking-[0.2em] text-brand-red">BID HISTORY AUDIT</p>
            <h2 className="font-display text-3xl leading-none text-brand-red">{title}</h2>
          </div>
          <button
            type="button"
            className="comic-btn-invert !px-3 !py-1 !text-2xl"
            onClick={onClose}
            aria-label="Close audit"
          >
            X
          </button>
        </div>
        <div className="p-4">
          {bids.length === 0 ? (
            <p className="font-comic">No paddle attempts on this lot yet.</p>
          ) : (
            <table className="w-full border-collapse font-comic text-sm">
              <thead className="bg-black text-left text-white">
                <tr>
                  <th className="border-4 border-black p-2">Name</th>
                  <th className="border-4 border-black p-2">Email</th>
                  <th className="border-4 border-black p-2">Amount</th>
                  <th className="border-4 border-black p-2">When</th>
                  <th className="border-4 border-black p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {bids.map((bid) => (
                  <tr key={bid.id} className="bg-white">
                    <td className="border-4 border-black p-2">{bid.bidder}</td>
                    <td className="border-4 border-black p-2">{bid.email || "—"}</td>
                    <td className="border-4 border-black p-2">{formatCurrency(bid.amount)}</td>
                    <td className="border-4 border-black p-2">
                      {new Date(bid.createdAt).toLocaleString()}
                    </td>
                    <td className="border-4 border-black p-2">
                      <button
                        type="button"
                        className="comic-btn !px-3 !text-sm"
                        disabled={busy}
                        onClick={() => onVoid(bid.id)}
                      >
                        Void/Remove Bid
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
