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
  return `<img src="${src}" alt="DealFinder Auctions" width="160" height="auto" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;" />`;
}

export function buildSimpleEmailHtml(body: string, logoSrc: string) {
  const inner = looksLikeHtml(body) ? body.replaceAll("{{logo}}", "") : escapeHtml(body).replaceAll("\n", "<br/>");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DealFinder Auctions</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;font-family:Arial,Helvetica,sans-serif;color:#111111;font-size:16px;line-height:1.5;">
          <tr>
            <td align="center" style="padding:0 0 20px;">
              ${logoImgTag(logoSrc)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 8px 8px;">
              ${inner}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;font-size:13px;line-height:1.4;color:#555555;border-top:1px solid #dddddd;">
              DealFinder Auctions<br/>
              529 Gateway Rd NE, Airdrie, AB T4B 0J6<br/>
              +1 403-512-3220
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
