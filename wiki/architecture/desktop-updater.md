# Desktop updater

The desktop app uses [`tauri-plugin-updater`](https://v2.tauri.app/plugin/updater/)
to fetch and apply releases from
`djalmajr/asciimark-releases`. The release-side mechanics live in
[release/flow.md](../release/flow.md); this page covers the
**in-app UI** for surfacing pending updates and the architectural
decisions behind it.

## Layout

```
apps/desktop/src/lib/updater.ts          ← orchestrator + state signal
apps/desktop/src/app.tsx                  ← renders the modal
packages/ui/src/components/
  update-available-dialog.tsx             ← Kobalte AlertDialog wrapper
```

## Flow

1. **Startup check** — `app.tsx::onMount` calls
   `checkForAppUpdates(silent: true)` ~3 s after first paint. Errors
   (network down, missing platform entry in `latest.json`) are
   swallowed silently.
2. **Manual check** — hamburger menu → "Check for updates" and the
   Command Palette's `Check for Updates` entry call
   `checkForAppUpdates(silent: false)`. In this branch the
   "you're up to date" case shows a native message dialog so the
   user gets feedback after a manual click.
3. **Pending update** — both branches set the `pendingUpdate` signal
   in `updater.ts`. The host (`app.tsx`) subscribes via `useUpdate()`
   and renders `<UpdateAvailableDialog>` when the signal is non-null.
4. **Install** — the dialog's "Install and restart" button calls
   `update.install()`, which: (a) flips
   `window.__asciimark_updating = true` so the close-to-tray handler
   lets the window actually close, (b) calls
   `update.downloadAndInstall()`, (c) calls `relaunch()`.
5. **Dismiss** — Esc, "Later" button, or click outside resets the
   signal to `null`.

## Why a custom modal (and not the native Tauri `ask()`)

Originally we used `ask()` from `@tauri-apps/plugin-dialog`. It's
simple — one call returns a boolean — but the dialog is rendered by
the OS and the **body cannot scroll**. A long changelog (real example:
30+ commits squashed into the release notes) pushed the
"Install and restart" button below the fold on a 1080p monitor. The
user couldn't accept the update without scrolling — and there's no
scroll because the dialog is a fixed-size native panel.

Trade-offs of the custom modal:

| Aspect | Native `ask()` | Custom modal |
|---|---|---|
| Scrollable changelog | ❌ | ✅ |
| Layout matches app theme | ❌ system | ✅ |
| Translatable | partial (Tauri-managed) | ✅ via `@asciimark/i18n` |
| Implementation | one line | ~80 lines + state signal |
| Keyboard / a11y | OS-handled | Kobalte handles it |
| Dependency | `plugin-dialog` (already there) | `@kobalte/core` (already there) |

The custom modal won. We still use `plugin-dialog`'s `message()`
for the small toast cases (manual "you're up to date", error after
manual check) — those are short, the native UX is fine, and it
avoids a second custom component.

## Layout shape

`UpdateAvailableDialog` is a flex column inside Kobalte's
`AlertDialogContent` with `max-h: 80vh`:

```
┌─────────────────────────────────────────┐
│ Update available                        │  ← header (sticky, on top border)
│ AsciiMark 0.9.0 is available …          │
├─────────────────────────────────────────┤
│ ## Features                             │  ← body (scrolls when long)
│ - Foo                                   │
│ - Bar                                   │
│   …                                     │
│                                         │
├─────────────────────────────────────────┤
│                  [Later]  [Install …]   │  ← footer (sticky, on bottom)
└─────────────────────────────────────────┘
```

The body grows up to the available 80 vh; release notes shorter than
that cause the dialog to shrink to fit. Above that, the body becomes
scrollable while the header and footer stay pinned.

The notes block is rendered as **markdown** via a slim `markdown-it`
instance (`{ html: false, breaks: true, linkify: false }`) — release
bodies from `tauri-plugin-updater` are markdown extracted from the
GitHub release. Headers (`## Highlights`), bullets, inline code, and
emphasis all render with the same look as the in-app document
preview. `html: false` is what lets us inject the output via
`innerHTML` without a separate sanitization pass — raw HTML inside
the markdown source is escaped to literal text instead of emitted as
DOM.

The earlier version of this dialog used `<pre>` with `pre-wrap` and
no parsing — readable but visually noisy on changelogs that already
follow markdown conventions. We swapped after the first 0.9.0 dogfood
where the preview looked far cleaner with parsed structure.

## Hard rules

- **Never call `update.downloadAndInstall()` without first setting
  `window.__asciimark_updating = true`.** The close-to-tray handler
  in `apps/desktop/src/app.tsx` cancels close events to keep the
  app in the tray; without the flag, `relaunch()` deadlocks waiting
  for the window to actually exit.
- **Never block the startup check on user interaction.** Silent mode
  must stay silent — the user is opening the app to read a doc, not
  to confirm an update prompt that might not be relevant.

## Pending work

Updater enhancements vivem no Linear, no Project
[AsciiMark — Technical debt & polish](https://linear.app/djalmajr/project).
Itens conhecidos: standalone "Release notes" dialog (changelog de
versão já instalada) e progress UI durante `downloadAndInstall()`.

## Lessons learned

### Native dialogs are rigid by design

`@tauri-apps/plugin-dialog`'s `ask()` and `message()` are useful when
the body is a single sentence and the action is yes/no. They become
limitations the moment the content needs to scroll, the layout
needs theming, or the buttons need to share space with anything
else. Defaulting to "use the native dialog" saves time on the first
implementation but defers the cost — ours surfaced the moment the
first long changelog landed.

Rule of thumb: native `ask()` for binary confirmations under ~3
lines of body text, custom Kobalte modal for everything else.

### Long-press paths matter for tray apps

The `__asciimark_updating` flag is easy to forget. The first
implementation called `downloadAndInstall()` directly and the relaunch
hung indefinitely because the close-to-tray handler intercepted the
window close. The flag is set right before the call to make the
sequence atomic from the user's perspective: click Install →
window closes → app relaunches.

### Updater state is global, render is per-pane

The pending-update signal is module-level (`updater.ts` exports
`useUpdate`). Multiple panes / multiple windows would all observe
the same value. That's correct for an app-wide event like an
update prompt, but contrast with the per-pane `renderGen` we
isolated in [Round 5 of strategies.md](../testing/strategies.md):
the question to ask before any module-level signal is *"is this
genuinely app-wide, or am I about to share state across instances
that should be isolated?"* For updater state the answer is the
former; for `renderGen` it was the latter.

## Related

- [Release flow](../release/flow.md) — desktop tag → pipeline →
  signed `latest.json` published in `asciimark-releases`.
- [i18n architecture](./i18n.md) — message keys consumed by the
  modal (`update_available_*`).
