// ============================================================
// Jyotish — the Vedic layer over ephemeris.js (build-plan
// segment 2b). Pure ESM, browser-safe: no DOM, no node APIs,
// no dependency beyond ephemeris.js (which carries the one npm
// package). The Vedic page calls buildVedicChart(); the smaller
// exports exist for tests and for the tool suite's later
// derivations (transits, arudhas, shadbala all reduce to
// wholeSignHouses()/varga() calls over sidereal longitudes).
//
// Scope per docs/fable-handoff.md §4: whole-sign houses,
// Parashari divisional charts, Vimshottari dasha, Jaimini chara
// karakas + karakamsa — plus, from engine phase 2c: Parashari
// ashtakavarga, Jaimini arudha padas, and the yogi/avayogi
// points — assembled into the fixed contract shape.
//
// Conventions — chosen to match astro-seek, the fixture anchor
// (docs/engine-fixtures.md):
// · Houses: whole sign. House 1 = the ascendant's whole sign;
//   every cusp is 0° of its sign.
// · Vargas: the classical Parashari (BPHS) counting rules — see
//   varga() for each chart's table. Where texts/software split:
//   - D2 hora: the classical Sun/Moon hora — every placement
//     lands in Cancer (Moon's hora) or Leo (Sun's); first half
//     of odd signs to the Sun, of even signs to the Moon. Not
//     the cyclical "parivritti" variant some software offers.
//     Astro-seek's D2 is the classical hora.
//   - D3: Parashari drekkana (1st/5th/9th) — not the Jagannatha
//     or Somanatha variants.
//   - D60 shashtiamsha: the sixty ½° parts counted zodiacally
//     from the occupied sign itself — (sign + ⌊2·deg⌋) mod 12.
//     BPHS says "multiply the degrees by two, drop the twelves,
//     count the remainder from the sign"; a few translations
//     read that count inclusively (a one-sign shift). We use
//     the reading implemented by JHora, Parashara's Light and
//     astro-seek's divisional tool. (BPHS's shashtiamsha DEITY
//     names run in reverse through even signs — that affects
//     naming only, not sign placement; deities are later-phase.)
// · Vimshottari: 365.25-day solar years — see DASHA_YEAR_DAYS.
// · Chara karakas: eight-scheme by default (Rahu included,
//   counted from the end of its sign); rank order per BPHS
//   AK, AmK, BK, MK, PiK, PK, GK, DK. { scheme: 7 } drops Rahu
//   and PiK. If Rahu is AK, its navamsha (karakamsa) is taken
//   from its longitude as computed — some schools reverse
//   Rahu's varga count; not implemented.
// · Arudhas: the pada sits as far from the lord as the lord sits
//   from its sign; a pada landing on the sign itself or its 7th
//   moves to the 10th therefrom (the Jaimini exception).
//   Traditional sign lords only — Mars owns Scorpio, Saturn owns
//   Aquarius. AL = A1, UL (upapada) = A12.
// · Ashtakavarga: the BPHS benefic-place tables; each of the
//   eight contributors (seven grahas + lagna) drops one bindu in
//   its tabled places counted from its occupied sign. SAV sums
//   the seven planetary BAVs (the lagna contributes bindus but
//   has no eighth SAV row). The tables' row counts are chart-
//   independent, so the BAV grand totals are structural
//   invariants — checked at module load.
// · Yogi: yoga sphuta = Sun + Moon + 93°20′ (counted from
//   Pushya's start); the avayogi point sits directly opposite
//   (+180°, astro-seek's convention — some software counts
//   +186°40′ instead). Yogi/avayogi grahas = the points'
//   nakshatra lords; the duplicate (sahayogi) = the yogi point's
//   sign lord.
//
// Validated against Fixture V1 (docs/engine-fixtures.md): all
// twelve whole-sign house placements, all twelve nakshatra
// lords, AK = Moon, karakamsa = Virgo, opening dasha lord Mars
// with the elapsed fraction of Chitra exact, the hand-derived
// varga cases in TEST_FIXTURES, AL = Taurus (9th from lagna)
// with the full hand-counted A1–A12 set, yogi/avayogi points at
// Virgo/Pisces 19°54′, and the ashtakavarga invariant totals
// (48/49/39/54/56/52/39, SAV 337) plus hand-counted V1 cells.
// ============================================================

import { norm360, positions, ayanamsa, sidereal, ascendant, nakshatraOf } from './ephemeris.js';

export const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

/** Traditional sign lords (Mars owns Scorpio, Saturn owns Aquarius), as body keys. */
export const SIGN_LORDS = [
  'mars', 'venus', 'mercury', 'moon', 'sun', 'mercury',
  'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter',
];

/** { siderealLon, sign, signName, degInSign, nakshatra } for one longitude. */
function describe(lon) {
  const L = norm360(lon);
  const sign = Math.floor(L / 30);
  return { siderealLon: L, sign, signName: SIGNS[sign], degInSign: L - sign * 30, nakshatra: nakshatraOf(L) };
}

// — whole-sign houses —

/**
 * The twelve whole-sign houses from a sidereal ascendant.
 * @param {number} ascSiderealLon degrees
 * @returns {{ ascSign:number, houses:Array, houseOf:(lon:number)=>number }}
 *   houses: [{ house:1–12, sign:0–11, signName, cuspLon }] — cuspLon is 0° of
 *   the sign; houseOf maps any sidereal longitude to its house number.
 */
export function wholeSignHouses(ascSiderealLon) {
  const ascSign = Math.floor(norm360(ascSiderealLon) / 30);
  const houses = Array.from({ length: 12 }, (_, i) => {
    const sign = (ascSign + i) % 12;
    return { house: i + 1, sign, signName: SIGNS[sign], cuspLon: sign * 30 };
  });
  const houseOf = (lon) => ((Math.floor(norm360(lon) / 30) - ascSign + 12) % 12) + 1;
  return { ascSign, houses, houseOf };
}

// — Parashari vargas —

// Element of sign s is s % 4 (fire, earth, air, water); modality is s % 3
// (movable, fixed, dual). Start-sign tables per BPHS:
const D9_START = [0, 9, 6, 3];   // navamsha: fire→Aries, earth→Capricorn, air→Libra, water→Cancer
const D27_START = [0, 3, 6, 9];  // bhamsha:  fire→Aries, earth→Cancer,    air→Libra, water→Capricorn
const D20_START = [0, 8, 4];     // vimsamsha: movable→Aries, fixed→Sagittarius, dual→Leo
const D8_START = [0, 8, 4];      // ashtamsha: movable→Aries, fixed→Sagittarius, dual→Leo (≡ the continuous count 8·sign + part)
const D16_START = [0, 4, 8];     // shodashamsha AND akshavedamsha (D45): movable→Aries, fixed→Leo, dual→Sagittarius

