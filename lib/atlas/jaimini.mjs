// ============================================================
// Jaimini + strength layers, each under a single resolved standard:
//
// · Chara Dasha — the K.N. Rao standard: order by the
//   9th-from-lagna's group; length = count from sign to its lord
//   (forward for Ari/Ta/Ge/Li/Sc/Sg, else backward) − 1; own
//   sign = 12; NO exalt/debil adjustment; NO fractions — full
//   integer years from birth. Dual lords (Scorpio: Mars+Ketu,
//   Aquarius: Saturn+Rahu): when both sit elsewhere the
//   higher-degree lord wins; when the alternatives disagree BOTH
//   are reported — the association convention is an open question.
//   Sub-periods: twelve signs from the sign adjacent to the
//   major in its counting direction, own sign last, each
//   major-years months long.
// · Vargottama — D1 sign = D9 sign.
// · Dignity — natural: exaltation/debilitation (classical
//   degrees), mulatrikona, own, friend/neutral/enemy.
// · Combustion — classical orbs; schools vary, so the orb used
//   is stated on every flag.
// ============================================================
import { SIGNS, SIGN_LORDS } from '../engine/jyotish.js';

const FORWARD_SIGNS = new Set([0, 1, 2, 6, 7, 8]); // Ari Ta Ge Li Sc Sg
const GRAHA7 = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];

// — Rashi drishti (sign aspects, Jaimini) —
// Movable signs aspect the fixed signs (except the adjacent one), fixed signs
// aspect the movable (same exception), dual signs aspect the other dual signs.
const MOVABLE = new Set([0, 3, 6, 9]);
const FIXED = new Set([1, 4, 7, 10]);

/** The signs that cast a rashi-drishti aspect ONTO `sign` (0=Aries … 11=Pisces). */
export function rashiAspectSources(sign) {
  const out = [];
  for (let s = 0; s < 12; s++) {
    if (s === sign) continue;
    const adjacent = Math.abs(s - sign) === 1 || Math.abs(s - sign) === 11;
    if (MOVABLE.has(sign) && FIXED.has(s) && !adjacent) out.push(s);
    else if (FIXED.has(sign) && MOVABLE.has(s) && !adjacent) out.push(s);
    else if (!MOVABLE.has(sign) && !FIXED.has(sign) && !MOVABLE.has(s) && !FIXED.has(s)) out.push(s);
  }
  return out;
}

// — Chara Dasha (K.N. Rao standard) —

function signOfBodies(chart) {
  const m = {};
  for (const p of chart.planets) m[p.body] = { sign: p.sign, degInSign: p.degInSign };
  m.rahu = { sign: chart.nodes.rahu.sign, degInSign: chart.nodes.rahu.degInSign };
  m.ketu = { sign: chart.nodes.ketu.sign, degInSign: chart.nodes.ketu.degInSign };
  return m;
}

const countBetween = (from, to, forward) =>
  forward ? ((to - from + 12) % 12) + 1 : ((from - to + 12) % 12) + 1;

/** Length of one sign's dasha under Rao's rules, with dual-lord handling. */
function signLength(sign, bodies) {
  const forward = FORWARD_SIGNS.has(sign);
  const lenFor = (lordKey) => {
    const seat = bodies[lordKey];
    if (seat.sign === sign) return 12; // own sign
    return countBetween(sign, seat.sign, forward) - 1;
  };
  if (sign === 7 || sign === 10) { // Scorpio: Mars+Ketu · Aquarius: Saturn+Rahu
    const [a, b] = sign === 7 ? ['mars', 'ketu'] : ['saturn', 'rahu'];
    const ownA = bodies[a].sign === sign, ownB = bodies[b].sign === sign;
    let primary, alt = null, note = null;
    if (ownA !== ownB) primary = ownA ? a : b; // a lord at home speaks for the sign
    else {
      primary = bodies[a].degInSign >= bodies[b].degInSign ? a : b; // higher-degree lord wins
      const la = lenFor(a), lb = lenFor(b);
      if (la !== lb) {
        alt = { lord: primary === a ? b : a, years: primary === a ? lb : la };
        note = 'dual-lord sign — higher-degree lord used; the association convention is an open question, alternative reported';
      }
    }
    return { years: lenFor(primary), lord: primary, alt, note };
  }
  const lord = SIGN_LORDS[sign];
  return { years: lenFor(lord), lord, alt: null, note: null };
}

