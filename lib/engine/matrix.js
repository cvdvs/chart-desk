// ============================================================
// Matrix of Destiny — the calculation engine.
// Pure ESM, no DOM, no dependencies. The page imports this both
// server-side (Astro frontmatter, for the static specimen) and
// client-side (the live cast).
//
// The math was cross-checked dot by dot against a reference
// calculator's export. TEST_FIXTURES uses a fictional date.
//
// Two readings resolved against the reference render (both noted
// in punch-1 as "consult the PDF when ambiguous"):
// · Generation lines: the reference labels the MALE line (purple)
//   on the NW–SE diagonal and the FEMALE (red) on NE–SW, and its
//   triads print male 19·15·7 / female 15·19·7 — the same orders
//   chart-output-spec.md gives. punch-1's sentence transposes the
//   two diagonals; the reference + output spec win here.
//   TODO(verify): confirm male=NW–SE (values only
//   differ for dates whose corner arcana differ).
// · The ♥ point: punch-1 calls it "nearE on the SE diagonal";
//   in the reference it is the midpoint of the dashed money-love
//   chord C2→D2 (both give 11 for the reference specimen; the
//   chord's flanking values 7 and 8 confirm the chord structure,
//   so the chord midpoint is implemented).
//   TODO(verify): a birth date with E+SE reducing differently
//   would tell the two formulas apart.
// · Corner mini-chains (the 2 discs hugging each diagonal corner:
//   7·6 / 8·11 on the specimen): seeded from the money chain's
//   first value reduce(E+E). Reproduces all four corners on the
//   reference. TODO(verify): on the specimen reduce(E+E) equals
//   C2 (E=C=7), so the seed could also read reduce(E+C).
//
// One correction TO the reference (not an ambiguity it left open): the
// export prints the SAME chakra-ladder label on the throat rung
// (Vishuddha) as on the brow above it — "Destiny, egregores" — a
// template-duplication slip. Verified against six independent Matrix
// chakra sources (EN + RU, incl. the systematic Ladini "health map"):
// the throat rung governs self-expression / voice / reputation, never
// destiny or egregores — that is Ajna's sphere. Vishuddha's label is
// set to its own office below; the codex (chakra-vishuddha.md) already
// records both readings, so it stays correct either way.
// ============================================================

/** Reduce to the arcana range: while n > 22, replace with its digit sum. (37→10, 22→22.) */
export function reduce(n) {
  while (n > 22) n = String(n).split('').reduce((s, d) => s + Number(d), 0);
  return n;
}

function digitSum(n) {
  return String(n).split('').reduce((s, d) => s + Number(d), 0);
}

/** One age-ring sector between vertex arcana p and q (ages t → t+10). */
function sector(p, q, t) {
  const mid = reduce(p + q);        // the bold 5-year point
  const v25 = reduce(p + mid);      // the 2.5–3.5y dot
  const v75 = reduce(mid + q);      // the 7.5–8.5y dot
  const values = [
    reduce(p + v25), v25, reduce(v25 + mid),
    mid,
    reduce(mid + v75), v75, reduce(v75 + q),
  ];
  const labels = ['1–2.5', '2.5–3.5', '3.5–4', '5', '6–7.5', '7.5–8.5', '8.5–9'];
  return {
    fromAge: t,
    toAge: t + 10,
    from: p,
    to: q,
    mid,
    points: values.map((value, i) => ({
      value,
      frac: (i + 1) / 8,                                   // position along the octagon edge
      bold: i === 3,                                       // the 5-year point
      age: t + (i + 1) * 1.25,
      label: labels[i].replace(/(\d+(?:\.\d+)?)/g, (m) => String(t + Number(m))),
    })),
  };
}

/**
 * Cast a Matrix of Destiny chart from a birth date.
 * @param {{day:number, month:number, year:number}} input
 */
