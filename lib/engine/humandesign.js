// ============================================================
// Human Design — the calculation engine (the last lens).
// Pure ESM, browser-safe: no DOM, no node APIs, no dependency
// beyond ephemeris.js (which carries the one npm package).
// The page calls buildHDChart(); the smaller exports exist for
// tests and the later depth set (color/tone → determination,
// environment, cognition, motivation).
//
// "Human Design" is referenced descriptively; this project is
// not affiliated with any HD organization. Standard published
// terms only — Gates, Channels, Centers, Type, Authority,
// Profile, Incarnation Cross.
//
// THE MANDALA — the fixed wheel of 64 gates around the TROPICAL
// zodiac. Each gate spans 5°37′30″ (360/64), each line 0°56′15″.
// The wheel is anchored at Gate 41 = 02°00′00″ Aquarius (302°)
// and runs in zodiacal order through the published sequence
// below (GATE_ORDER). Sources and cross-checks in
// docs/hd-fixtures.md; the load-bearing anchors:
//   · Gate 41 starts 02°00′ Aquarius; Gate 25 spans 28°15′
//     Pisces → 03°52′30″ Aries (0° Aries falls in gate 25;
//     gate 17 begins at 03°52′30″ Aries).
//   · The equinox/solstice points sit in 25 / 15 / 46 / 10.
//   · Every gate's polar opposite (+180° = +32 positions) is
//     its published programming partner — all 32 pairs check.
//
// DESIGN SIDE — computed at the instant the Sun sat exactly
// 88.0° of solar arc before the natal Sun (the published rule;
// ≈ 88–89 days). Solved by Newton iteration on the apparent
// tropical Sun from ephemeris.positions().
//
// NODES — the TRUE (osculating) lunar node, computed here from
// the Moon's geocentric state vectors (astronomy-engine's GeoMoon
// position, velocity by central difference, node = where the
// orbit normal crosses the ecliptic of date). HD software
// (Jovian lineage) prints the true node; the mean node (which
// ephemeris.js carries for the Vedic lens) runs up to ~1°45′
// away — enough to shift a node's gate, and the fixtures proved
// it: with the mean node all twelve published node values
// mismatched by 10–26′ (one by a whole gate); with the
// osculating node all twelve reproduce exactly.
//
// Validated (provisionally — docs/hd-fixtures.md) against three
// publicly documented charts computed by Jovian-lineage software
// (Zen HD chart service, humandesignsystem.com): Ra Uru Hu,
// Barack Obama, Joe Biden — 78 published gate.line activations
// reproduce exactly, plus type / profile / authority / definition
// / incarnation cross (corroborated by independent secondary
// sources for Ra and Obama; derived-only for Biden).
// Reference-grade validation against exports with known birth
// data is pending — see the fixtures doc.
// ============================================================

import { GeoMoon, MakeTime, Ecliptic } from 'astronomy-engine';
import { norm360, positions } from './ephemeris.js';

// — the mandala —

/** The 64 gates in zodiacal order, starting at WHEEL_START_DEG (gate 41). */
export const GATE_ORDER = [
  41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3,
  27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56,
  31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50,
  28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60,
];

/** Gate 41 begins at 02°00′00″ Aquarius. */
export const WHEEL_START_DEG = 302;
export const GATE_DEG = 360 / 64;      // 5.625° = 5°37′30″
export const LINE_DEG = GATE_DEG / 6;  // 0.9375° = 0°56′15″

const GATE_INDEX = Object.fromEntries(GATE_ORDER.map((g, i) => [g, i]));

/** Start longitude (tropical degrees) of a gate's span. */
export function gateStart(gate) {
  return norm360(WHEEL_START_DEG + GATE_INDEX[gate] * GATE_DEG);
}

/** The gate exactly opposite (+180° — its programming partner). */
export function oppositeGate(gate) {
  return GATE_ORDER[(GATE_INDEX[gate] + 32) % 64];
}

/**
 * Gate + line (+ color and tone, the finer subdivisions — each a
 * further sixth, groundwork for the later depth set) for one
 * apparent tropical longitude.
 * @param {number} tropicalLon degrees
 * @returns {{ gate:number, line:1|2|3|4|5|6, color:number, tone:number }}
 */