// Panchamsha (D5) — the BPHS lord-list varga: five 6° parts ruled by
// Mars, Saturn, Jupiter, Mercury, Venus, each part placed in one of the
// ruler's signs. Odd signs: Aries, Aquarius, Sagittarius, Gemini, Libra;
// even signs: Taurus, Virgo, Pisces, Capricorn, Scorpio.
const D5_ODD = [0, 10, 8, 2, 6];
const D5_EVEN = [1, 5, 11, 9, 7];

// Trimsamsha (D30) — the irregular varga: five unequal bands ruled by the
// five non-luminaries, each band placed in one of the ruler's own signs.
// Odd signs run Mars 5° / Saturn 5° / Jupiter 8° / Mercury 7° / Venus 5°;
// even signs reverse: Venus 5° / Mercury 7° / Jupiter 8° / Saturn 5° / Mars 5°.
const D30_BANDS = {
  odd: [[5, 0], [10, 10], [18, 8], [25, 2], [30, 6]],   // →Aries, Aquarius, Sagittarius, Gemini, Libra
  even: [[5, 1], [12, 5], [20, 11], [25, 9], [30, 7]],  // →Taurus, Virgo, Pisces, Capricorn, Scorpio
};

/**
 * Divisional-chart (varga) placement of one sidereal longitude.
 * Implemented: D1, D2 (hora), D3 (drekkana), D4 (chaturthamsha),
 * D5 (panchamsha), D6 (shashthamsha), D7 (saptamsha), D8 (ashtamsha),
 * D9 (navamsha), D10 (dasamsha), D11 (rudramsha), D12 (dwadasamsha),
 * D16 (shodashamsha), D20 (vimsamsha), D24 (siddhamsha), D27 (bhamsha),
 * D30 (trimsamsha), D45 (akshavedamsha), D60 (shashtiamsha),
 * D81 (nav-navamsha), D108 (ashtottaramsha), D144 (dwadash-dwadashamsha).
 * D40 (khavedamsha) is deliberately NOT implemented: the V3 reference
 * matrix row for D40 disagrees with every candidate counting rule in one
 * doubly-occupied cell (classical odd→Aries / even→Libra fits 11/13 with
 * both misses in the same varga sign — a suspected transcription slip);
 * pending a re-check of the reference it keeps the throw.
 * Classical Parashari rules; the D4–D144 additions are validated against
 * the V3 reference cast (tests/test-vargas-v3.mjs):
 * · D2  — odd signs: 0–15° Sun (Leo), 15–30° Moon (Cancer); even: reversed.
 * · D3  — 10° thirds: the sign itself, its 5th, its 9th.
 * · D4  — 7°30′ quarters on the kendras from the sign (its 1st/4th/7th/10th).
 * · D5  — 6° fifths per the BPHS lord lists (see D5_ODD / D5_EVEN).
 * · D6  — 5° sixths from Aries (odd) or Libra (even) — ≡ the continuous
 *         (parivritti) count 6·sign + part.
 * · D7  — sevenths from the sign (odd) or its 7th (even).
 * · D8  — 3°45′ eighths from the modality's start sign (see D8_START) —
 *         ≡ the continuous count 8·sign + part.
 * · D9  — 3°20′ ninths from the element's start sign (see D9_START).
 * · D10 — 3° tenths from the sign (odd) or its 9th (even).
 * · D11 — 2°43′38″ elevenths, the continuous count 11·sign + part —
 *         i.e. counted from Aries pulled back by the sign's own offset.
 * · D12 — 2°30′ twelfths from the sign itself.
 * · D16 — 1°52′30″ sixteenths from the modality's start (see D16_START).
 * · D20 — 1°30′ twentieths from the modality's start sign (see D20_START).
 * · D24 — 1°15′ twenty-fourths from Leo (odd) or Cancer (even).
 * · D27 — 1°06′40″ parts from the element's start sign (see D27_START).
 * · D30 — the irregular five-band rule (see D30_BANDS).
 * · D45 — 40′ parts from the modality's start (same table as D16).
 * · D60 — ½° sixtieths counted from the sign itself.
 * · D81 — 22′13″ parts from the element's start sign (see D9_START) —
 *         ≡ the navamsha of the navamsha.
 * · D108 — 16′40″ parts: the dwadasamsha of the navamsha
 *         (9·sign + ⌊part/12⌋ + part mod 12).
 * · D144 — 12′30″ parts: the dwadasamsha of the dwadasamsha
 *         (sign + ⌊part/12⌋ + part mod 12).
 * @param {number} siderealLon degrees
 * @param {number} n the divisional number (1–12, 16, 20, 24, 27, 30, 45,
 *   60, 81, 108, 144 — all but 40)
 * @returns {{ n:number, part:number, sign:number, signName:string }}
 *   part is 1-based within the sign (for D30: the band, 1–5).
 */
export function varga(siderealLon, n) {
  const lon = norm360(siderealLon);
  const s = Math.floor(lon / 30);
  const d = lon - s * 30;
  const odd = s % 2 === 0;                     // Aries is the 1st (odd) sign
  // 0-based equal-division part; the clamp guards float overshoot at 30°−ε.
  const equalPart = () => Math.min(n - 1, Math.floor((d * n) / 30));
  let part;
  let sign;
  switch (n) {
    case 1: part = 0; sign = s; break;
    case 2: part = equalPart(); sign = (part === 0) === odd ? 4 : 3; break;
    case 3: part = equalPart(); sign = (s + 4 * part) % 12; break;
    case 4: part = equalPart(); sign = (s + 3 * part) % 12; break;
    case 5: part = equalPart(); sign = (odd ? D5_ODD : D5_EVEN)[part]; break;
    case 6: part = equalPart(); sign = ((odd ? 0 : 6) + part) % 12; break;
    case 7: part = equalPart(); sign = (s + (odd ? 0 : 6) + part) % 12; break;
    case 8: part = equalPart(); sign = (D8_START[s % 3] + part) % 12; break;
    case 9: part = equalPart(); sign = (D9_START[s % 4] + part) % 12; break;
    case 10: part = equalPart(); sign = (s + (odd ? 0 : 8) + part) % 12; break;
    case 11: part = equalPart(); sign = (11 * s + part) % 12; break;
    case 12: part = equalPart(); sign = (s + part) % 12; break;
    case 16: part = equalPart(); sign = (D16_START[s % 3] + part) % 12; break;
    case 20: part = equalPart(); sign = (D20_START[s % 3] + part) % 12; break;
    case 24: part = equalPart(); sign = ((odd ? 4 : 3) + part) % 12; break;
    case 27: part = equalPart(); sign = (D27_START[s % 4] + part) % 12; break;
    case 30: {
      const bands = D30_BANDS[odd ? 'odd' : 'even'];
      part = bands.findIndex(([limit]) => d < limit);
      if (part === -1) part = bands.length - 1;  // d ≈ 30 float edge
      sign = bands[part][1];
      break;
    }
    case 45: part = equalPart(); sign = (D16_START[s % 3] + part) % 12; break;
    case 60: part = equalPart(); sign = (s + part) % 12; break;
    case 81: part = equalPart(); sign = (D9_START[s % 4] + part) % 12; break;
    case 108: part = equalPart(); sign = (9 * s + Math.floor(part / 12) + (part % 12)) % 12; break;
    case 144: part = equalPart(); sign = (s + Math.floor(part / 12) + (part % 12)) % 12; break;
    default: throw new Error(`varga: D${n} not implemented`);
  }
  return { n, part: part + 1, sign, signName: SIGNS[sign] };
}

