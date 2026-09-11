import {
  DEFAULT_EMAIL_TEMPLATES,
  mergeEmailTemplates,
  type EmailTemplate,
  type EmailTemplateId,
} from "@/lib/emailTemplates";

declare global {
  // eslint-disable-next-line no-var
  var __dealfinderEmailTemplates: EmailTemplate[] | undefined;
  // eslint-disable-next-line no-var
  var __dealfinderOutbox: Array<Record<string, string>> | undefined;
  // eslint-disable-next-line no-var
  var __dealfinderEmailLogo: string | null | undefined;
}

export function getEmailTemplates() {
  if (!globalThis.__dealfinderEmailTemplates) {
    globalThis.__dealfinderEmailTemplates = DEFAULT_EMAIL_TEMPLATES.map((row) => ({ ...row }));
  }
  return globalThis.__dealfinderEmailTemplates;
}

export function upsertEmailTemplate(
  id: EmailTemplateId,
  subject: string,
  body: string,
  name?: string,
) {
  const list = getEmailTemplates();
  const row = list.find((item) => item.id === id);
  if (row) {
    row.subject = subject;
    row.body = body;
    if (name?.trim()) row.name = name.trim();
    return row;
  }
  const created: EmailTemplate = {
    id,
    name: name?.trim() || id,
    subject,
    body,
  };
  list.push(created);
  return created;
}

export function getEmailLogoDataUrl() {
  return globalThis.__dealfinderEmailLogo ?? null;
}

export function setEmailLogoDataUrl(dataUrl: string | null) {
  globalThis.__dealfinderEmailLogo = dataUrl;
}

export function getOutbox() {
  if (!globalThis.__dealfinderOutbox) globalThis.__dealfinderOutbox = [];
  return globalThis.__dealfinderOutbox;
}

export { mergeEmailTemplates };
