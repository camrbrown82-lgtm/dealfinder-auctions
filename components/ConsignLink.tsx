"use client";

import { useRouter } from "next/navigation";
import { useBidder } from "@/components/BidderProvider";

export function ConsignLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, ready, refresh, requestAuth } = useBidder();

  async function go() {
    const session = user ?? (ready ? null : await refresh());
    if (session) {
      router.push("/consignor");
      return;
    }
    requestAuth(() => {
      router.push("/consignor");
    }, "login");
  }

  return (
    <button type="button" className={className} onClick={() => void go()}>
      {children}
    </button>
  );
}
