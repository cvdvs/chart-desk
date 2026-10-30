// ============================================================
// Sky — where the bodies are NOW, in both zodiacs, and how long
// each one stays: the sign it occupies (sidereal: also the
// nakshatra and pada), when it entered, when it leaves and for
// which sign, and for the planets that turn, their stations.
//
// Every longitude is the engine's own positions(); this module
// only searches TIME. A boundary search steps by (distance to the
// nearer edge ÷ the body's top speed), so a step can never jump a
// crossing, then bisects to the minute. Results are cached per
// body until the event they describe has passed, so a dashboard
// polling every minute costs one positions() call.
// ============================================================
import { positions, ayanamsa, norm360, nakshatraOf, NAKSHATRAS } from '../engine/ephemeris.js';
import { SIGNS } from '../engine/jyotish.js';

const DAY = 86400e3;
const SCAN_FLOOR = DAY / 24;      // never scan finer than an hour…
const EDGE_EPS = 60e3;            // …then bisect a crossing to the minute
const STATION_EPS = 10 * 60e3;    // stations are soft; ten minutes is plenty

const ENGINE_KEY = {
  sun: 'sun', moon: 'moon', mercury: 'mercury', venus: 'venus', mars: 'mars',
  jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune',
  pluto: 'pluto', rahu: 'meanNode', ketu: 'ketu',
};
export const VEDIC_BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu'];
export const TROPICAL_BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'rahu'];

// top geocentric speeds, °/day, with headroom; the no-skip guarantee rests on these
const TOP_SPEED = {
  sun: 1.05, moon: 15.8, mercury: 2.35, venus: 1.32, mars: 0.85, jupiter: 0.27,
  saturn: 0.15, uranus: 0.075, neptune: 0.045, pluto: 0.05, meanNode: 0.06, ketu: 0.06,
};
// how far to look for an edge, days (Pluto has held one sign for ~32 years)
const HORIZON = {
  sun: 400, moon: 40, mercury: 400, venus: 800, mars: 1000, jupiter: 1500, saturn: 3500,
  uranus: 9000, neptune: 16000, pluto: 16000, meanNode: 2000, ketu: 2000,
};
// stations: [scan step shorter than the briefest retrograde, reach], days
const STATION_SCAN = {
  mercury: [2, 140], venus: [3, 650], mars: [4, 850], jupiter: [6, 450],
  saturn: [6, 450], uranus: [8, 450], neptune: [8, 450], pluto: [8, 450],
};

const SPAN = { sign: 30, nakshatra: 360 / 27, pada: 360 / 108 };
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const segOf = (lon, span) => Math.min(Math.round(360 / span) - 1, Math.floor(lon / span));

function lonAt(ek, ms, frame) {
  const d = new Date(ms);
  const lon = positions(d).bodies[ek].lon;
  return frame === 'sidereal' ? norm360(lon - ayanamsa(d)) : lon;
}

/** The next (dir +1) or last (dir −1) moment `ek` crosses out of its current segment. */
function crossing(ek, frame, span, t0, dir) {
  const top = TOP_SPEED[ek];
  const reach = t0 + dir * HORIZON[ek] * DAY;
  let lon = lonAt(ek, t0, frame);
  const s0 = segOf(lon, span);
  let prev = t0;
  for (let i = 0; i < 100000; i++) {
    const into = lon - s0 * span;
    const toEdge = Math.min(into, span - into);
    const t = prev + dir * Math.max((toEdge / top) * DAY, SCAN_FLOOR);
    if (dir > 0 ? t > reach : t < reach) return null;
    lon = lonAt(ek, t, frame);
    if (segOf(lon, span) !== s0) {
      let a = prev, b = t;              // a inside, b outside
      while (Math.abs(b - a) > EDGE_EPS) {
        const m = (a + b) / 2;
        if (segOf(lonAt(ek, m, frame), span) === s0) a = m; else b = m;
      }
      return { at: Math.round(b), other: segOf(lonAt(ek, b, frame), span) };
    }
    prev = t;
  }
  return null;
}