export function gateOf(tropicalLon) {
  const off = norm360(tropicalLon - WHEEL_START_DEG);
  const idx = Math.min(63, Math.floor(off / GATE_DEG));
  const inGate = off - idx * GATE_DEG;
  const line = Math.min(5, Math.floor(inGate / LINE_DEG));
  const inLine = inGate - line * LINE_DEG;
  const color = Math.min(5, Math.floor(inLine / (LINE_DEG / 6)));
  const inColor = inLine - color * (LINE_DEG / 6);
  const tone = Math.min(5, Math.floor(inColor / (LINE_DEG / 36)));
  return { gate: GATE_ORDER[idx], line: line + 1, color: color + 1, tone: tone + 1 };
}

// — the bodygraph: centers, gates, channels —

/** The nine centers, top to bottom. Motors: heart, solar, sacral, root. */
export const CENTERS = [
  { key: 'head', name: 'Head', motor: false },
  { key: 'ajna', name: 'Ajna', motor: false },
  { key: 'throat', name: 'Throat', motor: false },
  { key: 'g', name: 'G', motor: false },
  { key: 'heart', name: 'Heart', motor: true },
  { key: 'spleen', name: 'Spleen', motor: false },
  { key: 'solar', name: 'Solar Plexus', motor: true },
  { key: 'sacral', name: 'Sacral', motor: true },
  { key: 'root', name: 'Root', motor: true },
];

/** Which center each gate lives in (standard bodygraph). */
export const GATE_CENTER = {
  64: 'head', 61: 'head', 63: 'head',
  47: 'ajna', 24: 'ajna', 4: 'ajna', 17: 'ajna', 43: 'ajna', 11: 'ajna',
  62: 'throat', 23: 'throat', 56: 'throat', 16: 'throat', 20: 'throat',
  12: 'throat', 31: 'throat', 8: 'throat', 33: 'throat', 35: 'throat', 45: 'throat',
  1: 'g', 13: 'g', 25: 'g', 46: 'g', 2: 'g', 15: 'g', 10: 'g', 7: 'g',
  21: 'heart', 40: 'heart', 26: 'heart', 51: 'heart',
  48: 'spleen', 57: 'spleen', 44: 'spleen', 50: 'spleen', 32: 'spleen', 28: 'spleen', 18: 'spleen',
  36: 'solar', 22: 'solar', 37: 'solar', 6: 'solar', 49: 'solar', 55: 'solar', 30: 'solar',
  5: 'sacral', 14: 'sacral', 29: 'sacral', 59: 'sacral', 9: 'sacral',
  3: 'sacral', 42: 'sacral', 27: 'sacral', 34: 'sacral',
  53: 'root', 60: 'root', 52: 'root', 19: 'root', 39: 'root',
  41: 'root', 58: 'root', 38: 'root', 54: 'root',
};

/** The 36 channels: [gateA, gateB] (ascending) + the standard name. */
export const CHANNELS = [
  { gates: [1, 8], name: 'Inspiration' },
  { gates: [2, 14], name: 'The Beat' },
  { gates: [3, 60], name: 'Mutation' },
  { gates: [4, 63], name: 'Logic' },
  { gates: [5, 15], name: 'Rhythm' },
  { gates: [6, 59], name: 'Mating' },
  { gates: [7, 31], name: 'The Alpha' },
  { gates: [9, 52], name: 'Concentration' },
  { gates: [10, 20], name: 'Awakening' },
  { gates: [10, 34], name: 'Exploration' },
  { gates: [10, 57], name: 'Perfected Form' },
  { gates: [11, 56], name: 'Curiosity' },
  { gates: [12, 22], name: 'Openness' },
  { gates: [13, 33], name: 'The Prodigal' },
  { gates: [16, 48], name: 'The Wavelength' },
  { gates: [17, 62], name: 'Acceptance' },
  { gates: [18, 58], name: 'Judgment' },
  { gates: [19, 49], name: 'Synthesis' },
  { gates: [20, 34], name: 'Charisma' },
  { gates: [20, 57], name: 'The Brainwave' },
  { gates: [21, 45], name: 'The Money Line' },
  { gates: [23, 43], name: 'Structuring' },
  { gates: [24, 61], name: 'Awareness' },
  { gates: [25, 51], name: 'Initiation' },
  { gates: [26, 44], name: 'Surrender' },
  { gates: [27, 50], name: 'Preservation' },
  { gates: [28, 38], name: 'Struggle' },
  { gates: [29, 46], name: 'Discovery' },
  { gates: [30, 41], name: 'Recognition' },
  { gates: [32, 54], name: 'Transformation' },
  { gates: [34, 57], name: 'Power' },
  { gates: [35, 36], name: 'Transitoriness' },
  { gates: [37, 40], name: 'Community' },
  { gates: [39, 55], name: 'Emoting' },
  { gates: [42, 53], name: 'Maturation' },
  { gates: [47, 64], name: 'Abstraction' },
];