export function matrixChart({ day, month, year }) {
  // — the octagram's eight vertices + center —
  const A = reduce(day);                    // left · age 0
  const B = reduce(month);                  // top · 20y
  const C = reduce(digitSum(year));         // right · 40y
  const D = reduce(A + B + C);              // bottom · 60y
  const E = reduce(A + B + C + D);          // center · comfort zone
  const NW = reduce(A + B);                 // 10y
  const NE = reduce(B + C);                 // 30y
  const SE = reduce(C + D);                 // 50y
  const SW = reduce(D + A);                 // 70y

  // — inner chains along the four axes —
  // left/top carry three discs (p3 hugs the vertex, p2 sits on the
  // square-edge crossing, p4 sits nearer the center); right/bottom
  // carry two (p2 on the square edge, p3 hugging the vertex).
  const A2 = reduce(A + E), A3 = reduce(A + A2), A4 = reduce(A2 + E);
  const B2 = reduce(B + E), B3 = reduce(B + B2), B4 = reduce(B2 + E);
  const C2 = reduce(E + C), C3 = reduce(C2 + C);
  const D2 = reduce(E + D), D3 = reduce(D2 + D);

  // — the money chain hugging the center, growing rightward: $ on k2 —
  const k1 = reduce(E + E);
  const k2 = reduce(E + k1);

  // — the dashed money-love chord C2 → D2 across the SE quadrant: ♥ on mid —
  const lmMid = reduce(C2 + D2);
  const lmA = reduce(C2 + lmMid);           // dot toward C2
  const lmB = reduce(lmMid + D2);           // dot toward D2

  // — the two-disc chains hugging each diagonal corner —
  const cornerChain = (corner) => {
    const inner = reduce(corner + k1);      // the small disc, second from the corner
    const outer = reduce(corner + inner);   // the larger disc, adjacent to the corner
    return { outer, inner };
  };

  // — chakra table (crown→root): physics / energy / emotions —
  const H = [A, A3, A2, A4, E, C2, C];      // the horizontal ladder
  const V = [B, B3, B2, B4, E, D2, D];      // the vertical ladder
  // label = each rung's life-sphere. Vishuddha reads the throat's own
  // office (self-expression/reputation), not the reference PDF's
  // duplicated "Destiny, egregores" — see the header note.
  const CHAKRAS = [
    { key: 'sahasrara',    name: 'Sahasrara',    label: 'Mission',                          hue: 'violet' },
    { key: 'ajna',         name: 'Ajna',         label: 'Destiny, egregores',               hue: 'indigo' },
    { key: 'vissudha',     name: 'Vissudha',     label: 'Self-expression, reputation',      hue: 'cyan'   },
    { key: 'anahata',      name: 'Anahata',      label: 'Relationships, picture of the world', hue: 'green' },
    { key: 'manipura',     name: 'Manipura',     label: 'Status, possessions',              hue: 'yellow' },
    { key: 'svadhisthana', name: 'Svadhisthana', label: 'Love of children, joy',            hue: 'orange' },
    { key: 'muladhara',    name: 'Muladhara',    label: 'Body, materia',                    hue: 'red'    },
  ];
  const chakras = CHAKRAS.map((c, i) => ({
    ...c,
    physics: H[i],
    energy: V[i],
    emotions: reduce(H[i] + V[i]),
  }));
  const result = {
    label: 'Common energy-zone',
    physics: reduce(H.reduce((s, n) => s + n, 0)),
    energy: reduce(V.reduce((s, n) => s + n, 0)),
    emotions: reduce(chakras.reduce((s, c) => s + c.emotions, 0)),
  };

  // — synthesis blocks —
  const sky = reduce(B + D);
  const earth = reduce(A + C);
  const soul = { sky, earth, result: reduce(sky + earth) };
  const m = reduce(NW + SE);                // male diagonal NW–SE (see header note)
  const f = reduce(NE + SW);                // female diagonal NE–SW
  const socialization = { m, f, result: reduce(m + f) };
  const spiritual = reduce(socialization.result + soul.result);

  // — the age ring: eight sectors, seven numbered points each —
  const ring = [
    [A, NW, 0], [NW, B, 10], [B, NE, 20], [NE, C, 30],
    [C, SE, 40], [SE, D, 50], [D, SW, 60], [SW, A, 70],
  ].map(([p, q, t]) => sector(p, q, t));

  return {
    input: { day, month, year },
    points: { A, B, C, D, E, NW, NE, SE, SW },
    chains: {
      left:   { p3: A3, p2: A2, p4: A4 },
      top:    { p3: B3, p2: B2, p4: B4 },
      right:  { p3: C3, p2: C2 },
      bottom: { p3: D3, p2: D2 },
    },
    money: { k1, k2 },                       // $ marks k2
    loveMoneyLine: { a: lmA, mid: lmMid, b: lmB }, // ♥ marks mid
    love: lmMid,
    moneyPoint: k2,
    corners: {
      NW: cornerChain(NW), NE: cornerChain(NE),
      SE: cornerChain(SE), SW: cornerChain(SW),
    },
    generation: {
      male:   { diagonal: 'NW–SE', triad: [NW, SE, E] },   // printed top corner · bottom corner · center
      female: { diagonal: 'NE–SW', triad: [NE, SW, E] },
    },
    chakras,
    result,
    synthesis: { soul, socialization, spiritual },
    ageRing: ring,
  };
}

