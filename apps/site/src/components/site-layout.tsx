import { For } from "solid-js";
import { Link, Outlet } from "@tanstack/solid-router";
import { Button } from "@asciimark/ui/components/ui/button.tsx";
import * as m from "@asciimark/i18n";
import { currentLocale, locales, switchLocale, useLocale } from "@asciimark/i18n/solid";

function GithubIcon() {
  return (
    <svg
      aria-hidden="true"
      class="site-header-button-icon"
      fill="none"
      height="16"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

// Each navigation item carries a locale-resolving thunk instead of
// a string key. Static references like `m.site_nav_home` let
// Rollup tree-shake the i18n catalog — a `messages[key]()` lookup
// would retain every message reachable via the catalog's index
// module (worth ~13 KB gzip on the site bundle). Guide and Privacy
// keep their English long-form copy per DJA-28 scope; only the nav
// label is localized.
const navigationItems = [
  { href: "/", label: m.site_nav_home },
  { href: "/guide", label: m.site_nav_guide },
  { href: "/privacy", label: m.site_nav_privacy },
] as const;

// Display labels for each shipping locale. Native names read better
// than two-letter codes inside the picker.
const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  "pt-BR": "Português",
  es: "Español",
};

export function SiteLayout() {
  return (
    <div class="site-shell">
      <header class="site-header">
        <div class="site-header-inner">
          <Link class="site-logo" to="/">
            <img alt="AsciiMark logo" class="site-logo-mark" src="/asciimark-logo.svg" />
            <span>AsciiMark</span>
          </Link>
          <nav class="site-nav" aria-label="Main navigation">
            <For each={navigationItems}>
              {(item) => (
                <Link
                  to={item.href}
                  class="site-nav-item"
                  activeProps={{ class: "site-nav-item site-nav-item-active", "aria-current": "page" }}
                >
                  {(useLocale(), item.label())}
                </Link>
              )}
            </For>
          </nav>
          <label class="site-locale-picker">
            <span class="visually-hidden">
              {(useLocale(), m.site_locale_label())}
            </span>
            <select
              aria-label={(useLocale(), m.site_locale_label())}
              class="site-locale-select"
              value={currentLocale()}
              onChange={(event) => {
                const next = event.currentTarget.value;
                if (next === currentLocale()) return;
                switchLocale(next as (typeof locales)[number]);
              }}
            >
              <For each={locales}>
                {(loc) => <option value={loc}>{LOCALE_LABELS[loc] ?? loc}</option>}
              </For>
            </select>
          </label>
          <Button
            as="a"
            class="site-header-button"
            href="https://github.com/djalmajr/asciimark-releases/issues"
            rel="noreferrer"
            target="_blank"
            variant="ghost"
          >
            <GithubIcon />
          </Button>
        </div>
      </header>

      <main class="site-main">
        <Outlet />
      </main>

      <footer class="site-footer">
        <p>{(useLocale(), m.site_footer_copyright())}</p>
      </footer>
    </div>
  );
}