// — varga longitudes (full positions inside a divisional chart) —

// D30's five bands are unequal; every other varga divides the sign evenly.
// Width of the part that holds in-sign degree d, plus the part's start degree.
function vargaPartSpan(siderealLon, n) {
  if (n !== 30) return { start: (varga(siderealLon, n).part - 1) * (30 / n), width: 30 / n };
  const lon = norm360(siderealLon);
  const s = Math.floor(lon / 30);
  const d = lon - s * 30;
  const bands = D30_BANDS[s % 2 === 0 ? 'odd' : 'even'];
  let prev = 0;
  for (const [limit] of bands) {
    if (d < limit) return { start: prev, width: limit - prev };
    prev = limit;
  }
  const [last] = bands[bands.length - 1];
  return { start: prev - (last - prev), width: last - prev }; // d ≈ 30 float edge
}

/**
 * Full position inside a varga: the sign from varga() plus a degree — the
 * fractional position within the source portion scaled to 30°. This is
 * astro-seek's per-varga longitude convention, validated against the V2
 * reference prints (docs/engine-fixtures.md): recovering their base
 * longitudes from the D60 table (which pins them to ~1″) and re-deriving
 * the D9 table reproduces every printed degree exactly. For D30 the band
 * fraction is scaled to 30° (no reference print exists for D30 degrees —
 * the natural generalization, documented here).
 * @param {number} siderealLon degrees
 * @param {number} n the divisional number
 * @returns {{ n, part, sign, signName, degInSign:number, lon:number,
 *   nakshatra:Object }} lon = sign·30 + degInSign — a longitude in the
 *   varga zodiac; nakshatra is read from that varga longitude (astro-seek
 *   prints varga nakshatras this way).
 */
export function vargaLon(siderealLon, n) {
  const v = varga(siderealLon, n);
  const lon = norm360(siderealLon);
  const d = lon - Math.floor(lon / 30) * 30;
  const { start, width } = vargaPartSpan(siderealLon, n);
  const degInSign = Math.min(30 - 1e-9, Math.max(0, ((d - start) / width) * 30));
  const vLon = v.sign * 30 + degInSign;
  return { ...v, degInSign, lon: vLon, nakshatra: nakshatraOf(vLon) };
}

// The nine grahas of the classical frame (Jaimini occupancy, aspect mains
// exclude the nodes; outers are never counted in the Jaimini layers).
const GRAHA_KEYS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];

/**
 * The full chart inside one varga — per body: varga longitude, sign,
 * degree, nakshatra + pada (from the varga longitude), whole-sign house
 * from the varga ascendant, natal retro flag — plus the varga AC and MC.
 * n = 1 returns the rāśi itself in the same shape, so a page can render
 * every chart-space through one path. Each entry carries `speed`: the
 * natal rate mapped through the varga (× the local slope of the varga
 * map — n for the equal vargas, 30/bandwidth inside a D30 band), which
 * is what aspects() needs for applying/separating in a varga.
 * @param {Object} chart a buildVedicChart() result
 * @param {number} n the divisional number
 */
export function vargaChartOf(chart, n) {
  const at = (siderealLon) => vargaLon(siderealLon, n);
  const slope = (siderealLon) => 30 / vargaPartSpan(siderealLon, n).width;
  const asc = at(chart.ascendant.siderealLon);
  const { houses, houseOf } = wholeSignHouses(asc.lon);
  const mc = at(chart.mc.siderealLon);
  const entry = (body, src, kind) => ({
    body,
    kind,
    ...at(src.siderealLon),
    house: houseOf(at(src.siderealLon).lon),
    retro: src.retro ?? false,
    speed: (src.speed ?? 0) * slope(src.siderealLon),
  });
  return {
    n,
    ascendant: { ...asc, house: 1, kind: 'angle', speed: 0 },
    mc: { ...mc, house: houseOf(mc.lon), kind: 'angle', speed: 0 },
    houses,
    bodies: [
      ...chart.planets.map((p) => entry(p.body, p, 'planet')),
      entry('rahu', chart.nodes.rahu, 'node'),
      entry('ketu', chart.nodes.ketu, 'node'),
    ],
  };
}

// — aspects (the classical five, astro-seek's inclusion model) —

export const ASPECT_TYPES = [
  { type: 'conjunction', angle: 0 },
  { type: 'sextile', angle: 60 },
  { type: 'square', angle: 90 },
  { type: 'trine', angle: 120 },
  { type: 'opposition', angle: 180 },
];

// Fitted to the V2 reference grids (docs/engine-fixtures.md) and verified
// against every printed row AND every printable absence in the D1 and D9
// tables: each body carries an orb radius — 10° for the luminaries, 7° for
// everything else (planets, nodes, angles) — a pair's allowance is the
// LARGER of the two radii, and sextiles run at half allowance. (The flat
// 10/8/6 table many sites describe does not reproduce the reference:
// it would drop Sun–Saturn at 8°22′ and admit Mercury–Venus at 7°26′.)
const ORB_LUMINARY = 10;
const ORB_DEFAULT = 7;
const SEXTILE_FACTOR = 0.5;
// Angles sweep the whole zodiac daily; for applying/separating the
// reference treats the angle as the mover (its diurnal rate swamps any
// planet), so ASC/MC rows apply while the sweep has yet to reach
// exactness. In a natal frame the angle is otherwise static.
const DIURNAL_DEG_PER_DAY = 360.9856;

/**
 * Classical five-aspect grid over a set of bodies. Pass longitudes in any
 * single zodiac (rāśi or a varga — for a varga, speeds scaled by the varga
 * slope, as vargaChartOf() provides; only the sign of the relative rate
 * matters to the flag).
 * @param {Array<{key:string, lon:number, speed?:number,
 *   kind?:'planet'|'node'|'angle'}>} bodies
 * @returns {{ main:Array, other:Array }} main = planet×planet pairs;
 *   other = any pair touching a node or an angle. Angle×angle and
 *   node×node pairs are skipped (the reference computes neither; Rahu–Ketu
 *   is a constant 180°). Row: { a, b, type, angle, orb (deg), applying }.
 */