const edgeCache = new Map();
function edgesOf(ek, frame, span, t0, lon, { back = true } = {}) {
  const seg = segOf(lon, span);
  const k = `${frame}|${ek}|${span}`;
  const c = edgeCache.get(k);
  if (c && c.seg === seg && (c.hasBack || !back)
    && (c.until === null || t0 < c.until) && (c.since === null || t0 >= c.since)) return c;
  const fwd = crossing(ek, frame, span, t0, +1);
  const bwd = back ? crossing(ek, frame, span, t0, -1) : null;
  const v = {
    seg, hasBack: back,
    since: bwd?.at ?? null, from: bwd?.other ?? null,
    until: fwd?.at ?? null, to: fwd?.other ?? null,
  };
  edgeCache.set(k, v);
  return v;
}

const speedAt = (ek, ms) => positions(new Date(ms)).bodies[ek].speed;
const dirOf = (v) => (v < 0 ? -1 : 1);

/** The next (dir +1) or last (dir −1) station: the moment the motion turns. */
function station(ek, t0, dir) {
  const [stepDays, reachDays] = STATION_SCAN[ek];
  const s0 = dirOf(speedAt(ek, t0));
  let prev = t0;
  for (let t = t0 + dir * stepDays * DAY; Math.abs(t - t0) <= reachDays * DAY; t += dir * stepDays * DAY) {
    if (dirOf(speedAt(ek, t)) !== s0) {
      let a = prev, b = t;
      while (Math.abs(b - a) > STATION_EPS) {
        const m = (a + b) / 2;
        if (dirOf(speedAt(ek, m)) === s0) a = m; else b = m;
      }
      return Math.round((a + b) / 2);
    }
    prev = t;
  }
  return null;
}

const stationCache = new Map();
function stationsOf(ek, t0, retro) {
  if (!STATION_SCAN[ek]) return {};          // Sun, Moon, the mean nodes never turn
  const c = stationCache.get(ek);
  if (c && c.retro === retro && t0 >= c.from && (c.next === null || t0 < c.next)) return c.out;
  const next = station(ek, t0, +1);
  const prev = retro ? station(ek, t0, -1) : null;
  const out = retro ? { retroSince: iso(prev), directOn: iso(next) } : { nextRetro: iso(next) };
  stationCache.set(ek, { retro, from: prev ?? t0, next, out });
  return out;
}

function rowFor(key, frame, t0, P, ay) {
  const ek = ENGINE_KEY[key];
  const b = P[ek];
  const lon = frame === 'sidereal' ? norm360(b.lon - ay) : b.lon;
  const s = edgesOf(ek, frame, SPAN.sign, t0, lon);
  const out = {
    key,
    lon: r4(lon),
    sign: SIGNS[s.seg],
    degInSign: r4(lon - s.seg * 30),
    speed: r4(b.speed),
    retro: b.retro,
    stay: {
      since: iso(s.since), from: s.from === null ? null : SIGNS[s.from],
      until: iso(s.until), to: s.to === null ? null : SIGNS[s.to],
    },
  };
  if (frame === 'sidereal') {
    const nk = nakshatraOf(lon);
    const n = edgesOf(ek, frame, SPAN.nakshatra, t0, lon, { back: false });
    const pd = edgesOf(ek, frame, SPAN.pada, t0, lon, { back: false });
    out.nakshatra = {
      name: nk.name, pada: nk.pada, lord: nk.lord,
      until: iso(n.until), next: n.to === null ? null : NAKSHATRAS[n.to],
      // the pada it moves into — pada − 1 when retrograde, not always pada + 1
      padaUntil: iso(pd.until), padaNext: pd.to === null ? null : (pd.to % 4) + 1,
    };
  }
  return Object.assign(out, stationsOf(ek, t0, b.retro));
}

/**
 * The sky at `now`: every body in both zodiacs, with its stay.
 * Vedic = the nine grahas, sidereal (Lahiri), mean nodes.
 * Tropical = Sun…Pluto plus the (mean) North Node.
 */
export function skyNow(now = new Date()) {
  const t0 = +now;
  const P = positions(now).bodies;
  const ay = ayanamsa(now);
  return {
    at: now.toISOString(),
    ayanamsa: { name: 'Lahiri', deg: r4(ay) },
    node: 'mean',
    vedic: VEDIC_BODIES.map((k) => rowFor(k, 'sidereal', t0, P, ay)),
    tropical: TROPICAL_BODIES.map((k) => rowFor(k, 'tropical', t0, P, ay)),
  };
}
