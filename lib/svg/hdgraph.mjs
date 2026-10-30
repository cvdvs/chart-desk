// ============================================================
// Human Design bodygraph — the classic plate: nine centers, all
// 36 channels as pipes between the gates' own edge points, the
// gate NUMBERS inside each center — an activated gate is a solid
// colored disc with a white number (pops), an open gate a soft grey
// chip (recedes); the pipes plug in at the edges. Plus the four
// Variable arrows, and the Design (red) / Personality (black)
// activation panels flanking the graph.
//
// Personality ink near-black, Design ink red; a fully defined
// channel reads as one continuous colored pipe, a hanging gate
// colors only its half of the lane.
//
// Utility register — named descriptively; "Human Design" and
// "BodyGraph" are trademarks of their rights holders and no
// affiliation is implied.
// ============================================================
import { svgShell, esc } from './charts.mjs';
import { CHANNELS } from '../engine/humandesign.js';

const LANE = '#E3E0D8';     // bare channel lane
const P_INK = '#26232C';    // personality (black)
const D_INK = '#C0392B';    // design (red)
const OPEN_FILL = '#FFFFFF';
const OPEN_STROKE = '#B9B6AE';
const CHIP_OFF = '#9A968E'; // unactivated chip rim + text

// the nine centers: shape, classic defined fill + darker stroke,
// and the name label's spot (outside the shape unless noted)
const CENTERS9 = {
  head: { d: 'M 240 34 L 286 98 L 194 98 Z', fill: '#F4E76E', stroke: '#B0A54B', label: 'Head', lx: 240, ly: 24 },
  ajna: { d: 'M 194 120 L 286 120 L 240 184 Z', fill: '#7FBF6A', stroke: '#5B8A4C', label: 'Ajna', lx: 240, ly: 110 },
  throat: { d: 'M 190 222 H 290 V 314 H 190 Z', fill: '#B08A5F', stroke: '#7F6344', label: 'Throat', lx: 240, ly: 212 },
  g: { d: 'M 240 350 L 288 398 L 240 446 L 192 398 Z', fill: '#F4E76E', stroke: '#B0A54B', label: 'G', lx: 174, ly: 398 },
  heart: { d: 'M 292 414 L 372 414 L 332 476 Z', fill: '#D26A5A', stroke: '#974C41', label: 'Heart', lx: 392, ly: 406 },
  spleen: { d: 'M 52 465 L 140 540 L 52 615 Z', fill: '#B08A5F', stroke: '#7F6344', label: 'Spleen', lx: 24, ly: 540 },
  solar: { d: 'M 428 465 L 340 540 L 428 615 Z', fill: '#B08A5F', stroke: '#7F6344', label: 'Solar Plexus', lx: 452, ly: 540 },
  sacral: { d: 'M 194 502 H 286 V 578 H 194 Z', fill: '#D26A5A', stroke: '#974C41', label: 'Sacral', lx: 240, ly: 538, inside: true },
  root: { d: 'M 194 610 H 286 V 686 H 194 Z', fill: '#B08A5F', stroke: '#7F6344', label: 'Root', lx: 240, ly: 700 },
};

