"use client";

import { CANADIAN_PROVINCES } from "@/lib/payments";
import type { ProfileInput } from "@/lib/profileTypes";
import { PreauthDisclaimer } from "@/components/PreauthDisclaimer";

const inputClass =
  "comic-field mt-1 w-full px-3 py-2 font-normal";

export function ProfileFields({
  value,
  onChange,
  idPrefix = "profile",
}: {
  value: ProfileInput;
  onChange: (next: ProfileInput) => void;
  idPrefix?: string;
}) {
  function patch<K extends keyof ProfileInput>(key: K, next: ProfileInput[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="space-y-3">
      <label className="block font-comic text-sm font-bold">
        Full name
        <input
          id={`${idPrefix}-name`}
          required
          value={value.fullName}
          onChange={(e) => patch("fullName", e.target.value)}
          className={inputClass}
          autoComplete="name"
        />
      </label>
      <label className="block font-comic text-sm font-bold">
        Phone number
        <input
          id={`${idPrefix}-phone`}
          required
          type="tel"
          value={value.phone}
          onChange={(e) => patch("phone", e.target.value)}
          className={inputClass}
          autoComplete="tel"
          placeholder="(403) 555-0199"
        />
      </label>
      <p className="font-display text-xl">Shipping address</p>
      <label className="block font-comic text-sm font-bold">
        Street
        <input
          required
          value={value.street}
          onChange={(e) => patch("street", e.target.value)}
          className={inputClass}
          autoComplete="street-address"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block font-comic text-sm font-bold">
          City
          <input
            required
            value={value.city}
            onChange={(e) => patch("city", e.target.value)}
            className={inputClass}
            autoComplete="address-level2"
          />
        </label>
        <label className="block font-comic text-sm font-bold">
          Province
          <select
            required
            value={value.province}
            onChange={(e) => patch("province", e.target.value)}
            className={inputClass}
          >
            {CANADIAN_PROVINCES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block font-comic text-sm font-bold">
        Postal code
        <input
          required
          value={value.postalCode}
          onChange={(e) => patch("postalCode", e.target.value)}
          className={inputClass}
          autoComplete="postal-code"
          placeholder="T4B 0J6"
        />
      </label>

      <p className="font-display text-xl">Payment</p>
      <p className="font-comic text-xs">
        Helcim is the house processor. Cash and e-Transfer are retired. Cards are taken through
        HelcimPay.js — we do not store full card numbers.
      </p>
      <div className="border-4 border-black bg-[#FF0000] px-3 py-3 text-left font-comic text-sm font-bold text-white shadow-comic-red-sm">
        Helcim card
      </div>
      <PreauthDisclaimer
        compact
        agreed={value.preauthTermsAgreed}
        onAgree={(next) => patch("preauthTermsAgreed", next)}
        id={`${idPrefix}-preauth-agree`}
      />
    </div>
  );
}
