const HOSTS = {
  marketplace: ["facebook.com"],
  facebook: ["facebook.com"],
  instagram: ["instagram.com"],
  youtube: ["youtube.com"],
  tiktok: ["tiktok.com"],
};

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function hostOk(job) {
  const host = location.hostname;
  const allowed = HOSTS[job.platform] || [];
  if (!allowed.some((name) => host === name || host.endsWith(`.${name}`))) return false;
  if (job.platform === "marketplace") return location.pathname.includes("/marketplace/create");
  if (job.platform === "facebook") return location.pathname.includes("/reels");
  if (job.platform === "youtube") return location.pathname.includes("/upload") || host.startsWith("studio.");
  return true;
}

function loginWall() {
  if (/\/login|checkpoint|signin/i.test(location.href)) return true;
  const title = document.querySelector('[aria-label="Title"], input[type="file"], #title-textarea');
  if (title) return false;
  const text = (document.body?.innerText || "").slice(0, 800);
  return /log in to (facebook|instagram|tiktok|youtube)|sign in to continue/i.test(text);
}

function banner(message) {
  document.getElementById("dealfinder-poster-banner")?.remove();
  const node = document.createElement("div");
  node.id = "dealfinder-poster-banner";
  node.textContent = message;
  node.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "max-width:360px",
    "padding:12px 14px",
    "background:#FFF7D1",
    "color:#111",
    "border:4px solid #111",
    "font:14px/1.4 Arial, sans-serif",
    "box-shadow:4px 4px 0 #111",
  ].join(";");
  document.documentElement.appendChild(node);
}

function setNativeValue(field, value) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillEditable(field, value) {
  field.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(field);
  selection?.removeAllRanges();
  selection?.addRange(range);
  const inserted = document.execCommand("insertText", false, value);
  if (!inserted || !(field.textContent || "").includes(value.slice(0, 16))) {
    field.textContent = value;
    field.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  }
}

function writeField(field, value) {
  if (!field || !value) return false;
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) setNativeValue(field, value);
  else fillEditable(field, value);
  return true;
}

function byLabel(label) {
  const wanted = label.toLowerCase();
  const labelled = document.querySelector(`[aria-label="${label}"], [placeholder="${label}"]`);
  if (labelled) return labelled;
  for (const node of document.querySelectorAll("label, span")) {
    const own = (node.childNodes[0]?.textContent || "").trim().toLowerCase();
    if (own !== wanted) continue;
    const root = node.closest("label") || node.parentElement;
    const field = root?.querySelector("input, textarea, [contenteditable='true']");
    if (field) return field;
  }
  return null;
}

function fileInput(kind) {
  const inputs = [...document.querySelectorAll('input[type="file"]')];
  return (
    inputs.find((input) => {
      const accept = (input.getAttribute("accept") || "").toLowerCase();
      if (!accept) return true;
      if (kind === "listing") return /image|video|\*/.test(accept);
      return /video|\*/.test(accept);
    }) ||
    inputs[0] ||
    null
  );
}

async function loadOne(url) {
  try {
    const direct = await fetch(url);
    if (direct.ok) {
      const blob = await direct.blob();
      const name = new URL(url).pathname.split("/").pop() || "media";
      return new File([blob], name.split("?")[0] || "media", { type: blob.type || "application/octet-stream" });
    }
  } catch {
    // The page origin blocked the download. The extension background can fetch it.
  }
  const fetched = await chrome.runtime.sendMessage({ type: "fetch-url", url });
  if (!fetched?.ok || !fetched.buffer) return null;
  const type = fetched.contentType || "application/octet-stream";
  return new File([fetched.buffer], fetched.name || "media", { type });
}

