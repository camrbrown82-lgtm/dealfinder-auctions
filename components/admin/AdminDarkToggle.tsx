"use client";

import { useEffect, useState } from "react";

export const ADMIN_DARK_KEY = "df_admin_dark";

export function readAdminDark() {
  try {
    return localStorage.getItem(ADMIN_DARK_KEY) === "1";
  } catch {
    return false;
  }
}

export function applyAdminDark(on: boolean) {
  document.documentElement.classList.toggle("admin-dark", on);
  try {
    localStorage.setItem(ADMIN_DARK_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function AdminDarkToggle({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(document.documentElement.classList.contains("admin-dark") || readAdminDark());
  }, []);

  return (
    <button
      type="button"
      className={`comic-btn-invert !px-3 !py-1 !text-base ${className}`}
      onClick={() => {
        const next = !document.documentElement.classList.contains("admin-dark");
        applyAdminDark(next);
        setOn(next);
      }}
    >
      {on ? "Light desk" : "Dark desk"}
    </button>
  );
}
