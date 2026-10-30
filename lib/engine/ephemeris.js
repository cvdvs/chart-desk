// ============================================================
// Ephemeris — the shared astronomical foundation for the Vedic
// and Human Design engines (build-plan segment 2a).
// Pure ESM, no DOM, no node APIs; runs identically in the
// browser (the on-device promise) and in node (the tests).
//
// One dependency: `astronomy-engine` (MIT, Don Cross) — VSOP87-
// derived planetary series + lunar theory in a single ~118 KB
// minified file, stated accuracy ±1′ vs JPL over 1700–2100.
// Chosen over Swiss Ephemeris ports (AGPL/GPL — incompatible
// with keeping this repo's license unencumbered) and over full
// VSOP87 data packages (astronomia, MIT but ~MBs of series data
// for precision we don't need). Validated against Fixture V1 in
// docs/engine-fixtures.md: every body within 0.7′ of astro-seek
// (gate: ±2′ classical, ±3′ outers).
//
// What "apparent" means here (astro-seek prints apparent):
// light-travel time + aberration (astronomy-engine's GeoVector),
// precession + nutation to the true ecliptic/equinox of date
// (astronomy-engine's Ecliptic, v2.1.19+). The Sun and Moon use
// the library's dedicated of-date functions.
//
// Implemented locally (astronomy-engine lacks them):
// · mean lunar node — Meeus, Astronomical Algorithms (2nd ed.),
//   ch. 47.7 polynomial, + nutation so it sits in the same
//   true-equinox frame as the planets. Rahu = mean node (the
//   default node everywhere); Ketu = +180°.
// · true (osculating) lunar node — from the Moon's geocentric
//   state vector: r × v spans the instantaneous orbit plane; its
//   northbound cut of the true ecliptic of date is the node.
//   Validated two ways (TEST_FIXTURES.trueNode): the crossing
//   identity — whenever the Moon crosses the ecliptic northbound
//   its longitude IS the osculating node's; the engine agrees to
//   <0.1″ — and astro-seek's sidebar true node for 2026-07-08
//   (the screenshot day), reproduced to 0.02′. Mean stays the
//   default; both are always labeled.
// · Lahiri (Chitrapaksha) ayanamsa — the Swiss Ephemeris
//   definition: 23°15′00.658″ at 1956-03-21.0 ET (JD 2435553.5),
//   advanced by general precession in longitude (Lieske/IAU-1976),
//   + nutation to refer it to the true equinox. Gives 23°26.6′
//   on 1970-01-01, matching astro-seek's printed 23°26′.
// · mean obliquity (Meeus 22.2) + a 4-term nutation series
//   (Meeus ch. 22 truncation, error < 0.5″) for the ascendant.
//
// Date-range caveat: trust 1700–2100 (astronomy-engine's stated
// ±1′ window; Pluto's model is fitted to that span). Inside
// 1900–2100 expect well under 1′ for the classical bodies.
// ============================================================

import {
  Body,
  MakeTime,
  GeoVector,
  Ecliptic,
  SunPosition,
  EclipticGeoMoon,
  SiderealTime,
  GeoMoonState,
  Rotation_EQJ_ECT,
  RotateVector,
  Vector,
} from 'astronomy-engine';

const DEG = Math.PI / 180;

/** Normalize an angle to [0, 360). */
export function norm360(d) {
  return ((d % 360) + 360) % 360;
}

/** Signed angular difference a − b, normalized to (−180, 180]. */
function angleDiff(a, b) {
  let d = norm360(a - b);
  if (d > 180) d -= 360;
  return d;
}

// — local models (T = Julian centuries of TT from J2000.0) —

/** Mean obliquity of the ecliptic, degrees (Meeus 22.2). */
function meanObliquity(T) {
  return 23 + 26 / 60 + (21.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T * T * T) / 3600;
}

/** Fundamental angles for the short nutation series, degrees. */
function nutationArgs(T) {
  return {
    omega: norm360(125.04452 - 1934.136261 * T),   // lunar ascending node
    sunL: norm360(280.4665 + 36000.7698 * T),      // mean longitude, Sun
    moonL: norm360(218.3165 + 481267.8813 * T),    // mean longitude, Moon
  };
}

