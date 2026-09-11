import { getEmailLogoDataUrl, getEmailTemplates } from "@/lib/demoEmailStore";
import { logoFromDataUrl, readSiteLogoFile } from "@/lib/emailBrand";
import { mergeEmailTemplates, type EmailTemplate } from "@/lib/emailTemplates";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export async function loadLiveEmailTemplates(): Promise<EmailTemplate[]> {
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from("email_templates").select("*");
    if (!error && data) return mergeEmailTemplates(data);
  }
  return getEmailTemplates();
}

export async function resolveEmailLogo() {
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase
      .from("email_settings")
      .select("logo_data_url")
      .eq("id", "default")
      .maybeSingle();
    if (data?.logo_data_url) {
      const asset = logoFromDataUrl(data.logo_data_url);
      if (asset) return asset;
    }
  }
  const memory = getEmailLogoDataUrl();
  if (memory) {
    const asset = logoFromDataUrl(memory);
    if (asset) return asset;
  }
  return readSiteLogoFile();
}
