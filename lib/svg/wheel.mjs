// ============================================================
// Tropical wheel — the western-style round chart for the
// tropical view, in the astro-seek register. Ascendant on the
// left horizon, zodiac running counterclockwise. From the rim
// inward: element-tinted sign band, 1°/5°/10° tick band,
// whole-sign house band, AC–DC / MC–IC axes, planet ring
// (collision-nudged glyphs with degree°minute′ labels), and
// aspect lines inside the hub circle. Neutral ink stays
// currentColor so the app themes it; the deliberate hues are
// fixed hex picked to read on both white and near-black.
// ============================================================
import { svgShell, esc } from './charts.mjs';

const SIGN_GLYPH = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
// fire / earth / air / water — sign index s → ELEMENT[s % 4]
const ELEMENT = ['#C0533F', '#58864A', '#C79A3B', '#4A7FB5'];
const P_GLYPH = {
  sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃',
  saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇', rahu: '☊', ketu: '☋',
};
const P_COLOR = {
  sun: '#C79A3B', moon: '#C79A3B',                         // luminaries
  mercury: '#4A7FB5', venus: '#4A7FB5', mars: '#4A7FB5',   // personal
  jupiter: '#58864A', saturn: '#58864A',                   // social
  uranus: '#8B6FC9', neptune: '#8B6FC9', pluto: '#8B6FC9', // outers
  rahu: '#C0533F', ketu: '#C0533F',                        // nodes
};
const ASPECT_COLOR = { square: '#C0392B', opposition: '#C0392B', trine: '#2E86C1', sextile: '#2E86C1' };

const norm = (d) => ((d % 360) + 360) % 360;
// U+FE0E forces text presentation — zodiac codepoints default to color
// emoji in WebKit (Safari/iOS), which would ignore the element fills.
const VS = '\uFE0E';

/**
 * @param {{ascLon:number, mcLon:number,
 *          bodies:Array<{key:string, lon:number, retro?:boolean}>,
 *          aspects?:{main?:Array<{a:string,b:string,type:string,orb:number,applying?:boolean}>,
 *                    other?:Array<{a:string,b:string,type:string,orb:number,applying?:boolean}>}}} data
 * @param {{size?:number, standalone?:boolean}} [opts]
 * @returns {string} SVG markup
 */
