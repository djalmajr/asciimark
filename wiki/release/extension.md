# Extension release flow

Chrome Web Store releases for the browser extension. Different from
the desktop flow ([release/flow.md](flow.md)) — no auto-update
pipeline, no signed `.sig` files, no `latest.json`. The Web Store
itself distributes the build; releases go through human review.

## Bump → build → zip → upload

```bash
bun run bump:ext <version>          # patch | minor | major | x.y.z
git add -u && git commit -m "chore(extension): bump version to <version>"
cd apps/extension && bun run build
cd dist && zip -r ../../../asciimark-ext-<version>.zip . -x "*.DS_Store"
```

`bump:ext` updates both files in lockstep — never edit either by hand:

- `apps/extension/package.json`
- `apps/extension/public/manifest.json`

## Versioning rules

Semver, applied conservatively because the Web Store review queue
penalizes churn:

| Bump | When |
|---|---|
| **patch** (x.y.Z) | bug fix only — no new affordances, no UX changes |
| **minor** (x.Y.0) | new feature visible to the user (button, mode, capability) |
| **major** (X.0.0) | breaking change — manifest permission widened, host_permissions added, behavior the user has to relearn |

Polish + bug fix bundled together is still **minor** if a feature
exists in the changeset. Don't split a release into "feature" + "fix"
just to keep the patch number low; the Web Store review takes the
same amount of time regardless.

## Pre-upload checklist

- [ ] **Hardener clean.** No remote CDN fragments leaked into the
      bundle. Quick check:
  ```bash
  grep -c "cdnjs\|cdn.mathjax\|jsdelivr.net\|unpkg.com\|googleapis" \
    apps/extension/dist/assets/new-tab-*.js
  # Expect: 0
  ```
  If non-zero, the asciidoctor.js / MathJax stripping in
  `apps/extension/vite.config.ts` regressed — fix before submitting.
  Manifest V3 forbids remote scripts; static analysis at the Web
  Store will reject the build.
- [ ] **Manifest version matches package.json.** `bump:ext` keeps
      them in sync; verify in the zip's `manifest.json` if in doubt.
- [ ] **Bundle under 25MB.** Hard limit for the Web Store.
- [ ] **Manual smoke (load `dist/` as unpacked):**
  - Drag a folder → tree renders, file loads, preview converts.
  - URL mode (`?url=...`) → toolbar shows Reload + Copy URL +
    Copy content; preview renders.
  - Copy URL strips `?token=`, `?` and `#` (test against a GitHub
    raw URL with `?token=GHSAT...`).
  - Theme cycle in the menu works (System → Light → Dark).
  - File-tree menu does NOT appear at any nesting level (extension
    sets `showItemMenu={false}`).

## Upload

1. <https://chrome.google.com/webstore/devconsole>
2. Pick the AsciiMark item → **Package** tab → **Upload new package**.
3. Select `asciimark-ext-<version>.zip`.
4. Fill the changelog. Keep it user-facing (what they'll notice), not
   commit-list. Example:
   > 1.3.0
   > - Added Copy URL / Copy content buttons in the toolbar
   > - Open Folder, Reload, Recent files surfaced as visible icons
   > - URL copy now strips short-lived auth tokens (e.g. GitHub raw
   >   `?token=…`) so they don't leak into shared links
   > - File tree truncates long names with ellipsis instead of
   >   horizontal scroll
5. Submit for review. First-class reviews land in 1–3 business days;
   trusted-tester releases are faster but stay limited.

## Hard rules

- **NEVER** widen `host_permissions` without confirming with the user
  first. Web Store flags any change here as "permissions warning"
  during review and may also force re-acceptance from existing users.
- **NEVER** introduce remote scripts (`<script src="https://...">`),
  remote fonts loaded at runtime, or `eval`/`new Function` patterns —
  Manifest V3 rejects them and so does the Web Store reviewer.
- **NEVER** ship a `dev` or `?debug` toggle that elevates trust. The
  release-build hardener strips them; if you need debug capability,
  gate it behind a build flag, not a runtime config.
- **NEVER** include the `*.zip` in the repo. Build artifacts live
  outside `apps/extension/dist/` and are gitignored — keep it that
  way.
- **NEVER** push the bump commit + tag pre-upload. The Web Store
  reviews against the zip; if the review fails and you have to bump
  again, a tag is dead weight. Tag (or push, if you do) only after
  the new version goes live.

## Web Store submission text (justifications)

The dev console asks for three free-text justifications on every
review. Reuse and **adapt** these templates — don't paste verbatim
without re-checking against the current `manifest.json`. The
permissions and host list have changed across releases (v1.2.x asked
for `<all_urls>`; v1.3.0 asks only for `kroki.io`), so out-of-date
copy can stall the review.

### Storage permission (~200 chars)

> Used by the content script to cache the active tab's file text via
> `chrome.storage.session` so the viewer page can render it after the
> redirect. Local-only — never transmitted externally.

### Host permission (~330 chars)

Re-check `manifest.json::host_permissions` before submitting. As of
v1.3.0 the only entry is `https://kroki.io/*`:

> Required to send plain-text diagram source (PlantUML, Graphviz,
> Mermaid, etc.) via POST to `https://kroki.io` for SVG rendering.
> No other host is requested. File content from `.adoc`/`.md` pages
> is captured by the content script using activeTab semantics (no
> host permission needed) and rendered locally — only diagram blocks
> reach kroki.io, and the response is a static SVG. No JavaScript
> is fetched.

### Remote code use ("Sim, estou usando código remoto" + justification)

This is the field that rejected v1.2.0. The mitigation is the build
hardener in `apps/extension/vite.config.ts` — keep the language
explicit about it because the static analyzer at the Web Store still
greps the bundle for CDN URLs:

> This extension does not load or execute any remotely hosted
> JavaScript code. All scripts are bundled locally via Vite at build
> time.
>
> The only external request made at runtime is to `https://kroki.io`
> (declared in host_permissions), a public open-source diagram
> rendering API. The extension sends plain-text diagram source (e.g.
> PlantUML, Graphviz) via POST and receives back a static SVG — no
> JavaScript is fetched or executed.
>
> The bundle includes Asciidoctor.js, an open-source
> AsciiDoc-to-HTML converter compiled from Ruby via Opal. Its
> built-in HTML5 templates contain CDN URL strings
> (cdnjs.cloudflare.com, fonts.googleapis.com, cdn.mathjax.org,
> etc.) used only for standalone HTML export — a feature this
> extension does not use. Our build pipeline
> (`apps/extension/vite.config.ts`) explicitly strips and rewrites
> these fragments at compile time, so the shipped bundle contains
> zero remote-JavaScript URLs. We grep the output before every
> release and the count is 0.

## Asciidoctor.js & MathJax fragment stripping

The extension's CSP forbids remote scripts (Manifest V3). Asciidoctor
emits CDN URL fragments for highlight.js and MathJax that, even if
never executed, are flagged by the Web Store's static analyzer.
`apps/extension/vite.config.ts` strips them at build time:

- `REMOTE_FRAGMENTS_TO_STRIP` — list of host-name substrings to
  remove entirely from the output.
- `REMOTE_PATTERNS_TO_REWRITE` — regexes that turn `https://cdn…/x.js`
  into a literal that can never resolve to a remote URL.
- A regex pass also rewrites any `<script` tag that survived the
  earlier passes.

If you add a feature that pulls a new asciidoctor extension or
MathJax addon, run the bundle grep above. If something leaked, extend
the lists in `vite.config.ts` until the grep is clean again. v1.2.0
was rejected for exactly this reason; v1.2.1 fixed it. Do not
regress.
