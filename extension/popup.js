import { clipPost, isListedBuyNow, listingJob, loadSettings, settingsReady, supabaseGet } from "./shared.js";

const list = document.getElementById("list");
const status = document.getElementById("status");
const profile = document.getElementById("profile");
let mode = "listings";

document.getElementById("options").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById("tab-listings").addEventListener("click", () => switchMode("listings"));
document.getElementById("tab-clips").addEventListener("click", () => switchMode("clips"));

function switchMode(next) {
  mode = next;
  document.getElementById("tab-listings").classList.toggle("on", next === "listings");
  document.getElementById("tab-clips").classList.toggle("on", next === "clips");
  void load();
}

function card(title, meta, buttons) {
  const article = document.createElement("article");
  article.className = "card";
  const heading = document.createElement("p");
  heading.textContent = meta ? `${title} · ${meta}` : title;
  const row = document.createElement("div");
  row.className = "row";
  for (const button of buttons) row.appendChild(button);
  article.append(heading, row);
  return article;
}

function postButton(label, job) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary";
  button.textContent = label;
  button.addEventListener("click", async () => {
    button.disabled = true;
    const result = await chrome.runtime.sendMessage({ type: "open-post", job });
    button.disabled = false;
    if (result?.ok) status.textContent = "Form opened. Check it, then press the site's own Post button.";
    else if (result?.reason === "profile") status.textContent = "Connect the personal profile in options first.";
    else if (result?.reason === "supabase") status.textContent = "Connect Supabase in options first.";
    else status.textContent = "Could not open the form.";
  });
  return button;
}

async function load() {
  list.replaceChildren();
  status.textContent = "Loading from Supabase…";
  const settings = await loadSettings();
  profile.textContent = settings.profileLabel
    ? `Posting with ${settings.profileLabel}`
    : "No personal profile connected.";
  if (!settingsReady(settings)) {
    status.textContent = "Connect Supabase and name the personal profile in options.";
    return;
  }
  try {
    if (mode === "listings") {
      const rows = await supabaseGet(
        "lots?select=id,title,description,slug,category,image_url,image_urls,buy_now_price,reserve_price,listing_grade,status,sale_channel,buy_now_status,paid_at,high_bidder,high_bidder_id,lot_number&order=ends_at.desc&limit=80",
      );
      const listed = (Array.isArray(rows) ? rows : []).filter(isListedBuyNow).slice(0, 24);
      status.textContent = listed.length ? "" : "No Buy Now lots are listed.";
      for (const row of listed) {
        const price = Number(row.buy_now_price ?? row.reserve_price ?? 0);
        list.appendChild(
          card(row.title, price > 0 ? `$${price.toFixed(2)}` : "", [postButton("Fill Marketplace form", listingJob(row))]),
        );
      }
      return;
    }
    const clips = await supabaseGet("floor_clips?select=id,title,public_url,created_at&order=created_at.desc&limit=24");
    const rows = Array.isArray(clips) ? clips : [];
    status.textContent = rows.length ? "" : "No floor clips yet.";
    for (const row of rows) {
      list.appendChild(
        card(row.title, "", [
          postButton("YouTube", clipPost("youtube", row)),
          postButton("Facebook", clipPost("facebook", row)),
          postButton("TikTok", clipPost("tiktok", row)),
          postButton("Instagram", clipPost("instagram", row)),
        ]),
      );
    }
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not read Supabase.";
  }
}

void load();