// Every gate twice over: SLOT = the point ON the center's edge
// where its channel plugs in (pipes need no artificial lanes —
// each gate owns a distinct point); and the number now sits there too (was a separate internal grid).
const SLOT = {
  64: [212, 98], 61: [240, 98], 63: [268, 98],
  47: [212, 120], 24: [240, 120], 4: [268, 120],
  17: [214, 148], 43: [240, 184], 11: [266, 148],
  62: [210, 222], 23: [240, 222], 56: [270, 222],
  16: [190, 245], 20: [190, 268], 31: [190, 291],
  35: [290, 245], 12: [290, 268], 45: [290, 291],
  8: [224, 314], 33: [256, 314],
  1: [240, 350], 7: [214, 376], 13: [266, 376],
  10: [192, 398], 25: [288, 398],
  15: [214, 420], 46: [266, 420], 2: [240, 446],
  21: [330, 414], 51: [298, 423], 26: [310, 442], 40: [358, 436],
  48: [70, 480], 57: [82, 491], 44: [95, 502], 50: [140, 540],
  32: [95, 578], 28: [82, 589], 18: [70, 600],
  36: [410, 480], 22: [398, 491], 37: [385, 502], 6: [340, 540],
  49: [385, 578], 55: [398, 589], 30: [410, 600],
  5: [212, 502], 14: [240, 502], 29: [268, 502],
  34: [194, 524], 27: [194, 556], 59: [286, 540],
  42: [212, 578], 3: [240, 578], 9: [268, 578],
  53: [212, 610], 60: [240, 610], 52: [268, 610],
  54: [194, 622], 38: [194, 650], 58: [194, 678],
  19: [286, 622], 39: [286, 650], 41: [286, 678],
};
// CHIP = where the NUMBER sits, inside the center in the classic reading rows.
// (The pipes still plug in at SLOT on the edge; the number reads inside.)
const CHIP = {
  64: [216, 84], 61: [240, 84], 63: [264, 84],
  47: [216, 131], 24: [240, 131], 4: [264, 131],
  17: [226, 152], 11: [254, 152], 43: [240, 170],
  62: [208, 234], 23: [240, 234], 56: [272, 234],
  16: [208, 254], 35: [272, 254],
  20: [208, 274], 12: [272, 274],
  31: [200, 297], 8: [227, 297], 33: [253, 297], 45: [280, 297],
  1: [240, 366], 7: [218, 386], 13: [262, 386],
  10: [208, 404], 25: [272, 404], 15: [220, 419], 46: [260, 419], 2: [240, 434],
  51: [310, 430], 21: [332, 430], 40: [354, 430], 26: [332, 452],
  48: [74, 494], 57: [74, 517], 44: [74, 540], 32: [74, 563], 28: [74, 586],
  50: [104, 528], 18: [104, 552],
  36: [406, 494], 22: [406, 517], 37: [406, 540], 49: [406, 563], 55: [406, 586],
  6: [376, 528], 30: [376, 552],
  5: [210, 516], 14: [240, 516], 29: [270, 516],
  34: [206, 538], 59: [274, 538],
  27: [205, 562], 42: [228, 562], 3: [251, 562], 9: [274, 562],
  53: [210, 624], 60: [240, 624], 52: [270, 624],
  54: [210, 648], 19: [240, 648], 39: [270, 648],
  38: [210, 672], 58: [240, 672], 41: [270, 672],
};

const GRAPH_X = 196, GRAPH_Y = 22;     // where the 480×700 graph sits on the plate
const N = (v) => +v.toFixed(2);

const P_GLYPH = {
  Sun: '☉', Earth: '⊕', Moon: '☽', 'North Node': '☊', 'South Node': '☋',
  Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄',
  Uranus: '♅', Neptune: '♆', Pluto: '♇',
};
const VS = '︎'; // text presentation — WebKit renders these as emoji otherwise

/** One gate's half of a channel lane, slot → midpoint. */
function halfOverlay([x1, y1], [x2, y2], status) {
  if (!status) return '';
  if (status !== 'pd') {
    const c = status === 'p' ? P_INK : D_INK;
    return `<line x1="${N(x1)}" y1="${N(y1)}" x2="${N(x2)}" y2="${N(y2)}" stroke="${c}" stroke-width="5" stroke-linecap="butt"/>`;
  }
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * 2.5, py = (dx / len) * 2.5;
  return `<line x1="${N(x1 + px)}" y1="${N(y1 + py)}" x2="${N(x2 + px)}" y2="${N(y2 + py)}" stroke="${P_INK}" stroke-width="2.5" stroke-linecap="butt"/>`
    + `<line x1="${N(x1 - px)}" y1="${N(y1 - py)}" x2="${N(x2 - px)}" y2="${N(y2 - py)}" stroke="${D_INK}" stroke-width="2.5" stroke-linecap="butt"/>`;
}

/**
 * The gate number as a chip inside its center. The activation contrast is the
 * whole point of reading a bodygraph, so the two states are deliberately far
 * apart: an UNACTIVATED gate is a soft grey chip that recedes into the fill; an
 * ACTIVATED gate is a SOLID colored disc (near-black = personality, red = design,
 * split when both) with a WHITE number, which pops cleanly on every center fill
 * — the yellows, greens, browns, reds and the open-white alike.
 */