// — type · strategy · themes (standard published set) —

export const TYPES = {
  Reflector: { strategy: 'Wait a lunar cycle', notSelfTheme: 'Disappointment', signature: 'Surprise' },
  Generator: { strategy: 'To respond', notSelfTheme: 'Frustration', signature: 'Satisfaction' },
  'Manifesting Generator': { strategy: 'To respond', notSelfTheme: 'Frustration', signature: 'Satisfaction' },
  Manifestor: { strategy: 'To inform', notSelfTheme: 'Anger', signature: 'Peace' },
  Projector: { strategy: 'Wait for the invitation', notSelfTheme: 'Bitterness', signature: 'Success' },
};

/** The six line names (profile epithets). */
export const LINE_NAMES = { 1: 'Investigator', 2: 'Hermit', 3: 'Martyr', 4: 'Opportunist', 5: 'Heretic', 6: 'Role Model' };

/**
 * Incarnation-cross names keyed by personality-Sun gate: the Right
 * Angle / Juxtaposition / Left Angle name for that sun position
 * (ordinal suffixes like "2/3/4" — rotation numbering only — are
 * dropped). Sources + cross-checks in docs/hd-fixtures.md. The
 * quartet itself is computed, never looked up: pEarth/dEarth are
 * the polar gates, dSun falls 15 (JX/LAX) or 16 (RAX) wheel
 * positions back — both facts assertable against this table.
 */