const addYears = (d, y) => { const n = new Date(d); n.setUTCFullYear(n.getUTCFullYear() + y); return n; };
const addMonths = (d, m) => { const n = new Date(d); n.setUTCMonth(n.getUTCMonth() + m); return n; };

/**
 * The full Chara Dasha (majors + sub-periods), K.N. Rao standard.
 * @param {Object} chart buildVedicChart() result
 * The timeline is anchored on the LOCAL CIVIL BIRTH DATE, not on the UT
 * instant's calendar date. Those differ for any birth late enough or early
 * enough in the day to cross the UTC boundary — a late-evening birth in the
 * Americas is already the next day in UT — and taking the UT date shifted
 * every major and all 144 sub-periods by a whole day.
 *
 * @param {{year:number, month:number, day:number}} birthLocal — civil date
 */
export function charaDasha(chart, birthLocal) {
  const bodies = signOfBodies(chart);
  const lagna = chart.ascSign;
  const ninth = (lagna + 8) % 12;
  const direct = FORWARD_SIGNS.has(ninth);
  const order = Array.from({ length: 12 }, (_, i) => (lagna + (direct ? i : -i) + 144) % 12);

  const majors = [];
  let t = new Date(Date.UTC(birthLocal.year, birthLocal.month - 1, birthLocal.day));
  // Two cycles, not one. The 12 signs cover between 12 and 144 years depending
  // on the chart, so a single cycle can be outlived — and when it was, `current`
  // silently became null and the whole "currently running" answer vanished with
  // no note. The method continues into the next cycle; so do we. `cycle` is
  // carried on each major so a consumer can label or hide the second pass.
  const sequence = [...order.map((s) => [s, 1]), ...order.map((s) => [s, 2])];
  for (const [sign, cycle] of sequence) {
    const L = signLength(sign, bodies);
    const start = t;
    const end = addYears(t, L.years);
    // subs: twelve signs from the adjacent sign in this sign's own
    // counting direction, the major's sign last; each = years months
    const fwd = FORWARD_SIGNS.has(sign);
    const subs = [];
    let st = start;
    for (let i = 1; i <= 12; i++) {
      const s = (sign + (fwd ? i : -i) + 144) % 12;
      const se = addMonths(st, L.years);
      subs.push({ sign: s, signName: SIGNS[s], start: st, end: se });
      st = se;
    }
    majors.push({
      sign, signName: SIGNS[sign], years: L.years, lord: L.lord, cycle,
      start, end, subs,
      ...(L.alt ? { alternative: { ...L.alt, note: L.note } } : {}),
    });
    t = end;
  }
  const now = new Date();
  const curMajor = majors.find((m) => now >= m.start && now < m.end) ?? null;
  const curSub = curMajor ? curMajor.subs.find((s) => now >= s.start && now < s.end) ?? null : null;
  return {
    standard: 'K.N. Rao (Predicting through Jaimini’s Chara Dasha): integer years from birth, −1 deductions, no exalt/debil adjustment',
    direction: direct ? 'direct' : 'indirect',
    majors,
    current: curMajor ? {
      major: { signName: curMajor.signName, start: curMajor.start, end: curMajor.end },
      sub: curSub ? { signName: curSub.signName, start: curSub.start, end: curSub.end } : null,
    } : null,
  };
}

// — Vargottama · dignity · combustion —