function chip(gate, status) {
  const [x, y] = CHIP[gate];
  const r = 8.7;
  const label = (fill, weight) =>
    `<text x="${x}" y="${N(y + 0.4)}" text-anchor="middle" dominant-baseline="central" font-size="8.4" font-weight="${weight}" style="fill:${fill}">${gate}</text>`;

  if (!status) {
    // recedes: a faint chip with a grey number, low emphasis
    return `<circle data-g="${gate}" cx="${x}" cy="${y}" r="${r}" fill="#FFFFFF" fill-opacity="0.5" stroke="${CHIP_OFF}" stroke-width="0.9" stroke-opacity="0.7"/>`
      + label(CHIP_OFF, 500);
  }
  // pops: a solid activation-colored disc with a white number
  let g = '';
  if (status === 'pd') {
    g += `<path data-g="${gate}" d="M ${x} ${N(y - r)} A ${r} ${r} 0 0 0 ${x} ${N(y + r)} Z" fill="${P_INK}"/>`   // left half black
      + `<path d="M ${x} ${N(y - r)} A ${r} ${r} 0 0 1 ${x} ${N(y + r)} Z" fill="${D_INK}"/>`;  // right half red
  } else {
    g += `<circle data-g="${gate}" cx="${x}" cy="${y}" r="${r}" fill="${status === 'p' ? P_INK : D_INK}"/>`;
  }
  return g + label('#FFFFFF', 700);
}

/**
 * The four Variable arrows (PHS / Rave Psychology), computed from
 * the COLOR of four activations — the standard rule: colors 1–3
 * point left, 4–6 point right.
 *   top-left  Determination  ← Design Sun color
 *   low-left  Environment    ← Design North Node color
 *   top-right Perspective    ← Personality North Node color
 *   low-right Motivation     ← Personality Sun color
 */
function variableArrows(hd) {
  if (!hd) return '';
  const byLabel = (col, label) => col.find((a) => a.label === label);
  const spec = [
    { x: 132, y: 44, ink: D_INK, key: 'DETERMINATION', from: byLabel(hd.design, 'Sun'), src: 'Design Sun' },
    { x: 132, y: 78, ink: D_INK, key: 'ENVIRONMENT', from: byLabel(hd.design, 'North Node'), src: 'Design Node' },
    { x: 348, y: 44, ink: P_INK, key: 'PERSPECTIVE', from: byLabel(hd.personality, 'North Node'), src: 'Personality Node' },
    { x: 348, y: 78, ink: P_INK, key: 'MOTIVATION', from: byLabel(hd.personality, 'Sun'), src: 'Personality Sun' },
  ];
  let g = '';
  for (const s of spec) {
    if (!s.from) continue;
    const left = s.from.color <= 3;
    const L = 34, hw = 7;
    const x0 = s.x - L / 2, x1 = s.x + L / 2;
    const shaft = left
      ? `M ${x1} ${s.y} H ${x0 + 9}`
      : `M ${x0} ${s.y} H ${x1 - 9}`;
    const head = left
      ? `M ${x0} ${s.y} L ${x0 + 9} ${s.y - hw / 1.6} L ${x0 + 9} ${s.y + hw / 1.6} Z`
      : `M ${x1} ${s.y} L ${x1 - 9} ${s.y - hw / 1.6} L ${x1 - 9} ${s.y + hw / 1.6} Z`;
    g += `<g><title>${esc(`${s.key.toLowerCase()} — ${left ? 'left' : 'right'} arrow, from the ${s.src}'s color ${s.from.color} (colors 1–3 left · 4–6 right)`)}</title>`
      + `<path d="${shaft}" stroke="${s.ink}" stroke-width="2.4" fill="none"/><path d="${head}" fill="${s.ink}"/>`
      + `<text x="${s.x}" y="${s.y - 11}" text-anchor="middle" font-size="6.6" letter-spacing="0.6" style="fill:${s.ink};opacity:.8">${s.key}</text></g>`;
  }
  return g;
}