export function wheelSVG({ ascLon, mcLon, bodies = [], aspects }, { size = 600, standalone = false } = {}) {
  const C = size / 2;
  const R = C - 16;            // outer rim
  const R_SIGN = R - 34;       // sign band inner edge
  const R_TICK = R_SIGN - 14;  // tick band inner edge
  const R_HOUSE = R_TICK - 22; // house band inner edge
  const R_BODY = R - 95;       // planet glyph ring
  const R_HUB = R - 146;       // aspect hub circle (room for the radial degree labels)

  const F = (n) => String(Math.round(n * 100) / 100);
  const ang = (lon) => ((180 + (lon - ascLon)) * Math.PI) / 180; // asc at left, CCW zodiac
  const pt = (lon, r) => { const a = ang(lon); return [C + r * Math.cos(a), C - r * Math.sin(a)]; };
  const ln = (p, q, attrs) => `<line x1="${F(p[0])}" y1="${F(p[1])}" x2="${F(q[0])}" y2="${F(q[1])}" ${attrs}/>`;
  const spoke = (lon, r1, r2, attrs) => ln(pt(lon, r1), pt(lon, r2), attrs);
  const txt = (p, fs, body, attrs = '') =>
    `<text x="${F(p[0])}" y="${F(p[1])}" text-anchor="middle" dominant-baseline="central" font-size="${fs}"${attrs ? ' ' + attrs : ''}>${body}</text>`;

  let g = '';

  // ——— 1 · sign band: element-tinted sectors, boundaries, glyphs ———
  for (let s = 0; s < 12; s++) {
    const [o1x, o1y] = pt(s * 30, R), [o2x, o2y] = pt(s * 30 + 30, R);
    const [i2x, i2y] = pt(s * 30 + 30, R_SIGN), [i1x, i1y] = pt(s * 30, R_SIGN);
    g += `<path d="M ${F(o1x)} ${F(o1y)} A ${R} ${R} 0 0 0 ${F(o2x)} ${F(o2y)} L ${F(i2x)} ${F(i2y)} A ${R_SIGN} ${R_SIGN} 0 0 1 ${F(i1x)} ${F(i1y)} Z" fill="${ELEMENT[s % 4]}" fill-opacity="0.07" stroke="none"/>`;
  }
  g += `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
  g += `<circle cx="${C}" cy="${C}" r="${R_SIGN}" fill="none" stroke="currentColor" stroke-width="1"/>`;
  g += `<circle cx="${C}" cy="${C}" r="${R_TICK}" fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.5"/>`;
  g += `<circle cx="${C}" cy="${C}" r="${R_HOUSE}" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.3"/>`;
  for (let s = 0; s < 12; s++) {
    g += spoke(s * 30, R_SIGN, R, 'stroke="currentColor" stroke-width="1" opacity="0.8"');
    // colored glyphs need style= — the shell's text{fill:currentColor} rule beats a fill attribute
    g += txt(pt(s * 30 + 15, (R + R_SIGN) / 2), 18, SIGN_GLYPH[s] + VS, `style="fill:${ELEMENT[s % 4]}"`);
  }

  // ——— 2 · tick band: 1° thin, 5° medium, 10° strong ———
  for (let d = 0; d < 360; d++) {
    if (d % 30 === 0) continue; // sign boundaries already stroked
    const [rIn, w, op] = d % 10 === 0 ? [R_TICK, 1, 0.8]
      : d % 5 === 0 ? [R_SIGN - 9, 0.8, 0.55]
        : [R_SIGN - 5, 0.5, 0.3];
    g += spoke(d, R_SIGN, rIn, `stroke="currentColor" stroke-width="${w}" opacity="${op}"`);
  }

  // ——— 3 · whole-sign house band: dashed cusp spokes + numbers ———
  // house 1 = the ascendant's sign; numbering follows the zodiac (counterclockwise)
  const ascSign = Math.floor(norm(ascLon) / 30);
  for (let s = 0; s < 12; s++) {
    g += spoke(s * 30, R_HUB, R_TICK, 'stroke="currentColor" stroke-width="0.6" stroke-dasharray="3 3" opacity="0.3"');
  }
  for (let h = 1; h <= 12; h++) {
    const mid = ((ascSign + h - 1) % 12) * 30 + 15;
    g += txt(pt(mid, (R_TICK + R_HOUSE) / 2), 10, h, 'opacity="0.55"');
  }

  // ——— 4 · angles: AC–DC horizon + MC–IC axis ———
  const arrow = (lon) => { // small filled head pointing outward, tip on the rim
    const a = ang(lon), ca = Math.cos(a), sa = Math.sin(a);
    const p = (r, w) => `${F(C + r * ca + w * sa)},${F(C - r * sa + w * ca)}`;
    return `<polygon points="${p(R, 0)} ${p(R - 9, 3.8)} ${p(R - 9, -3.8)}" fill="currentColor"/>`;
  };
  const axisLabel = (lon, s, main) => { // set beside the axis, perpendicular offset
    const a = ang(lon), [x, y] = pt(lon, R_SIGN - 13);
    return txt([x + 10 * Math.sin(a), y + 10 * Math.cos(a)], 10, s,
      main ? 'font-weight="600"' : 'font-weight="500" opacity="0.75"');
  };
  g += ln(pt(ascLon + 180, R), pt(ascLon, R), 'stroke="currentColor" stroke-width="2"');
  g += ln(pt(mcLon + 180, R), pt(mcLon, R), 'stroke="currentColor" stroke-width="1.2" stroke-dasharray="6 4"');
  g += arrow(ascLon) + arrow(mcLon);
  g += axisLabel(ascLon, 'AC', true) + axisLabel(ascLon + 180, 'DC', false);
  g += axisLabel(mcLon, 'MC', true) + axisLabel(mcLon + 180, 'IC', false);

  // ——— 5 · aspect hub: lines between true longitudes on the hub circle ———
  g += `<circle cx="${C}" cy="${C}" r="${R_HUB}" fill="none" stroke="currentColor" stroke-width="1"/>`;
  const lonOf = { asc: ascLon, mc: mcLon };
  for (const b of bodies) lonOf[b.key] = b.lon;
  const seen = new Set();
  let dots = '';
  for (const A of [...(aspects?.main ?? []), ...(aspects?.other ?? [])]) {
    const la = lonOf[A.a], lb = lonOf[A.b];
    if (la == null || lb == null) continue; // both ends must be drawable
    const key = [A.a, A.b].sort().join('~') + '~' + A.type;
    if (seen.has(key)) continue;
    seen.add(key);
    if (A.type === 'conjunction') { // no line — a dot at the midpoint of the short arc
      let d = norm(lb - la); if (d > 180) d -= 360;
      const [mx, my] = pt(la + d / 2, R_HUB);
      dots += `<circle cx="${F(mx)}" cy="${F(my)}" r="3" fill="#58864A"/>`;
      continue;
    }
    const color = ASPECT_COLOR[A.type];
    if (!color) continue;
    const orb = Math.abs(A.orb ?? 0);
    g += ln(pt(la, R_HUB), pt(lb, R_HUB),
      `stroke="${color}" stroke-width="${orb <= 1.5 ? 1.6 : 1}"${orb <= 4 ? '' : ' stroke-dasharray="5 4"'}`);
  }
  g += dots;

  // ——— 6 · planets: sorted, nudged apart to ≥7° of display separation ———
  const shown = bodies.map((b) => ({ ...b, lon: norm(b.lon), showLon: norm(b.lon) }))
    .sort((a, b) => a.lon - b.lon);
  if (shown.length > 1) {
    for (let pass = 0; pass < 12; pass++) {
      let moved = false;
      for (let i = 0; i < shown.length; i++) {
        const a = shown[i], b = shown[(i + 1) % shown.length];
        const gap = i === shown.length - 1 ? norm(b.showLon - a.showLon) : b.showLon - a.showLon;
        if (gap < 7) {
          const push = (7 - gap) / 2;
          a.showLon -= push; b.showLon += push; moved = true;
        }
      }
      if (!moved) break;
    }
  }
  // Keep every glyph inside its own sign's 30° sector. The nudge above spreads
  // crowded planets for legibility with no boundary, so a body near a cusp could
  // be pushed into the neighboring sign — and since the degree label is drawn at
  // showLon too, the label reinforced the wrong sign rather than disambiguating.
  // Clamp to the TRUE longitude's sector; a sign holds ~4 glyphs at 7° spacing.
  for (const b of shown) {
    const s0 = Math.floor(b.lon / 30) * 30;
    b.showLon = norm(Math.min(s0 + 29.2, Math.max(s0 + 0.8, b.showLon)));
  }
  for (const b of shown) {
    const color = P_COLOR[b.key] ?? 'currentColor';
    // true-longitude tick on the house-band inner edge
    g += spoke(b.lon, R_HOUSE, R_HOUSE - 6, `stroke="${color}" stroke-width="1.2" opacity="0.9"`);
    if (Math.abs(norm(b.showLon - b.lon + 180) - 180) > 0.05) { // displaced → thin connector
      g += ln(pt(b.lon, R_HOUSE - 7), pt(b.showLon, R_BODY + 11), 'stroke="currentColor" stroke-width="0.6" opacity="0.4"');
    }
    g += txt(pt(b.showLon, R_BODY), 17, P_GLYPH[b.key] ? P_GLYPH[b.key] + VS : esc(b.key), `style="fill:${color}"`);
    // degree°minute′(℞) just inside the glyph — run along the radius so
    // neighboring labels never collide; flipped on the left half so the
    // text is never upside down
    const totMin = Math.round((b.lon % 30) * 60);
    const dg = Math.floor(totMin / 60) % 30, mn = totMin % 60;
    const theta = norm(180 + (b.showLon - ascLon)); // screen angle of the label point
    const rot = -theta + (theta > 90 && theta < 270 ? 180 : 0);
    const [lx, ly] = pt(b.showLon, R_BODY - 30);
    g += `<text x="${F(lx)}" y="${F(ly)}" text-anchor="middle" dominant-baseline="central" font-size="9" opacity="0.75" transform="rotate(${F(rot)} ${F(lx)} ${F(ly)})">${dg}°${String(mn).padStart(2, '0')}′${b.retro ? '℞' : ''}</text>`;
  }

  // ——— 7 · legend ———
  g += `<text x="${C}" y="${size - 5}" text-anchor="middle" font-size="9" opacity="0.55">AC left horizon · red = square/opposition · blue = trine/sextile · dot = conjunction</text>`;

  return svgShell(g, { size, standalone, title: 'Tropical wheel' });
}