/** The 22 arcana — Matrix numbering (22 = The Fool). Name + one-line essence. */
export const ARCANA = {
  1:  { name: 'The Magician',       essence: 'will; the hand that begins.' },
  2:  { name: 'The High Priestess', essence: 'the veiled knowing; intuition kept.' },
  3:  { name: 'The Empress',        essence: 'abundance; life that grows by giving.' },
  4:  { name: 'The Emperor',        essence: 'order; the throne built from duty.' },
  5:  { name: 'The Hierophant',     essence: 'the teacher; tradition as a door.' },
  6:  { name: 'The Lovers',         essence: 'the choice that defines the heart.' },
  7:  { name: 'The Chariot',        essence: 'motion; the course held by attention alone.' },
  8:  { name: 'Strength',           essence: 'the gentled lion; power made tender.' },
  9:  { name: 'The Hermit',         essence: 'the lamp carried into one’s own dark.' },
  10: { name: 'The Wheel',          essence: 'turning luck; cycles owed and paid.' },
  11: { name: 'Justice',            essence: 'the scales; cause meeting consequence.' },
  12: { name: 'The Hanged Man',     essence: 'the pause; seeing by surrender.' },
  13: { name: 'Death',              essence: 'the ending that clears the field.' },
  14: { name: 'Temperance',         essence: 'measure; two waters made one.' },
  15: { name: 'The Devil',          essence: 'the chain chosen; appetite as teacher.' },
  16: { name: 'The Tower',          essence: 'the strike that frees by breaking.' },
  17: { name: 'The Star',           essence: 'the wound cooled; hope with open hands.' },
  18: { name: 'The Moon',           essence: 'the tide-lit path through illusion.' },
  19: { name: 'The Sun',            essence: 'warmth made visible; the child in the light.' },
  20: { name: 'Judgement',          essence: 'the call that raises what was buried.' },
  21: { name: 'The World',          essence: 'completion; the dance inside the wreath.' },
  22: { name: 'The Fool',           essence: 'the open step; beginning without armor.' },
};

/**
 * Fixtures for a fictional birth date: this engine's own output, pinned so
 * any change to the arithmetic shows up (the nine ring points were also
 * worked by hand). Sectors are asserted whole, not dot by dot.
 */
export const TEST_FIXTURES = {
  date: { day: 15, month: 6, year: 1990 },
  points: { A: 15, B: 6, C: 19, D: 4, E: 8, NW: 21, NE: 7, SE: 5, SW: 19 },
  H: [15, 20, 5, 13, 8, 9, 19],
  V: [6, 20, 14, 22, 8, 12, 4],
  emotions: [21, 4, 19, 8, 16, 21, 5],
  result: { physics: 17, energy: 14, emotions: 13 },
  soul: { sky: 10, earth: 7, result: 17 },
  socialization: { m: 8, f: 8, result: 16 },
  spiritual: 6,
  moneyPoint: 6,           // $
  love: 21,                // ♥
  moneyChain: [16, 6],
  loveMoneyLine: [3, 21, 6],
  corners: { NW: [4, 10], NE: [12, 5], SE: [8, 21], SW: [9, 8] }, // [outer, inner]
  maleTriad: [21, 5, 8],
  femaleTriad: [7, 19, 8],
  // full seven-dot sectors:
  sectorA_NW: [21, 6, 15, 9, 12, 3, 6],      // ages 0–10 · 5y point = 9
  sector40_50: [8, 7, 13, 6, 17, 11, 16],    // 5y point = 6
  sector50_60: [19, 14, 5, 9, 22, 13, 17],   // 5y point = 9
};
