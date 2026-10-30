# Chart Desk

A local, on-device astrology chart engine. It computes **Vedic** (Jyotish),
**Human Design**, and **Matrix of Destiny** charts for saved people or one-off
casts, and serves them as a small web app, as clean Markdown packs, and as SVG/PDF
drawings. Everything runs on your own machine — no accounts, no network calls, no
analytics, nothing leaves the device.

It is deliberately unbranded and utility-first: a workbench, not a product.

## What it computes

- **Vedic / Jyotish** — D1 through D60 divisional charts, whole-sign houses,
  panchanga (tithi, nakshatra, yoga, karana, vara, hora), Vimshottari dasha (down
  to sub-sub-periods, with the native's age at each), Jaimini chara karakas and
  K.N. Rao Chara Dasha, dignities, aspects, arudhas, ashtakavarga.
- **Human Design** — type, strategy, authority, profile, definition, incarnation
  cross, gates, channels, centers, and the four Variables, drawn as a bodygraph.
- **Matrix of Destiny** — the full octagram, chains, chakra table, and age ring,
  with the calendar dates of every period.
- **The sky right now** — on the dashboard, every body in both zodiacs: sign,
  degree, retrograde, nakshatra and pada, and when each one changes sign.
- **Research tools** — filter a cohort by category, tag, or *placement*
  (`moon.nakshatra=Magha`) and export one row per person as Markdown or CSV, with a
  distribution of every column. Bulk-import many people from a list at once.

Charts degrade honestly: with no birth time, the cast falls back to noon, the
Human Design chart is withheld (it needs the hour), and house/varga layers carry a
caveat rather than pretending precision.

## Quick start

Requires **Node.js 18+**. No build step, two small dependencies.

```bash
npm install
npm start
```

Then open <http://127.0.0.1:4700>. Two fictional sample profiles are included so
there is something to look at; delete them and add your own.

Run the tests (engine fixtures vs. astronomy-engine and published references, plus
the HTTP API end-to-end):

```bash
npm test
```

## For agents / LLMs

The whole API self-describes at <http://127.0.0.1:4700/llms.txt>. The one call that
returns everything for a chart is:

```bash
curl -s http://127.0.0.1:4700/api/profiles/<slug>/atlas.md
```

Every view is available as JSON (drop the `.md`) and most as SVG. See `llms.txt`
for the full contract, the field paths used by the research filter, and the bulk
import/export endpoints.

## Project layout

```
server.mjs         zero-dependency HTTP server (node:http) on 127.0.0.1:4700
lib/engine/        the math: ephemeris, jyotish, humandesign, matrix, geo
lib/atlas/         panchanga, jaimini, nakshatra reference data
lib/svg/           chart renderers (north/south, wheel, bodygraph, octagram)
lib/md/            the Markdown export layer + bulk research/archive
ui/                the browser app (vanilla JS, no framework)
data/              profiles, categories, and the bundled city index
test/run.mjs       the test suite
mac/               optional native Mac wrapper (a WebKit window onto the server)
```

## Optional: run it as a Mac app

`mac/` holds a tiny Objective-C + WebKit wrapper that opens the local server in its
own window. `mac/build.sh` compiles it, ad-hoc signs it, and installs it to
`/Applications`. See `mac/README.md`. It is only a window onto the server — the
server still does all the work.

## License & credits

MIT — see [LICENSE](LICENSE). Third-party notices and the systems implemented are
in [CREDITS.md](CREDITS.md). In short: the ephemeris is astronomy-engine (MIT);
Human Design and Matrix of Destiny are third-party systems, and this project
implements only the calculations, shipping none of their interpretive text.
