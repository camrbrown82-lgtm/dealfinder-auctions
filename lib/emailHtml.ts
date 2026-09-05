export const EMAIL_LOGO_CID = "dealfinder-logo";

export function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function looksLikeHtml(body: string) {
  return /<\/?[a-z][\s\S]*>/i.test(body);
}

export function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function logoImgTag(src: string) {
  return `<img src="${src}" alt="DealFinder Auctions" width="140" style="display:block;margin:0 auto;border:4px solid #000000;background:#000000;" />`;
}

export function buildEmailHtml(body: string, logoSrc: string) {
  const logo = logoImgTag(logoSrc);
  const withToken = body.replaceAll("{{logo}}", logo);

  if (/<html/i.test(withToken)) {
    if (!/cid:dealfinder-logo|dealfinder-email-logo|\/api\/admin\/email-logo/i.test(withToken)) {
      return withToken.replace(
        /<body([^>]*)>/i,
        `<body$1><div class="dealfinder-email-logo" style="text-align:center;padding:16px;background:#000000;">${logo}</div>`,
      );
    }
    return withToken;
  }

  const inner = looksLikeHtml(withToken)
    ? withToken
    : escapeHtml(withToken).replaceAll("\n", "<br/>");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;background:#FFF7D1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#FFF7D1;font-family:Arial,Helvetica,sans-serif;color:#000000;">
    <tr>
      <td align="center" style="background:#000000;padding:20px;">
        ${logo}
      </td>
    </tr>
    <tr>
      <td style="padding:24px;border:4px solid #000000;background:#FFF7D1;font-size:16px;line-height:1.5;">
        ${inner}
      </td>
    </tr>
    <tr>
      <td style="background:#FF0000;color:#FFFFFF;padding:14px 24px;font-weight:bold;border:4px solid #000000;">
        DealFinder Auctions · Hammer down.
      </td>
    </tr>
  </table>
</body>
</html>`;
}
