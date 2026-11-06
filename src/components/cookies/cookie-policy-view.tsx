"use client";

import { COOKIE_POLICY_VERSION } from "@/lib/cookie-notice";
import { useT } from "@/lib/i18n";

type Item = {
  name: string;
  purpose: string;
  category: string;
  /** What the value actually holds. */
  contains: string;
  retention: string;
  created: string;
  removed: string;
};

const NECESSARY = "Strictly necessary";
const REMEMBER = "Functional (supports your “Remember me” choice)";
const PREFERENCE = "Functional (a preference you chose)";

// Verified against the code (see the audit table in PROJECT_STATUS.md §5a-2):
// lib/supabase/{cookies,proxy,server}.ts + @supabase/ssr defaults, app/api/auth/{login,logout,guest}/route.ts,
// app/auth/confirm/route.ts, lib/auth/guest.ts, lib/i18n/index.ts, lib/theme/{index,script}.ts,
// components/auth/login-form.tsx, lib/party/party-store.ts, lib/cookie-notice.ts.
const NECESSARY_COOKIES: Item[] = [
  {
    name: "sb-<project>-auth-token (may be split into .0, .1 …)",
    purpose: "Keeps you signed in. The server reads it on every request to recognise your account.",
    category: NECESSARY,
    contains: "Your session: an access token and a refresh token, plus account details such as your user ID and email address. This is personal data. It is stored as encoded text, not encrypted, so keep your device and browser profile private.",
    retention: "Until you close the browser. If you ticked “Remember me”, up to 400 days, which can restart when your session is refreshed. The sign-in service may end the session sooner.",
    created: "When you sign in, and when you sign in through an emailed confirmation or password-reset link. It is also rewritten when your session is refreshed.",
    removed: "When you sign out, or when you delete it in your browser.",
  },
  {
    name: "aion2_guest",
    purpose: "Lets you use Character Lookup as a guest without an account.",
    category: NECESSARY,
    contains: "A signed token with only a “guest” marker and an expiry time. It holds no user ID, email, name or other personal identifier, and it is the same kind of token for every guest.",
    retention: "8 hours",
    created: "When you choose “Continue as Guest”.",
    removed: "When you press “Back to login” or sign in, or when you delete it in your browser.",
  },
];

const FUNCTIONAL_COOKIES: Item[] = [
  {
    name: "aion2_remember",
    purpose: "Remembers whether you ticked “Remember me”, so your session cookie keeps the lifetime you chose when it is refreshed. The site still works without it, but your sign-in would then end when you close the browser.",
    category: REMEMBER,
    contains: "Only “1” (remember) or “0” (do not remember). No personal data.",
    retention: "Until you close the browser, or 400 days if you ticked “Remember me”.",
    created: "When you sign in with your email and password (not when you sign in through an emailed link).",
    removed: "When you sign out, or when you delete it in your browser.",
  },
  {
    name: "aion2_lang",
    purpose: "Stores the display language you picked. The server does not currently read it, and the same choice is kept in browser storage (aion2-gc:lang), so the site works without it.",
    category: PREFERENCE,
    contains: "Only “en” or “th”. No personal data.",
    retention: "1 year",
    created: "Only when you change the language with the language switcher.",
    removed: "Not removed by signing out. Delete it in your browser.",
  },
];