/** Nutation in longitude Δψ, degrees (Meeus ch. 22, 4-term; error < 0.5″). */
function nutationLongitude(T) {
  const { omega, sunL, moonL } = nutationArgs(T);
  return (
    -17.20 * Math.sin(omega * DEG)
    - 1.32 * Math.sin(2 * sunL * DEG)
    - 0.23 * Math.sin(2 * moonL * DEG)
    + 0.21 * Math.sin(2 * omega * DEG)
  ) / 3600;
}

/** Nutation in obliquity Δε, degrees (Meeus ch. 22, 4-term). */
function nutationObliquity(T) {
  const { omega, sunL, moonL } = nutationArgs(T);
  return (
    9.20 * Math.cos(omega * DEG)
    + 0.57 * Math.cos(2 * sunL * DEG)
    + 0.10 * Math.cos(2 * moonL * DEG)
    - 0.09 * Math.cos(2 * omega * DEG)
  ) / 3600;
}

/** Mean lunar node, degrees, mean equinox of date (Meeus 47.7). */
function meanLunarNode(T) {
  return norm360(
    125.0445479
    - 1934.1362891 * T
    + 0.0020754 * T * T
    + (T * T * T) / 467441
    - (T * T * T * T) / 60616000,
  );
}

/**
 * Osculating (true) lunar node, tropical degrees of date.
 * The Moon's geocentric state vector (EQJ) gives the instantaneous
 * orbital angular momentum h = r × v; rotated into the true ecliptic of
 * date, the ascending node — where the orbit plane cuts the ecliptic
 * going north — is Ω = atan2(h_x, −h_y). Geometric position (no
 * light-time), as osculating elements are defined; the Moon's light-time
 * displacement is <1″ anyway. Unlike the mean node, the true node's
 * speed genuinely changes sign — it runs direct for days at a stretch.
 */
function trueNodeLongitude(time) {
  const s = GeoMoonState(time);
  const h = RotateVector(Rotation_EQJ_ECT(time), new Vector(
    s.y * s.vz - s.z * s.vy,
    s.z * s.vx - s.x * s.vz,
    s.x * s.vy - s.y * s.vx,
    time,
  ));
  return norm360(Math.atan2(h.x, -h.y) / DEG);
}

// — apparent tropical longitude of one body at one instant —

const PLANETS = {
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
};

const BODY_ORDER = [
  'sun', 'moon', 'mercury', 'venus', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'meanNode', 'trueNode',
];

function tropicalLongitude(key, time) {
  if (key === 'sun') return SunPosition(time).elon;          // of-date, light-time corrected
  if (key === 'moon') return EclipticGeoMoon(time).lon;      // of-date lunar theory
  if (key === 'meanNode') {
    const T = time.tt / 36525;
    return norm360(meanLunarNode(T) + nutationLongitude(T)); // into the true-equinox frame
  }
  if (key === 'trueNode') return trueNodeLongitude(time);    // osculating node
  const vec = GeoVector(PLANETS[key], time, true);           // light-time + aberration, EQJ
  return Ecliptic(vec).elon;                                 // → true ecliptic of date
}

/**
 * Geocentric apparent tropical ecliptic longitudes.
 * @param {Date} utDate — the UT instant (a JS Date is UT by construction).
 * @returns {{ jdUT:number, bodies:Object }} bodies keyed sun…pluto,
 *   meanNode (Rahu, the default node), ketu (meanNode + 180°),
 *   trueNode (the osculating node) and trueKetu (trueNode + 180°); each
 *   { lon:degrees, speed:degrees/day, retro:boolean }.
 *   Speed is a central difference over ±0.1 day — near a station
 *   (|speed| ≈ 0) the flag is genuinely ambiguous, as in the sky.
 *   (The true node really does station and run direct at times.)
 */
export function positions(utDate) {
  const time = MakeTime(utDate);
  const dt = 0.1; // days
  const before = time.AddDays(-dt);
  const after = time.AddDays(dt);
  const bodies = {};
  for (const key of BODY_ORDER) {
    const lon = tropicalLongitude(key, time);
    const speed = angleDiff(tropicalLongitude(key, after), tropicalLongitude(key, before)) / (2 * dt);
    bodies[key] = { lon, speed, retro: speed < 0 };
  }
  bodies.ketu = { ...bodies.meanNode, lon: norm360(bodies.meanNode.lon + 180) };
  bodies.trueKetu = { ...bodies.trueNode, lon: norm360(bodies.trueNode.lon + 180) };
  return { jdUT: time.ut + 2451545.0, bodies };
}

