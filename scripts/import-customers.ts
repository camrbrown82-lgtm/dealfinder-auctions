import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
  .replace(/\/+$/, "")
  .replace(/\/rest\/v1$/i, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Add your existing customer array here
const existingCustomers = [
  { email: "john@example.com", full_name: "John Doe", phone: "403-555-0199" },
  { email: "sarah@example.com", full_name: "Sarah Smith", phone: "403-555-0188" },
];

async function importCustomers() {
  for (const customer of existingCustomers) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: customer.email,
      email_confirm: true,
      user_metadata: {
        full_name: customer.full_name,
        phone: customer.phone,
      },
    });

    if (error) {
      console.error(`Error importing ${customer.email}:`, error.message);
      continue;
    }

    const userId = data.user.id;
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: customer.email,
      full_name: customer.full_name,
      phone: customer.phone,
    });

    if (profileError) {
      console.error(
        `Auth user created for ${customer.email}, but profile write failed:`,
        profileError.message,
      );
      continue;
    }

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: customer.email,
      });

    if (linkError) {
      console.log(
        `Successfully imported ${customer.email} (ID: ${userId}) — password reset link failed: ${linkError.message}`,
      );
      continue;
    }

    console.log(`Successfully imported ${customer.email} (ID: ${userId})`);
    console.log(`  Reset link: ${linkData.properties?.action_link ?? "(none)"}`);
  }
}

importCustomers().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
