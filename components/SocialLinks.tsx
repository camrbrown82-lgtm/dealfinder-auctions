import { SITE } from "@/lib/site";

const iconClass = "h-7 w-7 fill-current";

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} aria-hidden>
      <path d="M14.5 3c.4 2.4 1.8 4.2 4.2 4.6v3.1c-1.5 0-2.9-.5-4.1-1.3v6.4c0 3.3-2.6 6-5.9 6.2-3.5.2-6.4-2.6-6.4-6.1 0-3.4 2.8-6.1 6.2-6.1.4 0 .8 0 1.2.1v3.2c-.4-.2-.8-.3-1.2-.3-1.7 0-3.1 1.4-3.1 3.1s1.4 3.1 3.1 3.1 3.1-1.4 3.1-3.1V3h2.9Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} aria-hidden>
      <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm10 2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm-5 3.2A3.8 3.8 0 1 1 8.2 12 3.8 3.8 0 0 1 12 8.2Zm0 2A1.8 1.8 0 1 0 13.8 12 1.8 1.8 0 0 0 12 10.2ZM17.2 6.6a1 1 0 1 1-1 1 1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} aria-hidden>
      <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.6l.4-3H13v-2c0-.6.4-1 1-1Z" />
    </svg>
  );
}

const networks = [
  { key: "tiktok" as const, label: "TikTok", Icon: TikTokIcon },
  { key: "instagram" as const, label: "Instagram", Icon: InstagramIcon },
  { key: "facebook" as const, label: "Facebook", Icon: FacebookIcon },
];

export function SocialLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      {networks.map(({ key, label, Icon }) => {
        const href = SITE.social[key];
        const className =
          "inline-flex h-12 w-12 items-center justify-center border-4 border-brand-ink bg-brand-cream text-brand-ink shadow-comic-sm transition hover:-translate-y-0.5 hover:bg-white";
        if (href) {
          return (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Follow DealFinder on ${label}`}
              className={className}
            >
              <Icon />
            </a>
          );
        }
        return (
          <span
            key={key}
            title={`${label} link coming soon`}
            aria-label={`${label} — add your profile URL later`}
            className={className}
          >
            <Icon />
          </span>
        );
      })}
    </div>
  );
}