const STORAGE: Item[] = [
  {
    name: "aion2-gc:theme",
    purpose: "Your light or dark theme choice. Without it the site follows your device setting.",
    category: PREFERENCE,
    contains: "Only “light” or “dark”.",
    retention: "No expiry. It stays until you delete it.",
    created: "Only when you use the theme button. Updated each time you switch.",
    removed: "Not removed by signing out. Delete it in your browser.",
  },
  {
    name: "aion2-gc:lang",
    purpose: "Your display language choice. The site reads it when a page opens.",
    category: PREFERENCE,
    contains: "Only “en” or “th”.",
    retention: "No expiry. It stays until you delete it.",
    created: "Only when you change the language. Updated each time you switch.",
    removed: "Not removed by signing out. Delete it in your browser.",
  },
  {
    name: "aion2-gc:remembered-email",
    purpose: "Pre-fills the email field on the sign-in form and re-ticks “Remember me”.",
    category: REMEMBER,
    contains: "Your email address, in plain text. This is personal data and is stored on your device only, not in a cookie.",
    retention: "No expiry. It stays until your next sign-in with “Remember me” unticked, or until you delete it.",
    created: "After a successful sign-in with “Remember me” ticked. Updated at each such sign-in.",
    removed: "At your next successful sign-in with “Remember me” unticked, or when you delete it in your browser. Signing out does not remove it. On a shared computer, untick “Remember me” or delete it.",
  },
  {
    name: "aion2-gc:active-preset",
    purpose: "Remembers which party preset you had open in Party Builder.",
    category: PREFERENCE,
    contains: "The internal ID of one preset. No party or member data.",
    retention: "No expiry. It stays until you delete it.",
    created: "When you open, create or duplicate a preset in Party Builder.",
    removed: "Not removed by signing out. Delete it in your browser.",
  },
  {
    name: "aion2-gc:cookie-notice",
    purpose: "Remembers that you dismissed the cookie notice, so it is not shown again until this policy materially changes.",
    category: PREFERENCE,
    contains: "The policy version and the date and time you pressed “Understood”.",
    retention: "No expiry. It stays until you delete it.",
    created: "When you press “Understood”.",
    removed: "Not removed by signing out. Delete it in your browser (the notice then appears again).",
  },
  {
    name: "aion2.lookup.region",
    purpose: "Character Lookup: remembers the region you last picked, so your next search starts with it.",
    category: PREFERENCE,
    contains: "One region code. No personal data.",
    retention: "No expiry. It stays until you delete it.",
    created: "When you pick a region on the Character Lookup page. Picking “All regions” removes it.",
    removed: "When you pick “All regions”. Not removed by signing out. You can also delete it in your browser.",
  },
  {
    name: "aion2.map.filters.v1",
    purpose: "Interactive Map: remembers which marker types and individual monsters you switched on or off.",
    category: PREFERENCE,
    contains: "Marker type and monster IDs from the game data, with true/false. No personal data.",
    retention: "No expiry. It stays until you delete it.",
    created: "When you change a marker filter on the Map page.",
    removed: "Not removed by signing out. Delete it in your browser.",
  },
  {
    name: "aion2.map.done.v1.<map>",
    purpose: "Interactive Map: remembers which collectibles you marked as done on each map (one entry per map).",
    category: PREFERENCE,
    contains: "A list of spawn location IDs from the game data. No personal data.",
    retention: "No expiry. It stays until you delete it.",
    created: "When you press “Mark as done” on a collectible.",
    removed: "Not removed by signing out. Delete it in your browser.",
  },
];