export const CROSS_NAMES = {
  1: { rax: 'the Sphinx', jx: 'Self-Expression', lax: 'Defiance' },
  2: { rax: 'the Sphinx', jx: 'the Driver', lax: 'Defiance' },
  3: { rax: 'Laws', jx: 'Mutation', lax: 'Wishes' },
  4: { rax: 'Explanation', jx: 'Formulization', lax: 'Revolution' },
  5: { rax: 'Consciousness', jx: 'Habits', lax: 'Separation' },
  6: { rax: 'Eden', jx: 'Conflict', lax: 'the Plane' },
  7: { rax: 'the Sphinx', jx: 'Interaction', lax: 'Masks' },
  8: { rax: 'Contagion', jx: 'Contribution', lax: 'Uncertainty' },
  9: { rax: 'Planning', jx: 'Focus', lax: 'Identification' },
  10: { rax: 'the Vessel of Love', jx: 'Behavior', lax: 'Prevention' },
  11: { rax: 'Eden', jx: 'Ideas', lax: 'Education' },
  12: { rax: 'Eden', jx: 'Articulation', lax: 'Education' },
  13: { rax: 'the Sphinx', jx: 'Listening', lax: 'Masks' },
  14: { rax: 'Contagion', jx: 'Empowering', lax: 'Uncertainty' },
  15: { rax: 'the Vessel of Love', jx: 'Extremes', lax: 'Prevention' },
  16: { rax: 'Planning', jx: 'Experimentation', lax: 'Identification' },
  17: { rax: 'Service', jx: 'Opinions', lax: 'Upheaval' },
  18: { rax: 'Service', jx: 'Correction', lax: 'Upheaval' },
  19: { rax: 'the Four Ways', jx: 'Need', lax: 'Refinement' },
  20: { rax: 'the Sleeping Phoenix', jx: 'the Now', lax: 'Duality' },
  21: { rax: 'Tension', jx: 'Control', lax: 'Endeavor' },
  22: { rax: 'Rulership', jx: 'Grace', lax: 'Informing' },
  23: { rax: 'Explanation', jx: 'Assimilation', lax: 'Dedication' },
  24: { rax: 'the Four Ways', jx: 'Rationalization', lax: 'Incarnation' },
  25: { rax: 'the Vessel of Love', jx: 'Innocence', lax: 'Healing' },
  26: { rax: 'Rulership', jx: 'the Trickster', lax: 'Confrontation' },
  27: { rax: 'the Unexpected', jx: 'Caring', lax: 'Alignment' },
  28: { rax: 'the Unexpected', jx: 'Risks', lax: 'Alignment' },
  29: { rax: 'Contagion', jx: 'Commitment', lax: 'Industry' },
  30: { rax: 'Contagion', jx: 'Fates', lax: 'Industry' },
  31: { rax: 'the Unexpected', jx: 'Influence', lax: 'the Alpha' },
  32: { rax: 'Maya', jx: 'Conservation', lax: 'Limitation' },
  33: { rax: 'the Four Ways', jx: 'Retreat', lax: 'Refinement' },
  34: { rax: 'the Sleeping Phoenix', jx: 'Power', lax: 'Duality' },
  35: { rax: 'Consciousness', jx: 'Experience', lax: 'Separation' },
  36: { rax: 'Eden', jx: 'Crisis', lax: 'the Plane' },
  37: { rax: 'Planning', jx: 'Bargains', lax: 'Migration' },
  38: { rax: 'Tension', jx: 'Opposition', lax: 'Individualism' },
  39: { rax: 'Tension', jx: 'Provocation', lax: 'Individualism' },
  40: { rax: 'Planning', jx: 'Denial', lax: 'Migration' },
  41: { rax: 'the Unexpected', jx: 'Fantasy', lax: 'the Alpha' },
  42: { rax: 'Maya', jx: 'Completion', lax: 'Limitation' },
  43: { rax: 'Explanation', jx: 'Insight', lax: 'Dedication' },
  44: { rax: 'the Four Ways', jx: 'Alertness', lax: 'Incarnation' },
  45: { rax: 'Rulership', jx: 'Possession', lax: 'Confrontation' },
  46: { rax: 'the Vessel of Love', jx: 'Serendipity', lax: 'Healing' },
  47: { rax: 'Rulership', jx: 'Oppression', lax: 'Informing' },
  48: { rax: 'Tension', jx: 'Depth', lax: 'Endeavor' },
  49: { rax: 'Explanation', jx: 'Principles', lax: 'Revolution' },
  50: { rax: 'Laws', jx: 'Values', lax: 'Wishes' },
  51: { rax: 'Penetration', jx: 'Shock', lax: 'the Clarion' },
  52: { rax: 'Service', jx: 'Stillness', lax: 'Demands' },
  53: { rax: 'Penetration', jx: 'Beginnings', lax: 'Cycles' },
  54: { rax: 'Penetration', jx: 'Ambition', lax: 'Cycles' },
  55: { rax: 'the Sleeping Phoenix', jx: 'Moods', lax: 'Spirit' },
  56: { rax: 'Laws', jx: 'Stimulation', lax: 'Distraction' },
  57: { rax: 'Penetration', jx: 'Intuition', lax: 'the Clarion' },
  58: { rax: 'Service', jx: 'Vitality', lax: 'Demands' },
  59: { rax: 'the Sleeping Phoenix', jx: 'Strategy', lax: 'Spirit' },
  60: { rax: 'Laws', jx: 'Limitation', lax: 'Distraction' },
  61: { rax: 'Maya', jx: 'Thinking', lax: 'Obscuration' },
  62: { rax: 'Maya', jx: 'Detail', lax: 'Obscuration' },
  63: { rax: 'Consciousness', jx: 'Doubts', lax: 'Dominion' },
  64: { rax: 'Consciousness', jx: 'Confusion', lax: 'Dominion' },
};

// — the two imprints —

/** Signed angular difference a − b, normalized to (−180, 180]. */
function angleDiff(a, b) {
  let d = norm360(a - b);
  if (d > 180) d -= 360;
  return d;
}

/**
 * The design instant: when the Sun sat exactly 88.0° of solar arc
 * before its natal longitude (≈ 88–89 days before birth). Newton
 * iteration on the apparent tropical Sun; converges to < 0.001″
 * of arc (≈ a tenth of a second of time) in a handful of steps.
 * @param {Date} birthUT
 * @returns {Date}
 */