export function aspects(bodies) {
  const radius = (b) => (b.key === 'sun' || b.key === 'moon' ? ORB_LUMINARY : ORB_DEFAULT);
  const kindOf = (b) => b.kind ?? 'planet';
  const rate = (b) => (kindOf(b) === 'angle' ? DIURNAL_DEG_PER_DAY : (b.speed ?? 0));
  const main = [];
  const other = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i];
      const B = bodies[j];
      const ka = kindOf(A);
      const kb = kindOf(B);
      if (ka !== 'planet' && kb !== 'planet') continue; // no angle×angle / node×node
      // signed separation B − A in (−180, 180]
      let diff = norm360(B.lon - A.lon);
      const sign = diff > 180 ? -1 : 1;
      const sep = diff > 180 ? 360 - diff : diff;
      for (const { type, angle } of ASPECT_TYPES) {
        const orb = Math.abs(sep - angle);
        const allowed = Math.max(radius(A), radius(B)) * (type === 'sextile' ? SEXTILE_FACTOR : 1);
        if (orb > allowed) continue;
        // d(orb)/dt: applying while the orb is closing
        const dSep = sign * (rate(B) - rate(A));
        const dOrb = (sep >= angle ? 1 : -1) * dSep;
        const row = { a: A.key, b: B.key, type, angle, orb, applying: dOrb < 0 };
        (ka === 'planet' && kb === 'planet' ? main : other).push(row);
        break; // a pair holds at most one classical aspect within orb
      }
    }
  }
  return { main, other };
}

/**
 * The aspect inputs for one varga chart-space (n = 1 for the rāśi):
 * the ten planets, both nodes, and — unless withAngles is false (the
 * unknown-time cast) — the AC and MC.
 * @param {Object} vc a vargaChartOf() result
 * @param {{ withAngles?:boolean }} [opts]
 */
export function aspectInputsOf(vc, { withAngles = true } = {}) {
  const rows = vc.bodies.map((b) => ({ key: b.body, lon: b.lon, speed: b.speed, kind: b.kind }));
  if (withAngles) {
    rows.unshift(
      { key: 'asc', lon: vc.ascendant.lon, speed: 0, kind: 'angle' },
      { key: 'mc', lon: vc.mc.lon, speed: 0, kind: 'angle' },
    );
  }
  return rows;
}

// — the karakāṁśa frame (bodies counted from the karakāṁśa) —

/**
 * The ātmakāraka carried into the navāṁśa: the AK, its D1 seat, its D9
 * sign (the karakāṁśa), and the twelve houses counted from the karakāṁśa
 * in D9 with their occupants — the nine grahas only (Jaimini counts no
 * outers). Validated on V2: karakāṁśa Libra, AK Mercury (Leo, H4 in D1).
 * @param {Object} chart a buildVedicChart() result
 */
export function karakamsaFrame(chart) {
  const akBody = chart.karakas.byKaraka.AK;
  const d9 = vargaChartOf(chart, 9);
  const byBody = Object.fromEntries(d9.bodies.map((b) => [b.body, b]));
  const kkSign = byBody[akBody].sign;
  const d1 = akBody === 'rahu' ? chart.nodes.rahu
    : akBody === 'ketu' ? chart.nodes.ketu
      : chart.planets.find((p) => p.body === akBody);
  const grahas = [...GRAHA_KEYS, 'rahu', 'ketu'];
  const houses = Array.from({ length: 12 }, (_, i) => {
    const sign = (kkSign + i) % 12;
    return {
      house: i + 1,
      sign,
      signName: SIGNS[sign],
      occupants: grahas.filter((k) => byBody[k].sign === sign),
    };
  });
  return {
    akBody,
    akD1: { signName: d1.signName, degInSign: d1.degInSign, house: d1.house, retro: d1.retro },
    karakamsa: { sign: kkSign, signName: SIGNS[kkSign] },
    akD9: byBody[akBody],
    houses,
  };
}

// — upapada detail (the standard UL reading points) —

/**
 * The upapada lagna unpacked: UL sign (A12) with its house from the
 * lagna, the UL sign's lord and that lord's D1 seat, the occupants of the
 * UL, and the 2nd from the UL (sustenance) with its occupants and lord's
 * seat. Occupancy counts the nine grahas only — the reference tools list
 * "no planets present" for a UL sign holding only an outer. Validated on
 * V2: UL Sagittarius, lord Jupiter → Aries H12 R, 2nd Capricorn.
 * @param {Object} chart a buildVedicChart() result
 */
export function upapadaDetail(chart) {
  const byBody = Object.fromEntries(chart.planets.map((p) => [p.body, p]));
  byBody.rahu = chart.nodes.rahu;
  byBody.ketu = chart.nodes.ketu;
  const grahas = [...GRAHA_KEYS, 'rahu', 'ketu'];
  const occupantsOf = (sign) => grahas.filter((k) => byBody[k].sign === sign);
  const seatOf = (body) => {
    const p = byBody[body];
    return { body, signName: p.signName, degInSign: p.degInSign, house: p.house, retro: p.retro };
  };
  const ul = chart.arudhas.UL;
  const secondSign = (ul.sign + 1) % 12;
  return {
    ul: { sign: ul.sign, signName: ul.signName, houseFromLagna: ul.houseFromLagna },
    lord: seatOf(SIGN_LORDS[ul.sign]),
    occupants: occupantsOf(ul.sign),
    second: {
      sign: secondSign,
      signName: SIGNS[secondSign],
      occupants: occupantsOf(secondSign),
      lord: seatOf(SIGN_LORDS[secondSign]),
    },
  };
}

// — Vimshottari dasha —

/**
 * The 120-year cycle: [lord, years], in dasha order. This IS the
 * nakshatra-lord cycle (ephemeris.js rules nakshatra i by index i % 9 into
 * the same Ketu-first sequence) — which is why the opening mahadasha lord
 * is simply the Moon's nakshatra lord.
 */
export const DASHA_SEQUENCE = [
  ['Ketu', 7], ['Venus', 20], ['Sun', 6], ['Moon', 10], ['Mars', 7],
  ['Rahu', 18], ['Jupiter', 16], ['Saturn', 19], ['Mercury', 17],
];

// Year convention: 365.25-day solar years. Astro-seek's Vimshottari tool —
// our fixture anchor — uses 365.25-day solar years. Some software/texts use
// 360-day (savana) years instead; the two drift ~5¼ days per elapsed dasha
// year, a multi-month divergence deep in the sequence. If a toggle is ever
// wanted, thread it through this constant.
const DASHA_YEAR_DAYS = 365.25;
const DASHA_YEAR_MS = DASHA_YEAR_DAYS * 86400e3;

/**
 * Full Vimshottari mahadasha sequence with antardashas.
 * Opening lord = the Moon's nakshatra lord; the opening balance is the
 * unelapsed fraction of that nakshatra, so the first mahadasha's `start`
 * is notional (before birth: birth − elapsed·years). Each mahadasha carries
 * all nine antardashas, subdividing its full span proportionally
 * (years·adYears/120), in cycle order starting from the mahadasha lord.
 * @param {number} moonSiderealLon degrees
 * @param {Date} birthUtDate
 * @returns {{ nakshatra:Object, elapsedFraction:number,
 *   balance:{ lord:string, years:number },
 *   mahadashas:[{ lord, years, start:Date, end:Date,
 *     antardashas:[{ lord, years, start:Date, end:Date }] }] }}
 */
