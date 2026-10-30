# Credits & third-party notices

## Runtime dependencies

- **astronomy-engine** (MIT) © Don Cross — the planetary ephemeris (VSOP87-derived
  series + lunar theory), stated accuracy ±1′ vs JPL over 1700–2100.
  <https://github.com/cosinekitty/astronomy>
- **jsPDF** (MIT) — client-side PDF export.

Both are installed from npm (`npm install`) and are not vendored into this repo.

Swiss Ephemeris is deliberately **not** used — astronomy-engine (MIT) was chosen so
this project's license stays unencumbered.

## Systems implemented

Chart Desk computes charts for three symbolic systems. It implements the
**calculations only** — it is not affiliated with, endorsed by, or a product of the
originators of these systems, and it ships none of their interpretive text.

- **Human Design** — the calculation of type, strategy, authority, profile, gates,
  channels, centers, and incarnation cross. "Human Design" and its terminology
  originate with Ra Uru Hu / Jovian Archive.
- **Matrix of Destiny** — the arcana-position calculation. The system originates
  with Natalia Ladini.
- **Vedic astrology (Jyotish)** — classical Parashari and Jaimini rules: whole-sign
  houses, Parashari divisional charts (vargas), Vimshottari dasha, and the K.N. Rao
  standard for Chara Dasha.

Ayanamsa: Lahiri (Chitrapaksha). Sidereal positions come from the astronomy-engine
ephemeris; trust the results for births between 1700 and 2100.