async function attachFiles(job) {
  const urls = job.kind === "clip" ? [job.videoUrl].filter(Boolean) : job.imageUrls || [];
  if (!urls.length) return false;
  const input = fileInput(job.kind);
  if (!input) return false;
  const files = (await Promise.all(urls.slice(0, 10).map((url) => loadOne(url)))).filter(Boolean);
  if (!files.length) return false;
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function clickExact(text) {
  const wanted = text.toLowerCase();
  const node = [...document.querySelectorAll("button, [role='button'], [role='radio'], span, div")].find((el) => {
    if (!el.getClientRects().length) return false;
    const label = (el.getAttribute("aria-label") || el.innerText || "").trim().toLowerCase();
    return label === wanted;
  });
  if (!node) return false;
  node.click();
  return true;
}

function clickInstagramNext() {
  if (!location.hostname.includes("instagram.com")) return false;
  return clickExact("Next");
}

async function chooseCategory(category) {
  const query = {
    Comics: "Collectibles",
    Toys: "Toys",
    Vinyl: "Vinyl",
    Art: "Art",
    Oddities: "Miscellaneous",
  }[category] || category || "Miscellaneous";
  const opener = [...document.querySelectorAll("[role='button'], [role='combobox'], button, span")].find((el) => {
    const text = (el.innerText || "").trim();
    return text === "Category" && el.getClientRects().length;
  });
  opener?.click();
  await sleep(400);
  const search = document.querySelector("input[aria-label*='Category'], input[placeholder*='Search'], input[type='search']");
  if (search instanceof HTMLInputElement) {
    setNativeValue(search, query);
    await sleep(700);
  }
  const option = [...document.querySelectorAll("[role='option'], [role='menuitem'], span")].find((el) => {
    const text = (el.innerText || "").trim();
    return text && text.toLowerCase().includes(query.toLowerCase()) && el.getClientRects().length && text.length < 80;
  });
  option?.click();
}

async function chooseLocation() {
  const field = byLabel("Location");
  if (!(field instanceof HTMLInputElement) || field.value.trim()) return;
  setNativeValue(field, "Airdrie, Alberta");
  await sleep(700);
  const option = [...document.querySelectorAll("[role='option'], li")].find((el) =>
    /airdrie/i.test(el.innerText || "") && el.getClientRects().length,
  );
  option?.click();
}

function fillMarketplace(job) {
  const title = writeField(byLabel("Title"), job.title);
  writeField(byLabel("Price"), job.price || "");
  writeField(byLabel("Description"), job.text);
  const condition = job.condition === "new" ? "New" : "Used";
  clickExact(condition);
  return title;
}

function fillYouTube(job) {
  const title = document.querySelector("#title-textarea #textbox, ytcp-social-suggestions-textbox #textbox");
  const description = document.querySelector("#description-textarea #textbox");
  if (title) fillEditable(title, job.title);
  if (description) fillEditable(description, job.text);
  return Boolean(title);
}

function fillCaption(job) {
  const labelled = byLabel("Caption") || byLabel("Describe your reel") || byLabel("Write a caption");
  if (labelled) return writeField(labelled, job.text);
  const box = [...document.querySelectorAll("[contenteditable='true'], textarea")].find((el) => {
    const label = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("placeholder") || ""}`.toLowerCase();
    return /caption|description|say something|write/.test(label);
  });
  return writeField(box, job.text);
}

async function run(job) {
  if (loginWall()) {
    banner("Sign in on this Chrome profile with the personal account you post from, then press the DealFinder button again.");
    return;
  }
  const deadline = Date.now() + 45000;
  let textSet = false;
  let categoryTried = false;
  let nextClicks = 0;
  while (Date.now() < deadline && !textSet) {
    if (!job.photosAttached) {
      const attached = await attachFiles(job);
      if (attached) {
        job.photosAttached = true;
        await chrome.storage.session.set({ pendingPost: job });
        await sleep(800);
      }
    }
    if (job.platform === "marketplace") {
      textSet = fillMarketplace(job);
      if (!categoryTried && textSet) {
        categoryTried = true;
        await chooseCategory(job.category);
        await chooseLocation();
      }
    } else if (job.platform === "youtube") {
      textSet = fillYouTube(job);
    } else {
      textSet = fillCaption(job);
      if (!textSet && nextClicks < 3 && clickInstagramNext()) {
        nextClicks += 1;
        await sleep(900);
      }
    }
    if (!textSet) await sleep(700);
  }
  if (!textSet && !job.photosAttached) {
    banner("DealFinder could not find the upload form yet. Stay on this page, or press the button on the desk again.");
    return;
  }
  job.done = true;
  await chrome.storage.session.set({ pendingPost: job });
  const profile = await chrome.storage.local.get("profileLabel");
  const who = String(profile.profileLabel || "this Chrome profile").trim();
  banner(
    textSet
      ? `Filled from Supabase for ${who}. Check the form, then press this site's own Post or Publish button.`
      : `The file is attached for ${who}. Finish any empty fields, then press this site's own Post button.`,
  );
}

let running = false;

async function start() {
  if (running) return;
  const stored = await chrome.storage.session.get("pendingPost");
  const job = stored.pendingPost;
  if (!job || job.done) return;
  if (!hostOk(job)) return;
  if (Date.now() - Number(job.startedAt || 0) > 3 * 60 * 1000) {
    await chrome.storage.session.remove("pendingPost");
    return;
  }
  running = true;
  try {
    await run(job);
  } finally {
    running = false;
  }
}

void start();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.pendingPost?.newValue && !changes.pendingPost.newValue.done) void start();
});