function Card({ item }: { item: Item }) {
  const t = useT();
  const rows: [string, string][] = [
    ["Purpose", item.purpose],
    ["Category", item.category],
    ["Contains", item.contains],
    ["Retention", item.retention],
    ["Created", item.created],
    ["Removed", item.removed],
  ];
  return (
    <li className="rounded-lg border border-steel/20 bg-surface/60 p-4">
      <p className="font-mono text-sm font-semibold break-all text-gold-text">{item.name}</p>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[7rem_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-3xs font-semibold tracking-wider text-subtle uppercase sm:pt-0.5">{t(k)}</dt>
            <dd className="leading-relaxed text-foreground">{t(v)}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

const h2 = "font-heading text-sm font-semibold tracking-[0.12em] text-foreground";
const h3 = "text-3xs font-semibold tracking-[0.18em] text-brand uppercase";
const p = "text-xs leading-relaxed text-subtle";

export function CookiePolicyView() {
  const t = useT();
  return (
    <div className="space-y-6 text-left" data-testid="cookie-policy">
      <section className="space-y-2">
        <h2 className={h2}>{t("What are cookies?")}</h2>
        <p className={p}>
          {t("Cookies are small text files a website stores in your browser. Browser storage (localStorage) is a separate place in your browser that works in a similar way but is not sent to the server with each request. Websites use both to keep you signed in and to remember choices you have made.")}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>{t("What this website uses")}</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-subtle">
          <li>{t("Strictly necessary cookies, needed to sign you in or to run a guest session you asked for.")}</li>
          <li>{t("Functional cookies and browser storage, which remember choices you make (language, theme, “Remember me”, your open party preset, Interactive Map marker filters, name language and items marked as done, and that you dismissed the cookie notice). They are created only when you use the related feature, and the website still works if you delete them.")}</li>
          <li>{t("We do not use analytics, advertising, marketing or tracking cookies, and we load no third-party analytics or tracking scripts.")}</li>
        </ul>
        <p className={p}>
          {t("Because everything above is either needed for a service you asked for or a preference you chose yourself, we do not currently show accept or reject options. You can still delete any of it at any time (see below).")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2}>{t("Cookies")}</h2>
        <h3 className={h3}>{t("Strictly necessary")}</h3>
        <ul className="space-y-3">{NECESSARY_COOKIES.map((c) => <Card key={c.name} item={c} />)}</ul>
        <h3 className={h3}>{t("Functional")}</h3>
        <ul className="space-y-3">{FUNCTIONAL_COOKIES.map((c) => <Card key={c.name} item={c} />)}</ul>
        <p className={p}>{t("All cookies are first-party: they are set by this website. The sign-in session is issued by Supabase Auth, the sign-in service we use, but the cookie belongs to this website, and no cookie is set for or sent to an advertiser or analytics provider.")}</p>
      </section>

      <section className="space-y-3">
        <h2 className={h2}>{t("Browser storage (localStorage)")}</h2>
        <p className={p}>{t("These entries stay in your browser and are not sent to the server by the browser. They are all functional.")}</p>
        <ul className="space-y-3">{STORAGE.map((c) => <Card key={c.name} item={c} />)}</ul>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>{t("Content from other websites")}</h2>
        <p className={p}>
          {t("Item icons and character images shown on character pages are loaded by your browser directly from the address supplied by the AION2 character data service (we expect NCSOFT's image servers, but the exact hosts can change). Those servers can see your IP address and browser details and may set their own cookies, which we do not control and have not verified. Links to other websites, for example to guides, open sites with their own policies. Website fonts are served from this website itself.")}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>{t("Clearing cookies and browser storage")}</h2>
        <p className={p}>{t("Cookies and localStorage are cleared separately, so removing one does not remove the other.")}</p>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-subtle">
          <li>{t("Signing out removes the sign-in cookie, aion2_remember and aion2_guest. It does not remove aion2_lang or any localStorage entry.")}</li>
          <li>{t("Cookies: in your browser, open the settings for this site (usually the icon beside the address bar, or Settings → Privacy → Cookies and site data) and delete the cookies listed above, or clear this site's cookies.")}</li>
          <li>{t("localStorage: it is cleared with “Site data” or “Storage” in the same settings, or in the developer tools under Application (Chrome, Edge) or Storage (Firefox) → Local Storage. Clearing cookies alone does not remove it.")}</li>
          <li>{t("You can change the language and theme at any time with the buttons at the top of the page. To forget your email on this device, untick “Remember me” at your next sign-in or delete aion2-gc:remembered-email.")}</li>
          <li>{t("Deleting the necessary cookies signs you out or ends your guest session. Deleting the others only resets the matching preference.")}</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>{t("If this changes")}</h2>
        <p className={p}>
          {t("If we ever add optional cookies, such as analytics, we will ask for your consent first, keep them off until you agree, and let you withdraw consent at any time. We will also update this page and show the notice again.")}
        </p>
        <p className={p}>
          {t("This page describes how the website behaves today. It is not legal advice, and it does not by itself make the website compliant with the Personal Data Protection Act (PDPA).")}
        </p>
      </section>

      <p className="border-t border-steel/15 pt-3 text-3xs text-subtle">
        {t("Policy version")}: {COOKIE_POLICY_VERSION}
      </p>
    </div>
  );
}