export function designUT(birthUT) {
  const natal = positions(birthUT).bodies.sun.lon;
  const target = norm360(natal - 88);
  let t = birthUT.getTime() - (88 / 0.9856) * 86400e3; // mean-motion first guess
  for (let i = 0; i < 12; i++) {
    const sun = positions(new Date(t)).bodies.sun;
    const diff = angleDiff(target, sun.lon);
    if (Math.abs(diff) < 1e-6) break;
    t += (diff / sun.speed) * 86400e3;
  }
  return new Date(t);
}

/**
 * True (osculating) node of the Moon's geocentric orbit, degrees,
 * true ecliptic of date — the node convention HD software prints.
 * Position vectors from GeoMoon rotated into the ecliptic of date;
 * velocity by central difference (±0.001 d); the ascending node is
 * where the orbit normal h = r × v meets the ecliptic plane:
 * Ω = atan2(h_x, −h_y). Verified against the twelve published
 * node activations of the fixture charts (all exact) — the same
 * osculating definition as Swiss Ephemeris's SE_TRUE_NODE.
 * @param {Date} utDate
 */
export function trueNodeLon(utDate) {
  const time = MakeTime(utDate);
  const dt = 1e-3; // days
  const ecl = (t) => Ecliptic(GeoMoon(t)).vec;
  const r = ecl(time);
  const r0 = ecl(time.AddDays(-dt));
  const r1 = ecl(time.AddDays(dt));
  const v = { x: r1.x - r0.x, y: r1.y - r0.y, z: r1.z - r0.z }; // ∝ velocity; scale cancels in atan2
  const hx = r.y * v.z - r.z * v.y;
  const hy = r.z * v.x - r.x * v.z;
  return norm360(Math.atan2(hx, -hy) * 180 / Math.PI);
}

/** The 13 bodies of one column, in display order. Earth = Sun + 180°, South Node = North + 180°. */
const BODY_ROWS = [
  ['sun', 'Sun'], ['earth', 'Earth'], ['moon', 'Moon'],
  ['northNode', 'North Node'], ['southNode', 'South Node'],
  ['mercury', 'Mercury'], ['venus', 'Venus'], ['mars', 'Mars'],
  ['jupiter', 'Jupiter'], ['saturn', 'Saturn'],
  ['uranus', 'Uranus'], ['neptune', 'Neptune'], ['pluto', 'Pluto'],
];

/**
 * The thirteen activations at one instant (one column of the chart).
 * Nodes are the true node (see trueNodeLon).
 * @param {Date} utDate
 * @returns {[{ body, label, lon, gate, line, color, tone }]}
 */
export function activations(utDate) {
  const { bodies } = positions(utDate);
  const node = trueNodeLon(utDate);
  const lons = {
    sun: bodies.sun.lon,
    earth: norm360(bodies.sun.lon + 180),
    moon: bodies.moon.lon,
    northNode: node,
    southNode: norm360(node + 180),
    mercury: bodies.mercury.lon,
    venus: bodies.venus.lon,
    mars: bodies.mars.lon,
    jupiter: bodies.jupiter.lon,
    saturn: bodies.saturn.lon,
    uranus: bodies.uranus.lon,
    neptune: bodies.neptune.lon,
    pluto: bodies.pluto.lon,
  };
  return BODY_ROWS.map(([body, label]) => ({ body, label, lon: lons[body], ...gateOf(lons[body]) }));
}

// — the assembled chart —

/** Connected components over the defined centers, edges = defined channels. */
function components(definedSet, channels) {
  const adj = Object.fromEntries([...definedSet].map((c) => [c, []]));
  for (const ch of channels) {
    const [a, b] = ch.centers;
    adj[a].push(b);
    adj[b].push(a);
  }
  const seen = new Set();
  const comps = [];
  for (const start of definedSet) {
    if (seen.has(start)) continue;
    const comp = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const c = queue.shift();
      comp.push(c);
      for (const n of adj[c]) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    comps.push(comp);
  }
  return comps;
}

const MOTORS = new Set(CENTERS.filter((c) => c.motor).map((c) => c.key));
const DEFINITION_NAMES = ['none', 'single', 'split', 'triple split', 'quadruple split'];