/**
 * Lahiri (Chitrapaksha) ayanamsa, degrees — Swiss Ephemeris definition:
 * 23°15′00.658″ at JD 2435553.5 TT, carried by general precession in
 * longitude (Lieske/IAU-1976), referred to the true equinox of date so
 * that sidereal = apparent tropical − ayanamsa is frame-consistent.
 * ≈ 23°26′ on 1970-01-01 (the fixture's printed value).
 * @param {Date} utDate
 */
export function ayanamsa(utDate) {
  const time = MakeTime(utDate);
  const jdTT = time.tt + 2451545.0;
  const T0JD = 2435553.5;                       // 1956-03-21.0 ET
  const AYAN_T0 = 23 + 15 / 60 + 0.658 / 3600;  // 23°15′00.658″
  const T0 = (T0JD - 2451545.0) / 36525;
  const t = (jdTT - T0JD) / 36525;
  const pA = ( // general precession in longitude from t0 to date, arcsec
    (5029.0966 + 2.22226 * T0 - 0.000042 * T0 * T0) * t
    + (1.11113 - 0.000042 * T0) * t * t
    - 0.000006 * t * t * t
  ) / 3600;
  return AYAN_T0 + pA + nutationLongitude(time.tt / 36525);
}

/**
 * Tropical → sidereal. Walks any structure and shifts every node that
 * carries a numeric `lon` (a tropical longitude in degrees) by −ayanamsa;
 * everything else (speed, retro, lstHours, jdUT…) passes through untouched.
 * Feed it the result of positions() or ascendant(), or a single { lon }.
 * @param {Object} positionsLike
 * @param {number} ayanamsaDeg
 */
export function sidereal(positionsLike, ayanamsaDeg) {
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      if (typeof v.lon === 'number') return { ...v, lon: norm360(v.lon - ayanamsaDeg) };
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(positionsLike);
}

/**
 * Tropical ascendant + midheaven.
 * GAST (apparent sidereal time, from astronomy-engine — matches
 * astro-seek's printed LST to the second) → local sidereal time →
 * standard spherical formulas with the true obliquity of date.
 * Degenerate within ~½° of the poles (tan φ) — not a birth-chart case.
 * @param {Date} utDate
 * @param {number} latDeg geographic latitude, north positive
 * @param {number} lonDeg geographic longitude, east positive
 * @returns {{ asc:{lon:number}, mc:{lon:number}, lstHours:number }} tropical degrees
 */
export function ascendant(utDate, latDeg, lonDeg) {
  const time = MakeTime(utDate);
  const lstHours = ((SiderealTime(time) + lonDeg / 15) % 24 + 24) % 24;
  const theta = lstHours * 15 * DEG;             // RAMC
  const T = time.tt / 36525;
  const eps = (meanObliquity(T) + nutationObliquity(T)) * DEG;
  const phi = latDeg * DEG;
  const asc = norm360(Math.atan2(
    Math.cos(theta),
    -(Math.sin(theta) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)),
  ) / DEG);
  const mc = norm360(Math.atan2(Math.sin(theta), Math.cos(theta) * Math.cos(eps)) / DEG);
  return { asc: { lon: asc }, mc: { lon: mc }, lstHours };
}

// — nakshatras (from sidereal longitude; 27 × 13°20′, 4 padas each) —

export const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
  'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];

/** Vimshottari lord cycle — nakshatra i is ruled by LORDS[i % 9]. */
const NAKSHATRA_LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];

/**
 * Nakshatra + pada for a sidereal longitude.
 * @param {number} siderealLon degrees
 * @returns {{ index:number, name:string, pada:number, lord:string }}
 */
export function nakshatraOf(siderealLon) {
  const span = 360 / 27;
  const lon = norm360(siderealLon);
  const index = Math.min(26, Math.floor(lon / span));
  const pada = Math.min(4, Math.floor((lon - index * span) / (span / 4)) + 1);
  return { index, name: NAKSHATRAS[index], pada, lord: NAKSHATRA_LORDS[index % 9] };
}

