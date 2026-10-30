// ============================================================
// Geo — the place layer for the cast screens (build-plan 2b):
// city search over the bundled GeoNames index + historically
// correct local-time → UT conversion. Pure ESM, no DOM, no
// dependencies; runs identically in the browser (the on-device
// promise) and in node (the tests, via an injected fetcher).
//
// · City data: /data/cities/ — emitted by scripts/build-cities.mjs
//   from GeoNames cities15000 (CC BY 4.0 — attribution required;
//   the line lives in the manifest and must appear in the
//   colophon). Shards are keyed by the first letter of the folded
//   name, so a search fetches exactly one shard (+ the manifest)
//   and caches it for the session. Nothing is sent anywhere: the
//   shards are static files, the query never leaves the device.
// · Timezone math: no bundled tz database — Intl.DateTimeFormat
//   with `timeZone` reads the engine's own compiled IANA data.
//   The offset at an instant is recovered by formatting that
//   instant's wall clock in the zone and reassembling the fields
//   as UTC; exact to the second, which matters pre-1900 (offsets
//   like Bucharest's +01:44:24 BMT carry seconds —
//   timeZoneName:'longOffset' isn't reliable for those on every
//   engine, so the reassembly route is used instead).
// · Local → UT is the standard two-pass resolution: probe the
//   offset a day either side of the wall time, validate both
//   candidate instants, then — both valid and equal → unique;
//   both valid and different → DST fold (the clock repeated),
//   take the earlier instant (= the earlier offset) and flag
//   `ambiguous`; neither valid → DST gap (the clock skipped),
//   apply the earlier offset (lands just past the jump) and
//   flag `ambiguous`.
//
// Fidelity caveats (documented, not silent):
// · Intl's history = the engine's compiled IANA tzdb. Browsers
//   and official node builds ship the full history, pre-1970
//   transitions included; node built against a system ICU with
//   slimmed tz data may not. The runtime target is the browser,
//   which is full — validated in node v24 (full-icu): Bucharest
//   1900 correctly resolves to BMT +01:44:24.
// · IANA itself is best-effort before ~1970 and approximate in
//   the LMT era (roughly pre-1890s): charts that old carry
//   inherent minutes-level timezone uncertainty. Surface it in
//   the UI; don't present false precision.
// · Years 1–9999 CE only (no era handling).
// ============================================================

const DATA_BASE = '/data/cities/';
const MAX_RESULTS = 20;
const DAY = 86400000;

// — name folding (shared with the build script — import, don't copy) —

// Letters NFD won't decompose to ASCII (no combining-mark form).
const FOLD_MAP = {
  'ß': 'ss', 'ẞ': 'ss', 'æ': 'ae', 'Æ': 'ae', 'œ': 'oe', 'Œ': 'oe',
  'ø': 'o', 'Ø': 'o', 'đ': 'd', 'Đ': 'd', 'ð': 'd', 'Ð': 'd',
  'þ': 'th', 'Þ': 'th', 'ł': 'l', 'Ł': 'l', 'ı': 'i',
  'ħ': 'h', 'Ħ': 'h', 'ŋ': 'n', 'Ŋ': 'n', 'ĸ': 'k',
};
const FOLD_RE = new RegExp(`[${Object.keys(FOLD_MAP).join('')}]`, 'g');

/**
 * Normalize a place name for matching: strip diacritics, fold the
 * non-decomposing letters, drop apostrophes ("'s-Hertogenbosch" →
 * "s-hertogenbosch"), lowercase, collapse whitespace.
 */
