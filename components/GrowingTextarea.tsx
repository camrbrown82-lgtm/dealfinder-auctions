"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

type GrowingTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  maxRows?: number;
};

export function GrowingTextarea({
  maxRows = 6,
  rows = 2,
  value,
  className,
  ...rest
}: GrowingTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const rowCount = Number(rows) || 2;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const style = getComputedStyle(el);
    const line = Number.parseFloat(style.lineHeight) || 22;
    const pad = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    const border = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
    const min = line * rowCount + pad + border;
    const max = line * Math.max(maxRows, rowCount) + pad + border;
    const needed = el.scrollHeight + border;
    el.style.maxHeight = `${max}px`;
    el.style.height = `${Math.max(needed, min)}px`;
    el.style.overflowY = needed > max + 1 ? "auto" : "hidden";
  }, [value, rowCount, maxRows]);

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={rowCount}
      value={value}
      className={`resize-none ${className ?? ""}`}
    />
  );
}