/**
 * Fixture V1 from docs/engine-fixtures.md — astro-seek sidereal chart,
 * 2 Jan 1970 00:00 EET, Bucharest (astro-seek derives UT 1 Jan 22:00,
 * LST 06:28:56). Longitudes in decimal degrees, transcribed from the
 * sign°min table (so each carries ±0.5′ print quantization). Nakshatra
 * names canonicalized (fixture doc spells Aswini / Purva Bhadra —
 * same nakshatras, our NAKSHATRAS spellings).
 * Acceptance: classical bodies + nodes + ASC within ±2′; outers ±3′;
 * nakshatra + pada exact; retro flags exact.
 */
export const TEST_FIXTURES = {
  v1: {
    source: 'docs/engine-fixtures.md — Fixture V1 (astro-seek, 2026-07-08)',
    input: { utc: '1970-01-01T22:00:00Z', latDeg: 44.4333, lonDeg: 26.1 },
    lstHours: 6 + 28 / 60 + 56 / 3600,
    ayanamsaApproxDeg: 23 + 26 / 60,          // astro-seek prints 23°26′
    toleranceArcmin: { classical: 2, outer: 3 },
    outers: ['uranus', 'neptune', 'pluto'],
    sidereal: {
      sun: { lon: 257 + 39 / 60, retro: false, nakshatra: 'Purva Ashadha', pada: 2 },
      moon: { lon: 178 + 55 / 60, retro: false, nakshatra: 'Chitra', pada: 2 },
      mercury: { lon: 276 + 2 / 60, retro: false, nakshatra: 'Uttara Ashadha', pada: 3 },
      venus: { lon: 252 + 10 / 60, retro: false, nakshatra: 'Mula', pada: 4 },
      mars: { lon: 319 + 28 / 60, retro: false, nakshatra: 'Shatabhisha', pada: 4 },
      jupiter: { lon: 189, retro: false, nakshatra: 'Swati', pada: 1 },
      saturn: { lon: 8 + 37 / 60, retro: true, nakshatra: 'Ashwini', pada: 3 },
      uranus: { lon: 165 + 17 / 60, retro: false, nakshatra: 'Hasta', pada: 2 },
      neptune: { lon: 216 + 28 / 60, retro: false, nakshatra: 'Anuradha', pada: 1 },
      pluto: { lon: 153 + 57 / 60, retro: true, nakshatra: 'Uttara Phalguni', pada: 3 },
      meanNode: { lon: 321 + 47 / 60, retro: true, nakshatra: 'Purva Bhadrapada', pada: 1 },
      ketu: { lon: 141 + 47 / 60, retro: true, nakshatra: 'Purva Phalguni', pada: 3 },
    },
    angles: {
      asc: { lon: 162 + 5 / 60, nakshatra: 'Hasta', pada: 1 },
      mc: { lon: 73 + 12 / 60, nakshatra: 'Ardra', pada: 2 },
    },
  },
  trueNode: {
    // The fixtures doc's sidebar value ("true node Pisces 0°44′ tropical")
    // is astro-seek's current-planets widget on the day the screenshots
    // were taken — 2026-07-08 — not the 1970 fixture instant. It cannot be
    // the fixture instant: an osculating node never wanders more than ~1.9°
    // from the mean node, and the mean node at that instant is tropical
    // Pisces 15°14′. The engine's true node holds Pisces 0°43′–0°45′
    // through 2026-07-08 and matches 0°44′ to 0.02′ at 16:00 UT.
    sidebar: { dayUTC: '2026-07-08', tropicalLon: 330 + 44 / 60, toleranceArcmin: 3 },
    // The exact identity that pins the whole computation: when the Moon
    // crosses the ecliptic northbound it sits on the node line, so its
    // longitude equals the osculating node's at that instant.
    crossingToleranceArcmin: 0.05,
    // Envelope of the osculating node's wander around the mean node.
    maxMeanDeviationDeg: 2.0,
    // Engine value at the fixture instant, for the record (tropical
    // Pisces 14°03′ = sidereal Aquarius 20°36′, Purva Bhadrapada 1).
    fixtureInstantTropicalLon: 344.05,
  },
};
