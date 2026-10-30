# Chart Desk.app — the Mac wrapper

A small native window around the local server. The server is **not** part of this
app: it is the `com.chartdesk.server` LaunchAgent on 127.0.0.1:4700, running
whether or not the window is open. Quitting the app leaves it running, so the
phone keeps working.

```bash
./build.sh              # build + install to /Applications
./build.sh --no-install # build into ./build only
```

Needs only Command Line Tools. **No Xcode, no Swift.** The CLT Swift toolchain on
this Mac has a compiler/SDK version mismatch (`this SDK is not supported by the
compiler`) and cannot build against the system SDK at all — Objective-C from
clang has no such problem and ships no runtime alongside. If Xcode is ever
installed properly, this still works; there is no reason to port it.

## Files

| | |
|---|---|
| `main.m` | the whole app, ~330 lines |
| `Info.plist` | bundle metadata + the ATS exception for plain-HTTP loopback |
| `AppIcon.icns` | built from `icon-source.png` |
| `icon-source.png` | the original 809×809 artwork |
| `build.sh` | compile → bundle → ad-hoc sign → install |

## What the app does beyond showing a web page

**Starts the engine if it is asleep.** On launch it polls the port; if nothing
answers it runs `launchctl kickstart` once, keeps polling for ~20s, and then
prints the manual command rather than spinning forever.

**Saves the exports.** This is the part that does not come for free. Every export
in the UI ends in an `<a download>` pointing at a `blob:` or `data:` URL — a
browser writes those to disk, a `WKWebView` silently does nothing. Two different
entry points have to be covered:

- `app.js` calls `a.click()` (chart PNGs, the `.md` packs)
- jsPDF dispatches `new MouseEvent('click')` at a **detached** anchor (the PDFs)

The detached one is the reason a `document`-level listener is not enough — the
anchor is never in the DOM, so the event has nothing to bubble through. The app
patches both `HTMLAnchorElement.prototype.click` and `.dispatchEvent`, reads the
blob as a data URL, and posts the bytes over the message bridge to be written to
`~/Downloads` (with `name 2.ext` de-duplication). Server-sent downloads take the
ordinary `WKDownload` path and land in the same place.

**Follows the page's light/dark.** The UI stores its theme in `localStorage`, not
`prefers-color-scheme`, so the window is told which one is showing via a
`MutationObserver` on `data-theme`. That drives the traffic-light rendering and
the colour behind the page before it paints.

**Clears the traffic lights.** The window has no titlebar of its own
(`FullSizeContentView`), so the sidebar's own background runs to the top edge and
there is no seam. Injected CSS pushes `.side-head` and `.main-inner` down to
clear the buttons. Injected here rather than added to `app.css`, so the browser
and the phone are untouched.

**Keeps browsing out.** Any URL that is not the local server opens in the real
browser instead of taking over the window.

## Menu

⌘R reload · ⌘⇧0 dashboard · ⌘[ / ⌘] back/forward · ⌘P print · ⌘⇧B open in browser
· ⌘0/+/− zoom · ⌃⌘F full screen. The Edit menu exists so ⌘C/⌘V work in the app's
own text fields — without it they silently do nothing.

## Gotchas

- **Ad-hoc signing is required**, not optional. An unsigned bundle is quarantined
  on Apple silicon and refuses to launch.
- Size the web view against `contentView.bounds`, never the frame the window was
  asked for — the saved window frame and the titlebar both change it. Getting
  this wrong renders the page inset by a few hundred pixels.
- `NSWindowTitleVisibilityHidden` does not exist in the ObjC headers; the
  constant is `NSWindowTitleHidden`. Same for `[NSMenu menuWithTitle:]`, which is
  Swift-only — use `initWithTitle:`.