export function vimshottari(moonSiderealLon, birthUtDate) {
  const nak = nakshatraOf(moonSiderealLon);
  const span = 360 / 27;
  const elapsedFraction = (norm360(moonSiderealLon) - nak.index * span) / span;
  const startIdx = nak.index % 9;
  let t = birthUtDate.getTime() - elapsedFraction * DASHA_SEQUENCE[startIdx][1] * DASHA_YEAR_MS;
  const mahadashas = [];
  for (let i = 0; i < 9; i++) {
    const [lord, years] = DASHA_SEQUENCE[(startIdx + i) % 9];
    const start = new Date(t);
    const antardashas = [];
    let ta = t;
    for (let j = 0; j < 9; j++) {
      const [adLord, adYears] = DASHA_SEQUENCE[(startIdx + i + j) % 9];
      const adSpanYears = (years * adYears) / 120;
      const adEnd = ta + adSpanYears * DASHA_YEAR_MS;
      antardashas.push({ lord: adLord, years: adSpanYears, start: new Date(ta), end: new Date(adEnd) });
      ta = adEnd;
    }
    t += years * DASHA_YEAR_MS;
    mahadashas.push({ lord, years, start, end: new Date(t), antardashas });
  }
  return {
    nakshatra: nak,
    elapsedFraction,
    balance: { lord: DASHA_SEQUENCE[startIdx][0], years: (1 - elapsedFraction) * DASHA_SEQUENCE[startIdx][1] },
    mahadashas,
  };
}

// — Jaimini chara karakas —

const KARAKA_ORDER_8 = ['AK', 'AmK', 'BK', 'MK', 'PiK', 'PK', 'GK', 'DK'];
const KARAKA_ORDER_7 = ['AK', 'AmK', 'BK', 'MK', 'PK', 'GK', 'DK'];
const KARAKA_NAMES = {
  AK: 'Atmakaraka', AmK: 'Amatyakaraka', BK: 'Bhratrikaraka', MK: 'Matrikaraka',
  PiK: 'Pitrikaraka', PK: 'Putrakaraka', GK: 'Gnatikaraka', DK: 'Darakaraka',
};

/**
 * Chara karakas ranked by in-sign degree, descending. Eight-scheme (default):
 * Sun–Saturn + Rahu, with Rahu counted as 30° − its in-sign degree; karaka
 * order AK, AmK, BK, MK, PiK, PK, GK, DK (BPHS — some modern summaries swap
 * PiK/PK; we follow BPHS/JHora). Seven-scheme ({ scheme: 7 }): Sun–Saturn
 * only, no PiK. Ties: full-precision float degrees make exact ties
 * astronomically negligible; a tie falls back to listing order (Sun first).
 * @param {Object} sidBodies sidereal bodies keyed sun…saturn + rahu (or
 *   meanNode), each { lon } — e.g. sidereal(positions(d), ayanamsa(d)).bodies
 * @param {{ scheme?:7|8 }} [opts]
 * @returns {{ scheme:number, ranked:[{ rank, karaka, karakaName, body,
 *   degInSign, rankDeg }], byKaraka:Object, byBody:Object }}
 *   rankDeg is what was ranked (for Rahu: 30 − degInSign).
 */
export function charaKarakas(sidBodies, { scheme = 8 } = {}) {
  const seven = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];
  const rahuKey = sidBodies.rahu ? 'rahu' : 'meanNode';
  const keys = scheme === 7 ? seven : [...seven, rahuKey];
  const order = scheme === 7 ? KARAKA_ORDER_7 : KARAKA_ORDER_8;
  const ranked = keys
    .map((key) => {
      const lon = norm360(sidBodies[key].lon);
      const degInSign = lon - Math.floor(lon / 30) * 30;
      const rankDeg = key === rahuKey ? 30 - degInSign : degInSign;
      return { body: key === 'meanNode' ? 'rahu' : key, degInSign, rankDeg };
    })
    .sort((a, b) => b.rankDeg - a.rankDeg)
    .map((r, i) => ({ rank: i + 1, karaka: order[i], karakaName: KARAKA_NAMES[order[i]], ...r }));
  const byKaraka = {};
  const byBody = {};
  for (const r of ranked) {
    byKaraka[r.karaka] = r.body;
    byBody[r.body] = r.karaka;
  }
  return { scheme, ranked, byKaraka, byBody };
}

// — Parashari ashtakavarga —