/**
 * The full Human Design chart for a UT birth instant, per the
 * fable-handoff contract. Geography plays no part in the computed
 * set (no houses in HD) — only the local-time → UT conversion
 * upstream needs the place.
 * @param {{ utDate:Date }} input
 */
export function buildHDChart({ utDate }) {
  const designDate = designUT(utDate);
  const personality = activations(utDate);
  const design = activations(designDate);

  // gates active on either side
  const activeGates = new Set([...design, ...personality].map((a) => a.gate));
  const definedGates = [...activeGates].sort((x, y) => x - y);

  // channels whose both gates are active; centers touched by them are defined
  const channels = CHANNELS
    .filter(({ gates: [a, b] }) => activeGates.has(a) && activeGates.has(b))
    .map(({ gates, name }) => ({ gates, name, centers: [GATE_CENTER[gates[0]], GATE_CENTER[gates[1]]] }));
  const definedSet = new Set(channels.flatMap((ch) => ch.centers));
  const centers = {
    defined: CENTERS.filter((c) => definedSet.has(c.key)).map((c) => c.key),
    open: CENTERS.filter((c) => !definedSet.has(c.key)).map((c) => c.key),
  };

  // definition = connectivity of the defined-center graph
  const comps = components(definedSet, channels);
  const definition = DEFINITION_NAMES[Math.min(comps.length, 4)];

  // type — sacral + motor-to-throat logic over the same graph
  const throatComp = comps.find((c) => c.includes('throat'));
  const motorToThroat = !!throatComp && throatComp.some((c) => MOTORS.has(c));
  const sacral = definedSet.has('sacral');
  let type;
  if (!definedSet.size) type = 'Reflector';
  else if (sacral) type = motorToThroat ? 'Manifesting Generator' : 'Generator';
  else type = motorToThroat ? 'Manifestor' : 'Projector';

  // authority — the standard hierarchy
  let authority;
  if (type === 'Reflector') authority = 'Lunar';
  else if (definedSet.has('solar')) authority = 'Emotional';
  else if (definedSet.has('sacral')) authority = 'Sacral';
  else if (definedSet.has('spleen')) authority = 'Splenic';
  else if (definedSet.has('heart')) authority = 'Ego';
  else if (definedSet.has('g')) authority = 'Self-projected';
  else authority = 'Mental';

  // profile — personality-Sun line / design-Sun line
  const pSun = personality[0];
  const pEarth = personality[1];
  const dSun = design[0];
  const dEarth = design[1];
  const profileLabel = `${pSun.line}/${dSun.line}`;
  const angle = pSun.line < dSun.line ? 'right' : profileLabel === '4/1' ? 'juxtaposition' : 'left';
  const profile = {
    label: profileLabel,
    names: `${LINE_NAMES[pSun.line]} / ${LINE_NAMES[dSun.line]}`,
    angle,
  };

  // incarnation cross — name keyed by personality Sun gate + angle
  const crossKey = { right: 'rax', juxtaposition: 'jx', left: 'lax' }[angle];
  const crossPrefix = { right: 'Right Angle Cross of', juxtaposition: 'Juxtaposition Cross of', left: 'Left Angle Cross of' }[angle];
  const quartet = `(${pSun.gate}/${pEarth.gate} | ${dSun.gate}/${dEarth.gate})`;
  const incarnationCross = {
    name: `${crossPrefix} ${CROSS_NAMES[pSun.gate][crossKey]}`,
    angle,
    gates: { personalitySun: pSun.gate, personalityEarth: pEarth.gate, designSun: dSun.gate, designEarth: dEarth.gate },
    label: `${crossPrefix} ${CROSS_NAMES[pSun.gate][crossKey]} ${quartet}`,
  };

  return {
    input: { utc: utDate.toISOString(), designUtc: designDate.toISOString() },
    design,
    personality,
    definedGates,
    channels,
    centers,
    definition,
    type,
    strategy: TYPES[type].strategy,
    authority,
    profile,
    incarnationCross,
    notSelfTheme: TYPES[type].notSelfTheme,
    signature: TYPES[type].signature,
  };
}

