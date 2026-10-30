// ============================================================
// Cast — one birth record in, every system out. The single
// orchestration point the server and exporters call.
//
// Birth record shape (stored on profiles, or ad-hoc):
//   { date: 'YYYY-MM-DD', time: 'HH:MM'|null, timeUnknown: bool,
//     lat, lon, tz, place }
// Unknown time → noon cast, flagged; HD is withheld (the design
// instant needs the hour); house/varga-dependent layers carry
// the flag. Degrade honestly rather than guessing.
// ============================================================
import { utFromLocal } from './engine/geo.js';
import { positions, ascendant, norm360 } from './engine/ephemeris.js';
import { buildVedicChart, vargaChartOf, varga, SIGNS } from './engine/jyotish.js';
import { buildHDChart } from './engine/humandesign.js';
import { matrixChart } from './engine/matrix.js';
import { panchanga } from './atlas/panchanga.mjs';
import { nakshatraDetail } from './atlas/nakshatra-meta.mjs';
import { charaDasha, strengthReport, rashiAspectSources } from './atlas/jaimini.mjs';
import { ringCalendar } from './atlas/matrix-calendar.mjs';
import { SIGNS as SIGN_NAMES } from './engine/jyotish.js';

// the full astro-seek chart list; only engine-implemented ones are exposed
const CANDIDATE_VARGAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 20, 24, 27, 30, 40, 45, 60, 81, 108, 144];

/** Parse the stored strings; throws with a clear message on bad input. */
export function parseBirth(birth) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth?.date ?? '');
  if (!m) throw new Error(`bad or missing date (want YYYY-MM-DD): ${birth?.date}`);
  const [year, month, day] = [+m[1], +m[2], +m[3]];
  const timeUnknown = !!birth.timeUnknown || !birth.time;
  let hour = 12, minute = 0;
  if (!timeUnknown) {
    const t = /^(\d{1,2}):(\d{2})$/.exec(birth.time);
    if (!t) throw new Error(`bad time (want HH:MM): ${birth.time}`);
    [hour, minute] = [+t[1], +t[2]];
    if (hour > 23 || minute > 59) throw new Error(`time out of range: ${birth.time}`);
  }
  if (typeof birth.lat !== 'number' || typeof birth.lon !== 'number')
    throw new Error('lat/lon must be numbers');
  if (!birth.tz) throw new Error('tz (IANA zone) is required');
  return { year, month, day, hour, minute, timeUnknown, lat: birth.lat, lon: birth.lon, tz: birth.tz };
}

/**
 * Cast everything for a birth record.
 * @returns {{ meta, vedic, nakshatras, hd, matrix, panchanga, jaimini, tropical }}
 */
export function castAll(birth) {
  const b = parseBirth(birth);
  const { ut, offsetMinutes, ambiguous } = utFromLocal({
    year: b.year, month: b.month, day: b.day, hour: b.hour, minute: b.minute, tz: b.tz,
  });

  const vedic = buildVedicChart({ utDate: ut, latDeg: b.lat, lonDeg: b.lon });

  // Expose every varga the engine implements (buildVedicChart precomputes a
  // conservative subset). Probed, not hardcoded — a resync that teaches the
  // engine new vargas lights them up here with no further change.
  const ALL_VARGAS = CANDIDATE_VARGAS.filter((n) => {
    try { varga(15, n); return true; } catch { return false; }
  });
  const lons = {
    ...Object.fromEntries(vedic.planets.map((p) => [p.body, p.siderealLon])),
    rahu: vedic.nodes.rahu.siderealLon,
    ketu: vedic.nodes.ketu.siderealLon,
    asc: vedic.ascendant.siderealLon,
  };
  const vargas = {};
  for (const n of ALL_VARGAS) {
    vargas[`D${n}`] = vedic.vargas[`D${n}`] ?? Object.fromEntries(
      Object.entries(lons).map(([k, lon]) => {
        const { part, sign, signName } = varga(lon, n);
        return [k, { part, sign, signName }];
      }),
    );
  }
  vedic.vargas = vargas;
  const hd = b.timeUnknown ? null : buildHDChart({ utDate: ut });
  const matrix = matrixChart({ day: b.day, month: b.month, year: b.year });
  matrix.ageRing = ringCalendar(matrix.ageRing, b);
  const pan = panchanga({ utDate: ut, latDeg: b.lat, lonDeg: b.lon, tz: b.tz });

  // nakshatra detail for every body + the angles (the reference-table layer)
  const nakTable = {};
  for (const p of vedic.planets) nakTable[p.body] = nakshatraDetail(p.siderealLon);
  nakTable.rahu = nakshatraDetail(vedic.nodes.rahu.siderealLon);
  nakTable.ketu = nakshatraDetail(vedic.nodes.ketu.siderealLon);
  nakTable.asc = nakshatraDetail(vedic.ascendant.siderealLon);

  // — the tropical view: same instant, no ayanamsa; whole-sign from the tropical asc —
  const tropPos = positions(ut);
  const tropAng = ascendant(ut, b.lat, b.lon);
  const tropAscSign = Math.floor(norm360(tropAng.asc.lon) / 30);
  const tropEntry = (key, src) => {
    const lon = norm360(src.lon);
    const sign = Math.floor(lon / 30);
    return {
      key, lon, sign, signName: SIGNS[sign], degInSign: lon - sign * 30,
      retro: !!src.retro,
      house: b.timeUnknown ? null : ((sign - tropAscSign + 12) % 12) + 1,
    };
  };
  const tropical = {
    zodiac: 'tropical',
    note: 'same instant, no ayanamsa; houses whole-sign from the tropical ascendant',
    ascendant: b.timeUnknown ? null : tropEntry('asc', tropAng.asc),
    mc: b.timeUnknown ? null : tropEntry('mc', tropAng.mc),
    bodies: [
      ...['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']
        .map((k) => tropEntry(k, tropPos.bodies[k])),
      tropEntry('rahu', tropPos.bodies.meanNode),
      tropEntry('ketu', tropPos.bodies.ketu),
    ],
  };

  return {
    tropical,
    meta: {
      input: { ...birth },
      utc: ut.toISOString(),
      offsetMinutes,
      offsetAmbiguous: ambiguous,
      timeUnknown: b.timeUnknown,
      noonCast: b.timeUnknown,
      ayanamsa: vedic.ayanamsa,
      houseSystem: vedic.houseSystem,
      engine: 'astronomy-engine (MIT) · Lahiri ayanamsa · whole-sign houses',
      castAt: new Date().toISOString(),
      caveats: [
        b.timeUnknown ? 'no birth time: noon cast — houses, lagna, D-charts, HD chart and exact dasha dates are withheld or unreliable' : null,
        ambiguous ? 'the local birth time falls in a DST fold/gap — the earlier offset was applied' : null,
      ].filter(Boolean),
    },
    vedic,
    nakshatras: nakTable,
    hd,
    matrix,
    panchanga: pan,
    jaimini: {
      charaDasha: b.timeUnknown
        ? { note: 'needs birth time — the lagna anchors the sequence' }
        // the LOCAL civil date, not `ut` — same source matrixChart uses above
        : charaDasha(vedic, { year: b.year, month: b.month, day: b.day }),
      strength: strengthReport(vedic),
      rashiDrishti: SIGN_NAMES.map((s, i) => ({
        sign: s,
        aspects: rashiAspectSources(i).map((j) => SIGN_NAMES[j]),
      })),
    },
  };
}

/** A per-varga chart (bodies placed in the D-n) for display/export. */
export function vargaView(vedic, n) {
  return vargaChartOf(vedic, n);
}