/** One activation column as a side panel: glyph · gate.line. */
function panel(col, { x, w, title, ink, alignRight }) {
  let g = `<text x="${alignRight ? x + w : x}" y="26" text-anchor="${alignRight ? 'end' : 'start'}" font-size="11" font-weight="700" letter-spacing="1.6" style="fill:${ink}">${esc(title)}</text>`;
  g += `<line x1="${x}" y1="36" x2="${x + w}" y2="36" stroke="${ink}" stroke-width="1" opacity=".5"/>`;
  col.forEach((a, i) => {
    const y = 58 + i * 25;
    const gx = alignRight ? x + w - 12 : x + 12;
    const vx = alignRight ? x + w - 34 : x + 34;
    g += `<g><title>${esc(`${a.label} · gate ${a.gate} line ${a.line} · color ${a.color} tone ${a.tone}`)}</title>`
      + `<text x="${gx}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="15" style="fill:${ink}">${P_GLYPH[a.label] ?? '·'}${VS}</text>`
      + `<text x="${vx}" y="${y}" text-anchor="${alignRight ? 'end' : 'start'}" dominant-baseline="central" font-size="12.5" font-weight="600" style="fill:${ink}">${a.gate}.${a.line}</text></g>`;
  });
  return g;
}

/**
 * @param {Object|null} hd buildHDChart() result (null → the empty plate)
 */
export function hdGraphSVG(hd, { size = 940, standalone = false } = {}) {
  const H = 760;
  const pSet = new Set((hd?.personality ?? []).map((a) => a.gate));
  const dSet = new Set((hd?.design ?? []).map((a) => a.gate));
  const defined = new Set(hd?.centers?.defined ?? []);
  const status = (g) => (pSet.has(g) ? (dSet.has(g) ? 'pd' : 'p') : dSet.has(g) ? 'd' : null);

  // 1 · lanes · 2 · activation overlays (both under the shapes, so
  // the pipes visually plug into the centers' edges)
  let lanes = '';
  let overlays = '';
  for (const { gates: [a, b] } of CHANNELS) {
    const A = SLOT[a], B = SLOT[b];
    lanes += `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="${LANE}" stroke-width="9" stroke-linecap="butt"/>`;
    const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    overlays += halfOverlay(A, M, status(a)) + halfOverlay(B, M, status(b));
  }

  // 3 · the center shapes, then the chips on top
  let shapes = '';
  let names = '';
  for (const [key, c] of Object.entries(CENTERS9)) {
    const on = defined.has(key);
    shapes += `<path data-center="${key}" d="${c.d}" fill="${on ? c.fill : OPEN_FILL}" stroke="${on ? c.stroke : OPEN_STROKE}" stroke-width="1.5"><title>${esc(`${c.label} — ${on ? 'defined' : 'open'}`)}</title></path>`;
    names += `<text x="${c.lx}" y="${c.ly}" text-anchor="middle" dominant-baseline="central" font-size="8.4" font-weight="600" letter-spacing="0.5" style="fill:currentColor;opacity:${c.inside ? 0.75 : 0.6}">${esc(c.label)}</text>`;
  }
  // Numbers read INSIDE their center (CHIP); the pipes plug in at the edge (SLOT).
  let chips = '';
  for (const gate of Object.keys(CHIP)) chips += chip(Number(gate), status(Number(gate)));

  const graph = `<g transform="translate(${GRAPH_X} ${GRAPH_Y})">${lanes}${overlays}${shapes}${names}${chips}${variableArrows(hd)}</g>`;

  const panels = hd
    ? panel(hd.design, { x: 14, w: 150, title: 'DESIGN', ink: D_INK, alignRight: false })
      + panel(hd.personality, { x: 776, w: 150, title: 'PERSONALITY', ink: P_INK, alignRight: true })
    : '';

  const legend = `<text x="${size / 2}" y="${H - 12}" text-anchor="middle" font-size="9" style="fill:currentColor;opacity:.55">`
    + `red = design (the body, ~88° before birth) · black = personality (the mind, at birth) · filled centers = defined · arrows = the four Variables</text>`;

  return svgShell(panels + graph + legend, { size, height: H, standalone, title: 'Bodygraph (computed)' });
}