/**
 * Fixtures — docs/hd-fixtures.md (provisional validation set).
 * Three publicly documented charts computed by Jovian-lineage
 * software (Zen HD chart service PDFs, humandesignsystem.com),
 * columns transcribed verbatim: 13 personality + 13 design
 * activations each as gate.line strings, in BODY_ROWS order
 * (Sun, Earth, Moon, NN, SN, Mercury → Pluto).
 *
 * All 26 values of each chart assert exactly (true node — with
 * the mean node the twelve node values would each miss).
 */
export const TEST_FIXTURES = {
  wheelAnchors: [
    { lon: 302, gate: 41, line: 1 },            // 02°00′ Aquarius — the wheel anchor
    { lon: 301.99, gate: 60, line: 6 },          // just before it: gate 60, last line
    { lon: 0, gate: 25, line: 2 },               // 0° Aries falls 1°45′ into gate 25 (from 28°15′ Pisces)
    { lon: 3.875, gate: 17, line: 1 },           // 03°52′30″ Aries — gate 17 begins
    { lon: 43.25, gate: 2, line: 1 },            // 13°15′ Taurus — gate 2 begins
    { lon: 90, gate: 15, line: 2 },              // June solstice sits in gate 15
    { lon: 180, gate: 46, line: 2 },             // September equinox in gate 46
    { lon: 270, gate: 10, line: 2 },             // December solstice in gate 10
    { lon: 302 + 0.9375, gate: 41, line: 2 },    // one line in
  ],
  charts: {
    raUruHu: {
      source: 'Zen HD chart service PDF (humandesignsystem.com); type/profile/authority/cross corroborated by flowwithhumandesign.com',
      input: { utc: '1948-04-09T05:14:00Z', local: '9 April 1948 · 00:14 EST · Montreal' },
      personality: ['51.5', '57.5', '51.1', '2.1', '1.1', '25.3', '20.6', '7.6', '10.1', '7.3', '12.1', '48.3', '33.6'],
      design: ['61.1', '62.1', '41.3', '23.3', '43.3', '60.1', '49.5', '40.2', '26.1', '4.3', '12.1', '48.4', '7.2'],
      type: 'Manifestor',
      profile: '5/1',
      authority: 'Splenic',
      definition: 'single',
      channels: ['10-20', '10-57', '20-57', '23-43', '25-51'],
      centersDefined: ['ajna', 'throat', 'g', 'heart', 'spleen'],
      cross: 'Left Angle Cross of the Clarion (51/57 | 61/62)',
    },
    obama: {
      source: 'Zen HD composite chart PDF (humandesignsystem.com); type/profile/authority/cross corroborated by loveyourhumandesign.com',
      input: { utc: '1961-08-05T05:24:00Z', local: '4 August 1961 · 19:24 AHST · Honolulu' },
      personality: ['33.6', '19.6', '20.4', '29.3', '30.3', '31.1', '15.4', '47.6', '60.5', '61.5', '29.1', '44.2', '40.2'],
      design: ['2.2', '1.2', '38.5', '59.4', '55.4', '2.6', '21.4', '56.4', '41.5', '60.4', '4.3', '44.3', '59.6'],
      type: 'Projector',
      profile: '6/2',
      authority: 'Emotional',
      definition: 'single',
      channels: ['30-41'],
      centersDefined: ['solar', 'root'],
      cross: 'Left Angle Cross of Refinement (33/19 | 2/1)',
    },
    biden: {
      source: 'Zen HD composite chart PDF (humandesignsystem.com); summary set derived, not externally published',
      input: { utc: '1942-11-20T12:30:00Z', local: '20 November 1942 · 08:30 EWT · Scranton' },
      personality: ['14.4', '8.4', '3.5', '59.1', '55.1', '43.3', '14.5', '44.6', '62.5', '16.5', '20.3', '46.4', '31.6'],
      design: ['29.6', '30.6', '61.1', '59.5', '55.5', '47.1', '31.6', '64.3', '53.2', '35.1', '20.5', '46.1', '31.5'],
      type: 'Generator',
      profile: '4/6',
      authority: 'Sacral',
      definition: 'split',
      channels: ['29-46', '47-64'],
      centersDefined: ['head', 'ajna', 'g', 'sacral'],
      cross: 'Right Angle Cross of Contagion (14/8 | 29/30)',
    },
  },
};