export function fold(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritical marks
    .replace(FOLD_RE, (ch) => FOLD_MAP[ch])
    .replace(/[’ʼ']/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shard key for a name: its first folded letter, or '_' for anything non a–z. */
export function shardKey(s) {
  const c = fold(s)[0];
  return c && c >= 'a' && c <= 'z' ? c : '_';
}

// — shard loading (fetcher injectable so node tests can read from disk) —

let manifestPromise = null;
const shardCache = new Map();

async function getJson(fetcher, url) {
  const res = await fetcher(url);
  if (!res || !res.ok) throw new Error(`geo: failed to load ${url}`);
  return res.json();
}

function loadManifest(fetcher) {
  manifestPromise ??= getJson(fetcher, `${DATA_BASE}manifest.json`);
  return manifestPromise;
}

function loadShard(key, fetcher) {
  if (!shardCache.has(key)) shardCache.set(key, getJson(fetcher, `${DATA_BASE}${key}.json`));
  return shardCache.get(key);
}

/**
 * Search the city index. Prefix match on the folded native and
 * ASCII names, ranked by exact-match first, then population.
 * Loads (and session-caches) only the one shard the query needs.
 *
 * @param {string} query e.g. "buchar", "łódź", "'s-Hert"
 * @param {(url:string)=>Promise<{ok:boolean,json():Promise<any>}>} [fetcher]
 *   defaults to the browser's fetch; tests inject a file reader.
 * @returns {Promise<{name:string,country:string,admin1:string,
 *   lat:number,lon:number,tz:string,population:number}[]>}
 */
export async function searchCities(query, fetcher = (u) => fetch(u)) {
  const q = fold(String(query ?? ''));
  if (!q) return [];
  const manifest = await loadManifest(fetcher);
  const key = q[0] >= 'a' && q[0] <= 'z' ? q[0] : '_';
  if (!(key in manifest.shards)) return [];
  const rows = await loadShard(key, fetcher);

  const hits = [];
  for (const [name, ascii, country, admin1, lat, lon, tzIdx, population] of rows) {
    const fn = fold(name);
    const fa = ascii ? fold(ascii) : fn;
    if (!fn.startsWith(q) && !fa.startsWith(q)) continue;
    const exact = fn === q || fa === q;
    hits.push({
      city: { name, country, admin1, lat, lon, tz: manifest.tz[tzIdx], population },
      score: (exact ? 10 : 0) + Math.log10(population + 10),
    });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      b.city.population - a.city.population ||
      a.city.name.localeCompare(b.city.name),
  );
  return hits.slice(0, MAX_RESULTS).map((h) => h.city);
}

// — historical timezone math via Intl —

const fmtCache = new Map();

function zoneFormatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Date.UTC that treats years 0–99 literally (no 19xx mapping). */
function wallTimeUTC(year, month, day, hour, minute, second = 0) {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  return d.getTime();
}

/** UTC offset of `tz` at UT instant `utMs`, in milliseconds (second-exact). */
function zoneOffsetMs(tz, utMs) {
  const snapped = Math.floor(utMs / 1000) * 1000; // the formatter resolves whole seconds
  const g = {};
  for (const p of zoneFormatter(tz).formatToParts(snapped)) {
    if (p.type !== 'literal') g[p.type] = p.value;
  }
  return wallTimeUTC(+g.year, +g.month, +g.day, +g.hour, +g.minute, +g.second) - snapped;
}

/**
 * UTC offset of an IANA zone at a UT instant, in minutes (may be
 * fractional in the pre-standard-time era: Bucharest 1900 → 104.4).
 * @param {string} tz IANA zone, e.g. 'Europe/Bucharest'
 * @param {Date} utDate
 */
export function offsetAt(tz, utDate) {
  return zoneOffsetMs(tz, utDate.getTime()) / 60000;
}

/**
 * The UT instant for a local civil time in an IANA zone,
 * historically correct (DST + pre-standard offsets, per the
 * engine's IANA data). DST fold → the earlier instant, flagged;
 * DST gap (nonexistent local time) → the pre-jump offset applied
 * (the returned instant reads as just past the jump), flagged.
 *
 * @param {{year:number,month:number,day:number,hour:number,minute:number,tz:string}} local
 *   month 1–12, hour 0–23.
 * @returns {{ut:Date, offsetMinutes:number, ambiguous:boolean}}
 */
export function utFromLocal({ year, month, day, hour, minute, tz }) {
  const wall = wallTimeUTC(year, month, day, hour, minute);
  const offA = zoneOffsetMs(tz, wall - DAY); // offset in force before the wall time
  const offB = zoneOffsetMs(tz, wall + DAY); // …and after
  const candA = wall - offA;
  const candB = wall - offB;
  const validA = zoneOffsetMs(tz, candA) === offA;
  const validB = zoneOffsetMs(tz, candB) === offB;

  let utMs, offset, ambiguous;
  if (validA && validB && offA === offB) {
    [utMs, offset, ambiguous] = [candA, offA, false]; // the common case
  } else if (validA && validB) {
    [utMs, offset, ambiguous] = [candA, offA, true]; // fold: candA is the earlier instant
  } else if (validA) {
    [utMs, offset, ambiguous] = [candA, offA, false];
  } else if (validB) {
    [utMs, offset, ambiguous] = [candB, offB, false];
  } else {
    [utMs, offset, ambiguous] = [candA, offA, true]; // gap: this local time never existed
  }
  return { ut: new Date(utMs), offsetMinutes: offset / 60000, ambiguous };
}
