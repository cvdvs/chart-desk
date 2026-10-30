// ============================================================
// Traditional Vedic chart renderers — North Indian (diamond,
// fixed houses) and South Indian (square, fixed signs) — as
// pure SVG-string functions. Server serves them standalone;
// the UI inlines them. Strokes/text use currentColor so the
// page theme (light default) colors the chart; standalone
// files carry a small light-mode style.
// ============================================================

const GLYPH = {
  sun: 'Su', moon: 'Mo', mercury: 'Me', venus: 'Ve', mars: 'Ma',
  jupiter: 'Ju', saturn: 'Sa', rahu: 'Ra', ketu: 'Ke',
  uranus: 'Ur', neptune: 'Ne', pluto: 'Pl', asc: 'As',
};
// U+FE0E keeps the zodiac glyphs in text presentation (WebKit renders
// them as color emoji otherwise — the phone runs Safari)
const SIGN_SYM = ['♈︎', '♉︎', '♊︎', '♋︎', '♌︎', '♍︎', '♎︎', '♏︎', '♐︎', '♑︎', '♒︎', '♓︎'];
const SIGN_NAME3 = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];

/**
 * Normalize a cast into renderable placements for a given varga.
 * D1 carries degrees; higher vargas carry sign seats only.
 * @param {Object} vedic buildVedicChart() result
 * @param {number} n varga number (1 = rasi)
 * @param {{outers?:boolean}} [opts]
 */
export function placements(vedic, n = 1, { outers = false, timeUnknown = false } = {}) {
  const keys = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
    ...(outers ? ['uranus', 'neptune', 'pluto'] : []), 'rahu', 'ketu'];
  // With no birth time the ascendant is a noon artifact, so the houses numbered
  // from it and the "La" marker are fiction. The renderers read this to suppress
  // them and stamp a caveat — otherwise a downloaded chart shows a definite lagna
  // and a full house grid as if real (the in-app view already flags it; the
  // standalone SVG/PNG did not).
  const out = { varga: `D${n}`, timeUnknown };
  if (n === 1) {
    out.ascSign = vedic.ascSign;
    out.bodies = keys.map((k) => {
      const p = k === 'rahu' ? vedic.nodes.rahu : k === 'ketu' ? vedic.nodes.ketu
        : vedic.planets.find((x) => x.body === k);
      return { key: k, sign: p.sign, deg: p.degInSign, retro: !!p.retro };
    });
  } else {
    const v = vedic.vargas[`D${n}`];
    if (!v) throw new Error(`varga D${n} not computed`);
    out.ascSign = v.asc.sign;
    out.bodies = keys.filter((k) => v[k]).map((k) => ({ key: k, sign: v[k].sign, deg: null, retro: false }));
  }
  return out;
}

const bodyLabel = (b) =>
  `${GLYPH[b.key]}${b.deg != null ? ' ' + String(Math.floor(b.deg)).padStart(2, '0') : ''}${b.retro ? '°ʀ' : b.deg != null ? '°' : ''}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function svgShell(inner, { size = 460, height = null, title = 'chart', standalone = false } = {}) {
  // text inherits currentColor explicitly — SVG <text> otherwise defaults
  // to black fill regardless of the page theme (the dark-mode bug).
  const style = standalone
    ? `<style>svg{color:#1c1b22;background:#fff}text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;fill:currentColor}</style>`
    : `<style>text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;fill:currentColor}</style>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${height ?? size}" role="img" aria-label="${esc(title)}">${style}${standalone ? `<rect width="${size}" height="${height ?? size}" fill="#fff"/>` : ''}${inner}</svg>`;
}

// A visible caveat in a strip below the chart, so it survives PNG export the way
// the in-app caveat and the markdown one do. Adds CAVEAT_H to the canvas height.
const CAVEAT_H = 22;
function noonCaveat(size, text) {
  return `<text x="${size / 2}" y="${size + 15}" text-anchor="middle" font-size="11" ` +
    `fill="#b3541e" font-weight="600">${esc(text)}</text>`;
}

export { svgShell, esc };

// ————————————————————————— NORTH INDIAN —————————————————————————
// Fixed houses: H1 the top-center kite, counter-clockwise.
// Canvas 460×460 with 10px margin → frame 440.