const EXALT = { sun: [0, 10], moon: [1, 3], mars: [9, 28], mercury: [5, 15], jupiter: [3, 5], venus: [11, 27], saturn: [6, 20] };
const MULATRIKONA = { sun: [4, 0, 20], moon: [1, 4, 30], mars: [0, 0, 12], mercury: [5, 16, 20], jupiter: [8, 0, 10], venus: [6, 0, 15], saturn: [10, 0, 20] };
const OWN = { sun: [4], moon: [3], mars: [0, 7], mercury: [2, 5], jupiter: [8, 11], venus: [1, 6], saturn: [9, 10] };
// naisargika (natural) relations: planet → { friends, enemies } (others neutral)
const RELATION = {
  sun: { f: ['moon', 'mars', 'jupiter'], e: ['venus', 'saturn'] },
  moon: { f: ['sun', 'mercury'], e: [] },
  mars: { f: ['sun', 'moon', 'jupiter'], e: ['mercury'] },
  mercury: { f: ['sun', 'venus'], e: ['moon'] },
  jupiter: { f: ['sun', 'moon', 'mars'], e: ['mercury', 'venus'] },
  venus: { f: ['mercury', 'saturn'], e: ['sun', 'moon'] },
  saturn: { f: ['mercury', 'venus'], e: ['sun', 'moon', 'mars'] },
};
// classical combustion orbs (degrees from the Sun; retro Mercury/Venus tighten)
const COMBUST_ORB = { moon: 12, mars: 17, mercury: 14, jupiter: 11, venus: 10, saturn: 15 };
const COMBUST_ORB_RETRO = { mercury: 12, venus: 8 };

function dignityOf(body, sign, degInSign) {
  const debSign = (EXALT[body]?.[0] + 6) % 12;
  if (EXALT[body] && debSign === sign) return { state: 'debilitated', detail: `debilitation sign (deepest ${EXALT[body][1]}°)` };
  // Mulatrikona is a DEGREE BAND and must be tested before the whole-sign
  // exaltation label. For the Moon (exalt + MT both Taurus) and Mercury (both
  // Virgo) the exalt-sign test used to fire first and swallow the whole sign, so
  // MT was unreachable and e.g. Moon Taurus 20° read "exalted" instead of
  // mulatrikona — overstating strength on real charts and now in bulk exports.
  const mt = MULATRIKONA[body];
  if (mt && mt[0] === sign && degInSign >= mt[1] && degInSign <= mt[2]) return { state: 'mulatrikona', detail: `${mt[1]}–${mt[2]}°` };
  if (EXALT[body]?.[0] === sign) return { state: 'exalted', detail: `exaltation sign (peak ${EXALT[body][1]}°)` };
  if (OWN[body]?.includes(sign)) return { state: 'own', detail: 'own sign' };
  const lord = SIGN_LORDS[sign];
  const rel = RELATION[body];
  if (rel) {
    if (rel.f.includes(lord)) return { state: 'friend', detail: `${lord}'s sign` };
    if (rel.e.includes(lord)) return { state: 'enemy', detail: `${lord}'s sign` };
  }
  return { state: 'neutral', detail: `${lord}'s sign` };
}

const arcSep = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/**
 * Per-graha strength block: dignity, vargottama, combustion.
 * @param {Object} chart buildVedicChart() result
 */
export function strengthReport(chart) {
  const sunLon = chart.planets.find((p) => p.body === 'sun').siderealLon;
  const d9 = chart.vargas.D9;
  const out = [];
  const rows = [
    ...chart.planets.filter((p) => GRAHA7.includes(p.body)),
    { ...chart.nodes.rahu, body: 'rahu' }, { ...chart.nodes.ketu, body: 'ketu' },
  ];
  for (const p of rows) {
    const vargottama = d9[p.body] ? d9[p.body].sign === p.sign : false;
    const entry = {
      body: p.body, signName: p.signName, degInSign: p.degInSign,
      vargottama,
      dignity: GRAHA7.includes(p.body) ? dignityOf(p.body, p.sign, p.degInSign) : { state: 'node', detail: 'nodes carry no classical dignity here; read by sign-lord and nakshatra' },
    };
    if (p.body !== 'sun' && COMBUST_ORB[p.body]) {
      const orb = p.retro && COMBUST_ORB_RETRO[p.body] ? COMBUST_ORB_RETRO[p.body] : COMBUST_ORB[p.body];
      const sep = arcSep(p.siderealLon, sunLon);
      entry.combust = sep < orb
        ? { is: true, separation: sep, orb, note: 'classical orbs — schools vary' }
        : { is: false, separation: sep, orb };
    }
    out.push(entry);
  }
  const ascVargottama = chart.vargas.D9.asc.sign === chart.ascSign;
  return { bodies: out, ascVargottama };
}
