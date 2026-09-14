"use client";

import { useEffect, useState } from "react";
import type { HouseDeskSettings } from "@/lib/houseDesk";

export function HouseCatalogSettings({
  settings,
  busy,
  onSave,
}: {
  settings: HouseDeskSettings;
  busy?: boolean;
  onSave: (next: HouseDeskSettings) => void | Promise<void>;
}) {
  const [defaultStartingBid, setDefaultStartingBid] = useState(String(settings.defaultStartingBid));
  const [nextLotNumber, setNextLotNumber] = useState(settings.nextLotNumber);

  useEffect(() => {
    setDefaultStartingBid(String(settings.defaultStartingBid));
    setNextLotNumber(settings.nextLotNumber);
  }, [settings.defaultStartingBid, settings.nextLotNumber]);

  function persist(next: HouseDeskSettings) {
    void onSave(next);
  }

  return (
    <div className="comic-panel grid gap-3 p-4 sm:grid-cols-2">
      <label className="block font-comic font-bold">
        Default starting bid ($)
        <input
          type="number"
          min={1}
          value={defaultStartingBid}
          disabled={busy}
          onChange={(e) => setDefaultStartingBid(e.target.value)}
          onBlur={() =>
            persist({
              defaultStartingBid: Number(defaultStartingBid) || settings.defaultStartingBid,
              nextLotNumber,
            })
          }
          className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
        />
        <span className="mt-1 block font-normal text-sm">
          Every new house lot uses this unless you change starting bid on that item.
        </span>
      </label>
      <label className="block font-comic font-bold">
        Next lot #
        <input
          value={nextLotNumber}
          disabled={busy}
          onChange={(e) => setNextLotNumber(e.target.value)}
          onBlur={() =>
            persist({
              defaultStartingBid: Number(defaultStartingBid) || settings.defaultStartingBid,
              nextLotNumber,
            })
          }
          className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
        />
        <span className="mt-1 block font-normal text-sm">
          Type a section start (example: 500 for clothing). Each saved lot uses the next number.
        </span>
      </label>
    </div>
  );
}