// The BPHS benefic-place tables. For each target graha, each contributor
// (the seven grahas + the lagna) drops one bindu in the listed places,
// counted whole-sign from the contributor's occupied sign. Row counts are
// chart-independent, which makes each BAV's grand total a structural
// invariant: Sun 48, Moon 49, Mars 39, Mercury 54, Jupiter 56, Venus 52,
// Saturn 39 — and SAV (the seven BAVs summed) always 337.
const ASHTAKAVARGA_TABLES = {
  sun: {
    total: 48,
    sun: [1, 2, 4, 7, 8, 9, 10, 11], moon: [3, 6, 10, 11],
    mars: [1, 2, 4, 7, 8, 9, 10, 11], mercury: [3, 5, 6, 9, 10, 11, 12],
    jupiter: [5, 6, 9, 11], venus: [6, 7, 12],
    saturn: [1, 2, 4, 7, 8, 9, 10, 11], lagna: [3, 4, 6, 10, 11, 12],
  },
  moon: {
    total: 49,
    sun: [3, 6, 7, 8, 10, 11], moon: [1, 3, 6, 7, 10, 11],
    mars: [2, 3, 5, 6, 9, 10, 11], mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    jupiter: [1, 4, 7, 8, 10, 11, 12], venus: [3, 4, 5, 7, 9, 10, 11],
    saturn: [3, 5, 6, 11], lagna: [3, 6, 10, 11],
  },
  mars: {
    total: 39,
    sun: [3, 5, 6, 10, 11], moon: [3, 6, 11],
    mars: [1, 2, 4, 7, 8, 10, 11], mercury: [3, 5, 6, 11],
    jupiter: [6, 10, 11, 12], venus: [6, 8, 11, 12],
    saturn: [1, 4, 7, 8, 9, 10, 11], lagna: [1, 3, 6, 10, 11],
  },
  mercury: {
    total: 54,
    sun: [5, 6, 9, 11, 12], moon: [2, 4, 6, 8, 10, 11],
    mars: [1, 2, 4, 7, 8, 9, 10, 11], mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    jupiter: [6, 8, 11, 12], venus: [1, 2, 3, 4, 5, 8, 9, 11],
    saturn: [1, 2, 4, 7, 8, 9, 10, 11], lagna: [1, 2, 4, 6, 8, 10, 11],
  },
  jupiter: {
    total: 56,
    sun: [1, 2, 3, 4, 7, 8, 9, 10, 11], moon: [2, 5, 7, 9, 11],
    mars: [1, 2, 4, 7, 8, 10, 11], mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    jupiter: [1, 2, 3, 4, 7, 8, 10, 11], venus: [2, 5, 6, 9, 10, 11],
    saturn: [3, 5, 6, 12], lagna: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  venus: {
    total: 52,
    sun: [8, 11, 12], moon: [1, 2, 3, 4, 5, 8, 9, 11, 12],
    mars: [3, 5, 6, 9, 11, 12], mercury: [3, 5, 6, 9, 11],
    jupiter: [5, 8, 9, 10, 11], venus: [1, 2, 3, 4, 5, 8, 9, 10, 11],
    saturn: [3, 4, 5, 8, 9, 10, 11], lagna: [1, 2, 3, 4, 5, 8, 9, 11],
  },
  saturn: {
    total: 39,
    sun: [1, 2, 4, 7, 8, 10, 11], moon: [3, 6, 11],
    mars: [3, 5, 6, 10, 11, 12], mercury: [6, 8, 9, 10, 11, 12],
    jupiter: [5, 6, 11, 12], venus: [6, 11, 12],
    saturn: [3, 5, 6, 11], lagna: [1, 3, 4, 6, 10, 11],
  },
};

// Self-validation gate: a mistyped row throws at import, not at read time.
{
  let grand = 0;
  for (const [planet, table] of Object.entries(ASHTAKAVARGA_TABLES)) {
    const sum = Object.entries(table)
      .reduce((s, [k, v]) => (k === 'total' ? s : s + v.length), 0);
    if (sum !== table.total) {
      throw new Error(`ashtakavarga: ${planet} table rows sum to ${sum}, expected ${table.total}`);
    }
    grand += sum;
  }
  if (grand !== 337) throw new Error(`ashtakavarga: grand total ${grand}, expected 337`);
}

/**
 * Classical Parashari ashtakavarga: bhinnashtakavarga (BAV) for the seven
 * grahas with lagna contributions, and sarvashtakavarga (SAV). Bindus per
 * ASHTAKAVARGA_TABLES, counted whole-sign from each contributor's sign.
 * @param {Object} sidBodies sidereal bodies keyed sun…saturn, each { lon }
 * @param {number} ascSiderealLon degrees (the lagna contributor)
 * @returns {{ bav:Object, bavTotals:Object, sav:number[], savTotal:number }}
 *   bav.<planet>[signIndex] = bindus 0–8 (signIndex 0 = Aries);
 *   sav[signIndex] = the seven BAVs summed; savTotal is always 337.
 */
export function ashtakavarga(sidBodies, ascSiderealLon) {
  const signOf = (lon) => Math.floor(norm360(lon) / 30);
  const contributorSign = { lagna: signOf(ascSiderealLon) };
  for (const key of ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn']) {
    contributorSign[key] = signOf(sidBodies[key].lon);
  }
  const bav = {};
  const bavTotals = {};
  for (const [planet, table] of Object.entries(ASHTAKAVARGA_TABLES)) {
    const bins = new Array(12).fill(0);
    for (const [contrib, places] of Object.entries(table)) {
      if (contrib === 'total') continue;
      const cs = contributorSign[contrib];
      for (const place of places) bins[(cs + place - 1) % 12] += 1;
    }
    bav[planet] = bins;
    bavTotals[planet] = bins.reduce((a, b) => a + b, 0);
  }
  const sav = Array.from({ length: 12 }, (_, s) =>
    Object.values(bav).reduce((t, bins) => t + bins[s], 0));
  return { bav, bavTotals, sav, savTotal: sav.reduce((a, b) => a + b, 0) };
}

// — Jaimini arudha padas —

/**
 * Arudha padas for all twelve houses. For house n with sign S: count from
 * S to its lord (inclusive), then the same count again from the lord —
 * that sign is the pada. A pada landing on S itself or on its 7th moves
 * to the 10th therefrom (the Jaimini exception: the reflection may not
 * fall in its own house or oppose it). Traditional sign lords.
 * @param {number} ascSiderealLon degrees
 * @param {Object} sidBodies sidereal bodies keyed sun…saturn, each { lon }
 * @returns {Object} A1…A12 plus AL (= A1) and UL (= A12, the upapada);
 *   each { house, baseSign, baseSignName, lord, sign, signName,
 *   houseFromLagna }.
 */
export function arudhaLagnas(ascSiderealLon, sidBodies) {
  const ascSign = Math.floor(norm360(ascSiderealLon) / 30);
  const out = {};
  for (let house = 1; house <= 12; house++) {
    const S = (ascSign + house - 1) % 12;
    const lord = SIGN_LORDS[S];
    const lordSign = Math.floor(norm360(sidBodies[lord].lon) / 30);
    const count = ((lordSign - S + 12) % 12) + 1;      // sign → lord, inclusive
    let pada = (lordSign + count - 1) % 12;            // the same count again
    if (pada === S || pada === (S + 6) % 12) pada = (pada + 9) % 12;
    out[`A${house}`] = {
      house,
      baseSign: S,
      baseSignName: SIGNS[S],
      lord,
      sign: pada,
      signName: SIGNS[pada],
      houseFromLagna: ((pada - ascSign + 12) % 12) + 1,
    };
  }
  return { ...out, AL: out.A1, UL: out.A12 };
}

// — yogi and avayogi —

const BODY_NAMES = {
  sun: 'Sun', moon: 'Moon', mars: 'Mars', mercury: 'Mercury',
  jupiter: 'Jupiter', venus: 'Venus', saturn: 'Saturn',
};

/**
 * Yogi and avayogi. The yoga sphuta = Sun + Moon + 93°20′ (the distance
 * from 0° Aries to Pushya's start); its nakshatra lord is the yogi graha
 * and its sign lord the duplicate yogi (sahayogi). The avayogi point is
 * the opposite point (+180° — astro-seek's convention, the fixture
 * anchor; some software counts +186°40′ instead) and its nakshatra lord
 * the avayogi graha. Fixture V1 prints yogi Virgo 19°54′ (Hasta → Moon),
 * avayogi Pisces 19°54′ (Revati → Mercury).
 * @param {number} sunSiderealLon degrees
 * @param {number} moonSiderealLon degrees
 * @returns {{ point:Object, planet:string, duplicate:string,
 *   avayogi:{ point:Object, planet:string } }} points are describe()
 *   shapes ({ siderealLon, sign, signName, degInSign, nakshatra }).
 */
export function yogiPoint(sunSiderealLon, moonSiderealLon) {
  const point = describe(norm360(sunSiderealLon + moonSiderealLon + 93 + 20 / 60));
  const avayogi = describe(norm360(point.siderealLon + 180));
  return {
    point,
    planet: point.nakshatra.lord,
    duplicate: BODY_NAMES[SIGN_LORDS[point.sign]],
    avayogi: { point: avayogi, planet: avayogi.nakshatra.lord },
  };
}

// — the assembled chart (the one function the page calls) —

const PLANET_KEYS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const VARGA_SET = [9, 10, 12, 20, 60];

/**
 * The full Vedic chart per the fable-handoff §4 contract: sidereal (Lahiri)
 * positions, whole-sign houses, nakshatras, vargas, chara karakas +
 * karakamsa, Vimshottari dashas — plus ashtakavarga, arudha padas and the
 * yogi/avayogi points. Nodes are the mean node (ephemeris default),
 * always retrograde, labeled.
 * @param {{ utDate:Date, latDeg:number, lonDeg:number }} input
 *   utDate — the UT birth instant; latDeg/lonDeg — geographic, north/east +.
 */
export function buildVedicChart({ utDate, latDeg, lonDeg }) {
  const ayan = ayanamsa(utDate);
  const trop = positions(utDate);
  const sid = sidereal(trop, ayan);
  const angles = sidereal(ascendant(utDate, latDeg, lonDeg), ayan);
  const { ascSign, houses, houseOf } = wholeSignHouses(angles.asc.lon);

  const entry = (body, { lon, retro, speed }) => ({ body, ...describe(lon), house: houseOf(lon), retro, speed });
  const planets = PLANET_KEYS.map((k) => entry(k, sid.bodies[k]));
  const nodes = {
    type: 'mean',
    rahu: entry('rahu', sid.bodies.meanNode),
    ketu: entry('ketu', sid.bodies.ketu),
  };

  const vargaLons = Object.fromEntries([
    ...planets.map((p) => [p.body, p.siderealLon]),
    ['rahu', nodes.rahu.siderealLon],
    ['ketu', nodes.ketu.siderealLon],
    ['asc', norm360(angles.asc.lon)],
  ]);
  const vargas = {};
  for (const n of VARGA_SET) {
    vargas[`D${n}`] = Object.fromEntries(
      Object.entries(vargaLons).map(([k, lon]) => {
        const { part, sign, signName } = varga(lon, n);
        return [k, { part, sign, signName }];
      }),
    );
  }

  const karakas = charaKarakas(sid.bodies);
  const akBody = karakas.byKaraka.AK;
  const karakamsa = { body: akBody, ...vargas.D9[akBody] };

  const dasha = vimshottari(sid.bodies.moon.lon, utDate);
  const av = ashtakavarga(sid.bodies, angles.asc.lon);
  const arudhas = arudhaLagnas(angles.asc.lon, sid.bodies);
  const yogi = yogiPoint(sid.bodies.sun.lon, sid.bodies.moon.lon);

  const chart = {
    input: { utc: utDate.toISOString(), latDeg, lonDeg },
    jdUT: trop.jdUT,
    ayanamsa: { name: 'Lahiri', deg: ayan },
    houseSystem: 'whole-sign',
    ascendant: { ...describe(angles.asc.lon), house: 1 },
    mc: { ...describe(angles.mc.lon), house: houseOf(angles.mc.lon) },
    ascSign,
    houses,
    planets,
    nodes,
    vargas,
    karakas,
    karakamsa,
    ashtakavarga: av,
    arudhas,
    yogi,
    dashas: dasha.mahadashas,
    dashaBalance: {
      lord: dasha.balance.lord,
      years: dasha.balance.years,
      nakshatra: dasha.nakshatra,
      elapsedFraction: dasha.elapsedFraction,
    },
  };

  // The technique layers that read the assembled chart (cheap — a few
  // hundred arithmetic ops). The per-varga charts stay on demand:
  // vargaChartOf(chart, n).
  chart.aspects = aspects(aspectInputsOf(vargaChartOf(chart, 1)));
  chart.karakamsaFrame = karakamsaFrame(chart);
  chart.upapada = upapadaDetail(chart);
  return chart;
}

/**
 * Hand-derived unit cases + the Fixture V1 targets this module must
 * reproduce (docs/engine-fixtures.md). The varga cases feed varga() the
 * exact printed longitudes, so they are engine-independent; each note is
 * the classical derivation. The v1 block is asserted through
 * buildVedicChart() (engine longitudes are within 0.7′ of the print, far
 * from every relevant part boundary).
 */
export const TEST_FIXTURES = {
  vargaHandCases: [
    { n: 9, lon: 0, sign: 'Aries', note: '0°00′ Aries — 1st navamsha; fire counts from Aries' },
    { n: 9, lon: 257 + 39 / 60, sign: 'Virgo', note: 'Sagittarius 17°39′ — 6th navamsha (17°39′ ÷ 3°20′) of a fire sign, from Aries' },
    { n: 9, lon: 178 + 55 / 60, sign: 'Virgo', note: 'Virgo 28°55′ — 9th navamsha of an earth sign, from Capricorn → Virgo (vargottama)' },
    { n: 2, lon: 257 + 39 / 60, sign: 'Cancer', note: 'Sagittarius 17°39′ — 2nd hora of an odd sign = Moon = Cancer' },
    { n: 2, lon: 178 + 55 / 60, sign: 'Leo', note: 'Virgo 28°55′ — 2nd hora of an even sign = Sun = Leo' },
    { n: 3, lon: 257 + 39 / 60, sign: 'Aries', note: 'Sagittarius 17°39′ — 2nd drekkana = 5th from Sagittarius' },
    { n: 3, lon: 178 + 55 / 60, sign: 'Taurus', note: 'Virgo 28°55′ — 3rd drekkana = 9th from Virgo' },
    { n: 7, lon: 257 + 39 / 60, sign: 'Aries', note: 'Sagittarius 17°39′ — 5th saptamsha; odd sign counts from itself' },
    { n: 7, lon: 178 + 55 / 60, sign: 'Virgo', note: 'Virgo 28°55′ — 7th saptamsha; even sign counts from its 7th (Pisces)' },
    { n: 10, lon: 257 + 39 / 60, sign: 'Taurus', note: 'Sagittarius 17°39′ — 6th dasamsha; odd sign counts from itself' },
    { n: 10, lon: 178 + 55 / 60, sign: 'Aquarius', note: 'Virgo 28°55′ — 10th dasamsha; even sign counts from its 9th (Taurus)' },
    { n: 12, lon: 257 + 39 / 60, sign: 'Cancer', note: 'Sagittarius 17°39′ — 8th dwadasamsha from the sign itself' },
    { n: 12, lon: 178 + 55 / 60, sign: 'Leo', note: 'Virgo 28°55′ — 12th dwadasamsha from Virgo' },
    { n: 20, lon: 257 + 39 / 60, sign: 'Cancer', note: 'Sagittarius 17°39′ — 12th vimsamsha; dual sign counts from Leo' },
    { n: 20, lon: 178 + 55 / 60, sign: 'Pisces', note: 'Virgo 28°55′ — 20th vimsamsha; dual sign counts from Leo' },
    { n: 27, lon: 257 + 39 / 60, sign: 'Cancer', note: 'Sagittarius 17°39′ — 16th bhamsha; fire counts from Aries' },
    { n: 27, lon: 178 + 55 / 60, sign: 'Virgo', note: 'Virgo 28°55′ — 27th (last) bhamsha; earth counts from Cancer' },
    { n: 30, lon: 3, sign: 'Aries', note: 'Aries 3° — odd-sign trimsamsha, 0–5° Mars band → Aries' },
    { n: 30, lon: 257 + 39 / 60, sign: 'Sagittarius', note: 'Sagittarius 17°39′ — odd-sign trimsamsha, 10–18° Jupiter band' },
    { n: 30, lon: 32, sign: 'Taurus', note: 'Taurus 2° — even-sign trimsamsha, 0–5° Venus band → Taurus' },
    { n: 30, lon: 178 + 55 / 60, sign: 'Scorpio', note: 'Virgo 28°55′ — even-sign trimsamsha, 25–30° Mars band → Scorpio' },
    { n: 60, lon: 0, sign: 'Aries', note: '0°00′ Aries — 1st shashtiamsha, counted from the sign itself' },
    { n: 60, lon: 257 + 39 / 60, sign: 'Scorpio', note: 'Sagittarius 17°39′ — ⌊2·17.65⌋ = 35 → 36th from Sagittarius = Scorpio' },
    { n: 60, lon: 178 + 55 / 60, sign: 'Gemini', note: 'Virgo 28°55′ — ⌊2·28.92⌋ = 57 → 58th from Virgo = Gemini' },
  ],
  vimshottari: {
    // Moon at 0° Ashwini: nakshatra lord Ketu, nothing elapsed → full 7y.
    ashwiniZero: { moonLon: 0, lord: 'Ketu', balanceYears: 7, elapsedFraction: 0 },
    // Fixture Moon (printed): Chitra pada 2, lord Mars. Chitra spans
    // 173°20′–186°40′; elapsed = 5°35′ / 13°20′ = 0.41875 exactly.
    fixtureMoon: { moonLon: 178 + 55 / 60, lord: 'Mars', elapsedFraction: 0.41875 },
  },
  // Chart-independent structural invariants of the BPHS tables.
  ashtakavargaInvariants: {
    bavTotals: { sun: 48, moon: 49, mars: 39, mercury: 54, jupiter: 56, venus: 52, saturn: 39 },
    savTotal: 337,
  },
  // Engine-independent arudha unit cases exercising the 1st/7th exception
  // (lagna Aries, Mars the lord; only A1 asserted).
  arudhaExceptionCases: [
    { asc: 0, marsLon: 15, arudha: 'Capricorn', note: 'lord in the sign itself — pada = the sign, moved to its 10th' },
    { asc: 0, marsLon: 195, arudha: 'Capricorn', note: 'lord in the 7th — pada reflects home, moved to its 10th' },
    { asc: 0, marsLon: 105, arudha: 'Cancer', note: 'lord in the 4th — pada = the 7th, moved to the 10th therefrom (the 4th)' },
  ],
  v1: {
    source: 'docs/engine-fixtures.md — Fixture V1 (astro-seek)',
    input: { utc: '1970-01-01T22:00:00Z', latDeg: 44.4333, lonDeg: 26.1 },
    ascSignName: 'Virgo',
    houses: {
      sun: 4, moon: 1, mercury: 5, venus: 4, mars: 6, jupiter: 2,
      saturn: 8, uranus: 1, neptune: 3, pluto: 1, rahu: 6, ketu: 12,
    },
    nakshatraLords: {
      sun: 'Venus', moon: 'Mars', mercury: 'Sun', venus: 'Ketu', mars: 'Rahu',
      jupiter: 'Rahu', saturn: 'Ketu', uranus: 'Moon', neptune: 'Saturn',
      pluto: 'Sun', rahu: 'Jupiter', ketu: 'Venus',
    },
    // Chara karaka ranking derived from the printed in-sign degrees
    // (Moon 28°55′ highest — the chart marks Ak beside the Moon; Rahu at
    // Aquarius 21°47′ counts as 30° − 21°47′ = 8°13′):
    karakas: { AK: 'moon', AmK: 'mars', BK: 'sun', MK: 'venus', PiK: 'jupiter', PK: 'saturn', GK: 'rahu', DK: 'mercury' },
    karakamsaSign: 'Virgo',                 // AK Moon's 9th navamsha, earth → from Capricorn
    openingDashaLords: ['Mars', 'Rahu', 'Jupiter'],
    // Arudha padas hand-counted from the printed sign placements (lagna
    // Virgo, traditional lords). A3 and A5 exercise the 1st/7th exception.
    // The fixture doc prints only AL: Taurus, 9th house from lagna.
    arudhas: {
      A1: 'Taurus', A2: 'Aquarius', A3: 'Aquarius', A4: 'Leo',
      A5: 'Aries', A6: 'Gemini', A7: 'Taurus', A8: 'Sagittarius',
      A9: 'Cancer', A10: 'Leo', A11: 'Scorpio', A12: 'Aries',
    },
    alHouseFromLagna: 9,
    // Ashtakavarga cells hand-counted from the printed sign placements
    // (Sun Sag · Moon Vir · Mars Aqu · Mercury Cap · Jupiter Lib ·
    // Venus Sag · Saturn Ari · lagna Vir).
    ashtakavargaCells: [
      { planet: 'sun', signName: 'Aries', bindus: 1, note: 'only Saturn (1st from itself) contributes' },
      { planet: 'sun', signName: 'Sagittarius', bindus: 5, note: 'Sun 1 · Mars 11 · Mercury 12 · Saturn 9 · lagna 4' },
      { planet: 'moon', signName: 'Virgo', bindus: 5, note: 'Sun 10 · Moon 1 · Jupiter 12 · Venus 10 · Saturn 6' },
      { planet: 'jupiter', signName: 'Libra', bindus: 6, note: 'Sun 11 · Moon 2 · Mercury 10 · Jupiter 1 · Venus 11 · lagna 2' },
      { planet: 'saturn', signName: 'Aries', bindus: 1, note: 'only Mars (3rd from Aquarius) contributes' },
    ],
    // Yogi/avayogi from the printed longitudes:
    // 257°39′ + 178°55′ + 93°20′ = 529°54′ → Virgo 19°54′; opposite → Pisces 19°54′.
    yogi: {
      pointLon: 169 + 54 / 60, pointSignName: 'Virgo',
      avayogiLon: 349 + 54 / 60, avayogiSignName: 'Pisces',
      toleranceArcmin: 2,
      planet: 'Moon',            // Hasta's lord
      avayogiPlanet: 'Mercury',  // Revati's lord
      duplicate: 'Mercury',      // Virgo's lord
    },
  },
};
