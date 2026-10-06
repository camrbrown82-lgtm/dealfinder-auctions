if (location.pathname.startsWith("/admin")) {
  window.addEventListener("dealfinder-poster-config", (event) => {
    const detail = event.detail || {};
    const supabaseUrl = String(detail.supabaseUrl || "").replace(/\/$/, "");
    const supabaseAnonKey = String(detail.supabaseAnonKey || "").trim();
    if (!supabaseUrl.includes("supabase.co") || supabaseAnonKey.length < 20) return;
    chrome.storage.local.get(["supabaseUrl", "supabaseAnonKey"], (current) => {
      if (current.supabaseUrl && current.supabaseAnonKey) return;
      chrome.storage.local.set({ supabaseUrl, supabaseAnonKey });
    });
  });

  window.addEventListener("dealfinder-poster-post", (event) => {
    const job = event.detail;
    chrome.runtime.sendMessage({ type: "open-post", job }, (response) => {
      const failed = chrome.runtime.lastError;
      window.dispatchEvent(
        new CustomEvent("dealfinder-poster-acked", {
          detail: failed ? { ok: false, reason: "missing" } : response || { ok: false },
        }),
      );
    });
  });

  window.dispatchEvent(new Event("dealfinder-poster-ping"));
}