export function northIndianSVG(pl, { size = 460, standalone = false, title } = {}) {
  const M = 10, W = size - 2 * M;
  const x = (f) => M + W * f, y = (f) => M + W * f;
  // corner + midpoint helpers
  const TL = [x(0), y(0)], TR = [x(1), y(0)], BR = [x(1), y(1)], BL = [x(0), y(1)];
  const MT = [x(0.5), y(0)], MR = [x(1), y(0.5)], MB = [x(0.5), y(1)], ML = [x(0), y(0.5)];
  const C = [x(0.5), y(0.5)];

  // the twelve regions: house → polygon + label anchor + sign anchor
  const Q = [x(0.25), y(0.25)], Q2 = [x(0.75), y(0.25)], Q3 = [x(0.75), y(0.75)], Q4 = [x(0.25), y(0.75)];
  const HOUSES = [
    { h: 1, poly: [Q, MT, Q2, C], at: [0.5, 0.27], sign: [0.5, 0.44] },
    { h: 2, poly: [TL, MT, Q], at: [0.25, 0.1], sign: [0.32, 0.2] },
    { h: 3, poly: [TL, Q, ML], at: [0.1, 0.25], sign: [0.2, 0.32] },
    { h: 4, poly: [Q, ML, Q4, C], at: [0.27, 0.5], sign: [0.44, 0.5] },
    { h: 5, poly: [ML, Q4, BL], at: [0.1, 0.75], sign: [0.2, 0.68] },
    { h: 6, poly: [BL, Q4, MB], at: [0.25, 0.9], sign: [0.32, 0.8] },
    { h: 7, poly: [Q4, MB, Q3, C], at: [0.5, 0.73], sign: [0.5, 0.56] },
    { h: 8, poly: [MB, Q3, BR], at: [0.75, 0.9], sign: [0.68, 0.8] },
    { h: 9, poly: [Q3, BR, MR], at: [0.9, 0.75], sign: [0.8, 0.68] },
    { h: 10, poly: [Q3, MR, Q2, C], at: [0.73, 0.5], sign: [0.56, 0.5] },
    { h: 11, poly: [MR, Q2, TR], at: [0.9, 0.25], sign: [0.8, 0.32] },
    { h: 12, poly: [Q2, TR, MT], at: [0.75, 0.1], sign: [0.68, 0.2] },
  ];

  const byHouse = Object.fromEntries(HOUSES.map((h) => [h.h, []]));
  for (const b of pl.bodies) {
    const h = ((b.sign - pl.ascSign + 12) % 12) + 1;
    byHouse[h].push(b);
  }

  let g = `<rect x="${M}" y="${M}" width="${W}" height="${W}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
  g += `<path d="M ${TL} L ${BR} M ${TR} L ${BL} M ${MT} L ${MR} L ${MB} L ${ML} Z" fill="none" stroke="currentColor" stroke-width="1.1"/>`;

  // sign watermarks first (big, bold, low opacity — the ground layer),
  // planets drawn over them at full ink
  let marks = '';
  let bodiesG = '';
  for (const H of HOUSES) {
    const signIdx = (pl.ascSign + H.h - 1) % 12;
    const kite = H.poly.length === 4;
    const mx = x(H.at[0]), my = y(H.at[1]);
    marks += `<g opacity="0.16" font-weight="700">` +
      `<text x="${mx}" y="${my - (kite ? 14 : 9)}" text-anchor="middle" dominant-baseline="central" font-size="${kite ? 34 : 24}">${SIGN_SYM[signIdx]}</text>` +
      `<text x="${mx}" y="${my + (kite ? 13 : 9)}" text-anchor="middle" dominant-baseline="central" font-size="${kite ? 11 : 9}" letter-spacing="0.08em">${SIGN_NAME3[signIdx]} ${signIdx + 1}</text></g>`;
    const list = byHouse[H.h];
    // Same fit as the south chart. The anchors stay inside their triangle here,
    // but a 7-body house (a D2 hora) still outgrows the space it has.
    const lh = list.length > 4 ? Math.max(9, 13 - (list.length - 4)) : 13;
    const fs = list.length > 4 ? Math.max(8, 11.5 - (list.length - 4) * 0.7) : 11.5;
    list.forEach((b, i) => {
      const yy = my + 24 + (kite ? 8 : -4) + i * lh - ((list.length - 1) * lh) / 2;
      bodiesG += `<text x="${mx}" y="${yy}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="600">${esc(bodyLabel(b))}</text>`;
    });
  }
  g += marks + bodiesG;
  // North Indian is fixed-HOUSE: which sign occupies each house rotates with the
  // ascendant, so with no birth time the entire house framing is a noon guess.
  // Nothing to suppress cleanly — stamp the whole chart with the caveat.
  if (pl.timeUnknown) g += noonCaveat(size, 'no birth time — houses are a noon guess');
  return svgShell(g, { size, height: pl.timeUnknown ? size + CAVEAT_H : size, standalone, title: title ?? `North Indian chart ${pl.varga}` });
}

// ————————————————————————— SOUTH INDIAN —————————————————————————
// Fixed signs: 4×4 grid, Aries in the second cell of the top row,
// clockwise; lagna marked with the diagonal stroke in its cell.

const SOUTH_CELL = [
  [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3],
  [2, 3], [1, 3], [0, 3], [0, 2], [0, 1], [0, 0],
]; // index = sign (0 Aries … 11 Pisces) → [col,row]

