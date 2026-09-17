"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AuthModal } from "@/components/AuthModal";
import { type BidderProfile } from "@/lib/profileTypes";

type AuthMode = "login" | "signup";

type BidderContextValue = {
  user: BidderProfile | null;
  ready: boolean;
  refresh: () => Promise<BidderProfile | null>;
  logout: () => Promise<void>;
  requestAuth: (after?: () => void | Promise<void>, mode?: AuthMode) => void;
};

const BidderContext = createContext<BidderContextValue | null>(null);

export function BidderProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<BidderProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signup");
  const [resumeBid, setResumeBid] = useState(false);
  const pendingRef = useRef<(() => void | Promise<void>) | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth", { credentials: "include" });
      const json = await response.json();
      const next = (json.user as BidderProfile | null) ?? null;
      setUser(next);
      setReady(true);
      return next;
    } catch {
      setUser(null);
      setReady(true);
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestAuth = useCallback((after?: () => void | Promise<void>, preferred?: AuthMode) => {
    pendingRef.current = after ?? null;
    setResumeBid(Boolean(after));
    setMode(preferred ?? "signup");
    setModalOpen(true);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setUser(null);
  }, []);

  async function finishAuth(next: BidderProfile) {
    setUser(next);
    setModalOpen(false);
    const action = pendingRef.current;
    pendingRef.current = null;
    if (action) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      await action();
    }
  }

  const value = useMemo(
    () => ({ user, ready, refresh, logout, requestAuth }),
    [user, ready, refresh, logout, requestAuth],
  );

  return (
    <BidderContext.Provider value={value}>
      {children}
      <AuthModal
        open={modalOpen}
        mode={mode}
        existing={user}
        resumeBid={resumeBid}
        onMode={setMode}
        onClose={() => {
          setModalOpen(false);
          pendingRef.current = null;
        }}
        onAuthenticated={finishAuth}
      />
    </BidderContext.Provider>
  );
}

export function useBidder() {
  const ctx = useContext(BidderContext);
  if (!ctx) throw new Error("useBidder must be used inside BidderProvider");
  return ctx;
}
