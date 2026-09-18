"use client";

import {
  parseTcTemplateType,
  termsTextFor,
  TC_TEMPLATE_OPTIONS,
  type TcTemplateType,
} from "@/lib/tcTemplates";

export function AuctionTermsFields({
  templateType,
  termsText,
  onChange,
  idPrefix = "auction-tc",
}: {
  templateType: TcTemplateType;
  termsText: string;
  onChange: (next: { templateType: TcTemplateType; termsText: string }) => void;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="block font-comic text-sm font-bold">
        Terms &amp; Conditions Template
        <select
          id={`${idPrefix}-template`}
          value={templateType}
          onChange={(e) => {
            const next = parseTcTemplateType(e.target.value);
            onChange({
              templateType: next,
              termsText: next === "custom" ? termsText : termsTextFor(next),
            });
          }}
          className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal"
        >
          {TC_TEMPLATE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block font-comic text-sm font-bold">
        Terms &amp; Conditions
        <textarea
          id={`${idPrefix}-text`}
          value={termsText}
          onChange={(e) => onChange({ templateType, termsText: e.target.value })}
          rows={14}
          className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal leading-relaxed"
        />
      </label>
      <p className="font-comic text-xs">
        Bidders see this exact text when they agree to bid and the Sunday $50 pre-authorization.
      </p>
    </div>
  );
}