export function southIndianSVG(pl, { size = 460, standalone = false, title } = {}) {
  const M = 10, W = size - 2 * M, cell = W / 4;
  let g = `<rect x="${M}" y="${M}" width="${W}" height="${W}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
  // grid lines around the border cells only
  for (let i = 1; i < 4; i++) {
    g += `<path d="M ${M + i * cell} ${M} V ${M + W} M ${M} ${M + i * cell} H ${M + W}" fill="none" stroke="currentColor" stroke-width="0.9"/>`;
  }
  // mask the inner 2×2 (visual hole)
  g += `<rect x="${M + cell + 0.7}" y="${M + cell + 0.7}" width="${2 * cell - 1.4}" height="${2 * cell - 1.4}" fill="var(--panel, #fff)" stroke="none"/>`;
  g += `<text x="${M + 2 * cell}" y="${M + 2 * cell}" text-anchor="middle" dominant-baseline="central" font-size="12" opacity="0.5">${esc(pl.varga)}</text>`;

  const bySign = Array.from({ length: 12 }, () => []);
  for (const b of pl.bodies) bySign[b.sign].push(b);

  let marks = '';
  let bodiesG = '';
  for (let s = 0; s < 12; s++) {
    const [c, r] = SOUTH_CELL[s];
    const x0 = M + c * cell, y0 = M + r * cell;
    // the sign watermark — big, bold, low opacity, centered in the cell
    marks += `<g opacity="0.16" font-weight="700">` +
      `<text x="${x0 + cell / 2}" y="${y0 + cell / 2 - 12}" text-anchor="middle" dominant-baseline="central" font-size="30">${SIGN_SYM[s]}</text>` +
      `<text x="${x0 + cell / 2}" y="${y0 + cell / 2 + 12}" text-anchor="middle" dominant-baseline="central" font-size="10" letter-spacing="0.08em">${SIGN_NAME3[s]}</text></g>`;
    // South Indian is fixed-SIGN, so planets sit in the right cells regardless of
    // birth time — only the house numbers and the "La" diagonal are derived from
    // the ascendant. With no birth time those are fiction, so they are suppressed
    // (the sign-based chart stays valid); a caveat is stamped below.
    if (!pl.timeUnknown) {
      const houseNum = ((s - pl.ascSign + 12) % 12) + 1;
      marks += `<text x="${x0 + cell - 7}" y="${y0 + 13}" font-size="10" text-anchor="end" opacity="0.55">${houseNum}</text>`;
      if (s === pl.ascSign) {
        g += `<path d="M ${x0} ${y0 + cell * 0.3} L ${x0 + cell * 0.3} ${y0}" stroke="currentColor" stroke-width="1.2"/>`;
        marks += `<text x="${x0 + 7}" y="${y0 + 13}" font-size="10" opacity="0.8" font-weight="600">La</text>`;
      }
    }
    const list = bySign[s];
    // Lay the bodies out INSIDE the cell. This used to be a fixed 13.5px stack
    // centred at 78% of the cell height, with no clamp: from the fifth body the
    // bottom label crossed the grid line and rendered in the NEIGHBOURING sign's
    // cell. On a chart with five planets in Leo, Jupiter read as Jupiter alone
    // in Virgo, house 11 — it is at 1°33′ Leo, house 10. Every D2 hits this,
    // since hora gives only two signs to hold all ten bodies.
    // Past four bodies one column cannot fit legibly, so it splits in two.
    const top = y0 + cell * 0.58;          // clear of the sign watermark
    const bot = y0 + cell - 9;
    const cols = list.length > 4 ? 2 : 1;
    const per = Math.ceil(list.length / cols);
    const lh = Math.min(13.5, (bot - top) / Math.max(1, per - 1 || 1));
    const fs = cols === 1 ? 11.5 : Math.max(8, Math.min(10.5, lh - 1.5));
    const mid = (top + bot) / 2;
    list.forEach((b, i) => {
      const col = Math.floor(i / per);
      const inCol = i % per;
      const n = Math.min(per, list.length - col * per);
      const xx = x0 + cell / 2 + (cols === 1 ? 0 : (col === 0 ? -cell / 4.2 : cell / 4.2));
      const yy = mid + (inCol - (n - 1) / 2) * lh;
      bodiesG += `<text x="${xx}" y="${yy}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="600">${esc(bodyLabel(b))}</text>`;
    });
  }
  g += marks + bodiesG;
  if (pl.timeUnknown) g += noonCaveat(size, 'no birth time — houses & lagna omitted (signs are correct)');
  return svgShell(g, { size, height: pl.timeUnknown ? size + CAVEAT_H : size, standalone, title: title ?? `South Indian chart ${pl.varga}` });
}
