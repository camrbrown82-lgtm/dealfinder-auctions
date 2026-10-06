import type { PosterJob } from "@/lib/socialPost";

export type PosterResult = "sent" | "missing" | "profile" | "supabase";

export function queuePoster(job: PosterJob): Promise<PosterResult> {
  if (typeof window === "undefined") return Promise.resolve("missing");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PosterResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("dealfinder-poster-acked", onAck);
      resolve(result);
    };
    const onAck = (event: Event) => {
      const detail = (event as CustomEvent<{ ok?: boolean; reason?: string }>).detail;
      if (detail?.ok) finish("sent");
      else if (detail?.reason === "profile") finish("profile");
      else if (detail?.reason === "supabase") finish("supabase");
      else finish("missing");
    };
    window.addEventListener("dealfinder-poster-acked", onAck);
    window.dispatchEvent(new CustomEvent("dealfinder-poster-post", { detail: job }));
    window.setTimeout(() => finish("missing"), 2000);
  });
}
