import { loadSettings, supabaseGet } from "./shared.js";

const form = document.getElementById("form");
const status = document.getElementById("status");

const saved = await loadSettings();
document.getElementById("profile").value = saved.profileLabel || "";
document.getElementById("url").value = saved.supabaseUrl || "";
document.getElementById("key").value = saved.supabaseAnonKey || "";

function isServiceRole(key) {
  const parts = key.split(".");
  if (parts.length < 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const profileLabel = document.getElementById("profile").value.trim();
  const supabaseUrl = document.getElementById("url").value.trim().replace(/\/$/, "");
  const supabaseAnonKey = document.getElementById("key").value.trim();
  if (!supabaseUrl.includes("supabase.co")) {
    status.textContent = "The Supabase URL should look like https://your-project.supabase.co.";
    return;
  }
  if (supabaseAnonKey.length < 20 || isServiceRole(supabaseAnonKey)) {
    status.textContent = "Use the public anon key. Leave the service role key on the server.";
    return;
  }
  await chrome.storage.local.set({ profileLabel, supabaseUrl, supabaseAnonKey });
  status.textContent = `Connected. Posts from this Chrome profile go out as ${profileLabel}.`;
});

document.getElementById("test").addEventListener("click", async () => {
  status.textContent = "Checking Supabase…";
  const profileLabel = document.getElementById("profile").value.trim();
  const supabaseUrl = document.getElementById("url").value.trim().replace(/\/$/, "");
  const supabaseAnonKey = document.getElementById("key").value.trim();
  await chrome.storage.local.set({ profileLabel, supabaseUrl, supabaseAnonKey });
  try {
    const rows = await supabaseGet("lots?select=id&limit=1");
    status.textContent = Array.isArray(rows) ? "Supabase answered. The connection is saved." : "Supabase answered.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Supabase did not answer.";
  }
});
