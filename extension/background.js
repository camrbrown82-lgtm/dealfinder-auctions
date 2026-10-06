const COMPOSE = {
  marketplace: "https://www.facebook.com/marketplace/create/item",
  youtube: "https://www.youtube.com/upload",
  facebook: "https://www.facebook.com/reels/create",
  tiktok: "https://www.tiktok.com/tiktokstudio/upload",
  instagram: "https://www.instagram.com/",
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "fetch-url") {
    fetchFile(message.url).then(sendResponse);
    return true;
  }
  if (message?.type === "open-post") {
    openPost(message.job).then(sendResponse);
    return true;
  }
  return false;
});

async function openPost(job) {
  const settings = await chrome.storage.local.get(["supabaseUrl", "supabaseAnonKey", "profileLabel"]);
  if (!String(settings.profileLabel || "").trim()) {
    await chrome.runtime.openOptionsPage();
    return { ok: false, reason: "profile" };
  }
  if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
    await chrome.runtime.openOptionsPage();
    return { ok: false, reason: "supabase" };
  }
  const composeUrl = COMPOSE[job?.platform];
  if (!composeUrl) return { ok: false, reason: "platform" };
  await chrome.storage.session.set({
    pendingPost: {
      ...job,
      startedAt: Date.now(),
      photosAttached: false,
      done: false,
    },
  });
  await chrome.tabs.create({ url: composeUrl, active: true });
  return { ok: true };
}

async function fetchFile(url) {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const path = new URL(url).pathname.split("/").pop() || "media";
    return {
      ok: response.ok,
      contentType: response.headers.get("content-type") || "application/octet-stream",
      buffer,
      name: path.split("?")[0] || "media",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not download the file." };
  }
}
