// ============================================================
// Matrix of Destiny — the classic colorful octagram template:
// both squares, colored vertex/corner/center discs, axis and
// corner chains, the dashed money–love channel ($ and ♥), the
// purple/red generation arrows, and the 8×7 age ring, rendered
// from a matrixChart() result. Template colors are fixed hexes
// (chosen to read on light AND dark pages); only the age-ring
// numbers, age labels, and legend use currentColor.
// ============================================================
import { svgShell, esc } from './charts.mjs';
import { ARCANA } from '../engine/matrix.js';

/** The age a ring period opens at — the engine labels them as ranges. */
const ageStart = (label) => String(label).split('–')[0];

const PURPLE = '#7B3FA0'; // A·B vertex discs, male generation line
const RED    = '#C0392B'; // C·D vertex discs, female line, ♥, bold age dots
const NAVY   = '#24457A'; // corner discs NW·NE·SE·SW
const YELLOW = '#F1C40F'; // center E
const DBLUE  = '#2E5FA3'; // left/top axis p3
const SKY    = '#58AEDF'; // left/top axis p2, corner inner discs
const GREEN  = '#6AA84F'; // left/top axis p4, $ glyph
const ORANGE = '#E67E22'; // right/bottom axis p3
const FRAME  = '#55524E'; // squares, white-disc outlines, dashed channel
const INK    = '#2B2833'; // dark numbers on white and yellow discs
const GRAY   = '#8d8a84'; // age-ring circle + plain age dots

const f = (v) => Math.round(v * 100) / 100;

export function matrixGraphSVG(mx, { size = 640, standalone = false } = {}) {
  const BASE = 640;
  const C = BASE / 2;            // (320, 320)
  const R = 225;                 // vertex radius
  const RC = R / Math.SQRT2;     // corner offset at 45°
  const P = {
    A: [C - R, C], B: [C, C - R], C_: [C + R, C], D: [C, C + R],
    NW: [C - RC, C - RC], NE: [C + RC, C - RC], SE: [C + RC, C + RC], SW: [C - RC, C + RC],
    E: [C, C],
  };
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const at = (deg, r) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];
  const line = (p, q, w, color, { opacity = 1, dash = '' } = {}) =>
    `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="${color}" stroke-width="${w}"${opacity < 1 ? ` opacity="${opacity}"` : ''}${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  // colored disc with an optional inner white ring; text color goes through
  // style="fill:…" because the shell's text{fill:currentColor} rule would
  // override a plain fill attribute.
  const disc = (x, y, r, n, { fill, ink = '#FFFFFF', ring = 0, rim = '', fs = 10, bold = false } = {}) =>
    `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}"${rim ? ` stroke="${rim}" stroke-width="1.2"` : ''}/>`
    + (ring ? `<circle cx="${f(x)}" cy="${f(y)}" r="${ring}" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>` : '')
    + `<text x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central" font-size="${fs}"${bold ? ' font-weight="700"' : ''} style="fill:${ink}">${esc(n)}</text>`;
  const white = (x, y, r, n, fs) => disc(x, y, r, n, { fill: '#FFFFFF', rim: FRAME, ink: INK, fs });

  let g = '';

  // — frame: age-ring circle, both squares, light axes + corner diagonals —
  const ringR = R + 34;
  g += `<circle cx="${C}" cy="${C}" r="${ringR}" fill="none" stroke="${GRAY}" stroke-width="1" opacity="0.45"/>`;
  const poly = (pts) =>
    `<path d="M ${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L ')} Z" fill="none" stroke="${FRAME}" stroke-width="1.2" opacity="0.75"/>`;
  g += poly([P.A, P.B, P.C_, P.D]);       // diamond square
  g += poly([P.NW, P.NE, P.SE, P.SW]);    // straight square
  g += line(P.A, P.C_, 0.8, FRAME, { opacity: 0.45 });
  g += line(P.B, P.D, 0.8, FRAME, { opacity: 0.45 });
  g += line(P.NW, P.SE, 0.8, FRAME, { opacity: 0.45 });
  g += line(P.NE, P.SW, 0.8, FRAME, { opacity: 0.45 });

  // — generation arrows: double-headed diagonals between the corner discs.
  //   Tips sit 46px from each corner-disc center (~27px clear of the disc
  //   edge) — the one gap between the corner's two chain discs where a
  //   head is actually visible; the line itself runs under the discs.
  const genArrow = (c1, c2, color, label, rot) => {
    const p1 = P[c1], p2 = P[c2];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const u = [(p2[0] - p1[0]) / len, (p2[1] - p1[1]) / len];
    const s1 = lerp(p1, p2, 46 / len), s2 = lerp(p1, p2, 1 - 46 / len);
    const head = (tip, d) => {
      const b = [tip[0] - d[0] * 8.5, tip[1] - d[1] * 8.5], n = [-d[1], d[0]];
      return `<path d="M ${f(tip[0])} ${f(tip[1])} L ${f(b[0] + n[0] * 3.6)} ${f(b[1] + n[1] * 3.6)} L ${f(b[0] - n[0] * 3.6)} ${f(b[1] - n[1] * 3.6)} Z" fill="${color}"/>`;
    };
    const [lx, ly] = lerp(p1, p2, 0.3);   // label seat: clear zone between chain discs and center
    return line(s1, s2, 1.5, color)
      + head(s1, [-u[0], -u[1]]) + head(s2, u)
      + `<text x="${f(lx)}" y="${f(ly)}" dy="-6" text-anchor="middle" font-size="9" style="fill:${color}" transform="rotate(${rot} ${f(lx)} ${f(ly)})">${label}</text>`;
  };
  g += genArrow('NW', 'SE', PURPLE, 'male generation line', 45);
  g += genArrow('NE', 'SW', RED, 'female generation line', -45);

  // — money–love channel: dashed C2→D2 chord with k1 · ♥ mid · k2 $ —
  const C2 = lerp(P.C_, P.E, 0.38), D2 = lerp(P.D, P.E, 0.38);
  g += line(C2, D2, 1, FRAME, { opacity: 0.8, dash: '4 3' });
  const K1 = lerp(C2, D2, 0.3), LM = lerp(C2, D2, 0.5), K2 = lerp(C2, D2, 0.7);
  g += white(K1[0], K1[1], 10, mx.money.k1, 9);
  g += white(LM[0], LM[1], 11, mx.loveMoneyLine.mid, 9.5);
  g += white(K2[0], K2[1], 11, mx.money.k2, 9.5);
  g += `<text x="${f(LM[0] - 18)}" y="${f(LM[1])}" text-anchor="middle" dominant-baseline="central" font-size="11" style="fill:${RED}">♥</text>`;
  g += `<text x="${f(K2[0] + 18)}" y="${f(K2[1])}" text-anchor="middle" dominant-baseline="central" font-size="11" style="fill:${GREEN}">$</text>`;

  // — axis chains (t measured from the vertex toward center) —
  const chain3 = (vx, ch) => {                     // left & top: p3 · p2 · p4
    const p3 = lerp(P[vx], P.E, 0.2), p2 = lerp(P[vx], P.E, 0.38), p4 = lerp(P[vx], P.E, 0.57);
    return disc(p3[0], p3[1], 12, ch.p3, { fill: DBLUE, fs: 10 })
      + disc(p2[0], p2[1], 14, ch.p2, { fill: SKY, fs: 11 })
      + disc(p4[0], p4[1], 11, ch.p4, { fill: GREEN, fs: 9.5 });
  };
  const chain2 = (vx, ch) => {                     // right & bottom: p3 · p2
    const p3 = lerp(P[vx], P.E, 0.2), p2 = lerp(P[vx], P.E, 0.38);
    return disc(p3[0], p3[1], 12, ch.p3, { fill: ORANGE, fs: 10 })
      + white(p2[0], p2[1], 14, ch.p2, 11);
  };
  g += chain3('A', mx.chains.left) + chain3('B', mx.chains.top);
  g += chain2('C_', mx.chains.right) + chain2('D', mx.chains.bottom);

  // — corner chains: white outer, sky inner —
  for (const k of ['NW', 'NE', 'SE', 'SW']) {
    const c = mx.corners[k];
    const o = lerp(P[k], P.E, 0.15), i = lerp(P[k], P.E, 0.28);
    g += white(o[0], o[1], 10, c.outer, 9);
    g += disc(i[0], i[1], 8, c.inner, { fill: SKY, fs: 8 });
  }

  // — vertex, corner, and center discs (each with the inner white ring) —
  for (const [k, fill] of [['A', PURPLE], ['B', PURPLE], ['C_', RED], ['D', RED]]) {
    g += disc(P[k][0], P[k][1], 24, mx.points[k === 'C_' ? 'C' : k], { fill, ring: 19, fs: 15, bold: true });
  }
  for (const k of ['NW', 'NE', 'SE', 'SW']) {
    g += disc(P[k][0], P[k][1], 19, mx.points[k], { fill: NAVY, ring: 15, fs: 12, bold: true });
  }
  g += disc(C, C, 26, mx.points.E, { fill: YELLOW, ring: 21, ink: INK, fs: 16, bold: true });

  // — age ring: 8 sectors × 7 dots, clockwise from A(0y) through NW·B·NE·C·SE·D·SW.
  //   Sector si spans 180°+45°·si → +45°; increasing SVG angle = clockwise.
  //   Numbers ride currentColor so the page theme inks them.
  //   Each dot carries its age period: the arcanum rides outside the
  //   ring, the ages inside it (the 5-year marks spelled out, the rest
  //   on hover) — so the ring reads "which arcanum runs at what age".
  mx.ageRing.forEach((sec, si) => {
    const a0 = 180 + 45 * si;
    for (const p of sec.points) {
      const deg = a0 + 45 * p.frac;
      const [dx, dy] = at(deg, ringR);
      const [tx, ty] = at(deg, ringR + (p.bold ? 10.5 : 9));
      const [ax, ay] = at(deg, ringR - 11);
      // arcanum outside the ring, its age inside it — the "y" keeps the
      // two readable apart (a bare 10 on the ring is an arcanum, 10y an age)
      g += `<g><title>${esc(`Ages ${p.label} (${p.start} to ${p.end}) — arcanum ${p.value} · ${ARCANA[p.value].name}`)}</title>`;
      g += `<circle cx="${f(dx)}" cy="${f(dy)}" r="${p.bold ? 3 : 2}" fill="${p.bold ? RED : GRAY}"/>`;
      g += `<text class="agev" x="${f(tx)}" y="${f(ty)}" text-anchor="middle" dominant-baseline="central" font-size="${p.bold ? 8.5 : 7}"${p.bold ? ' font-weight="700"' : ''} opacity="${p.bold ? 0.85 : 0.6}">${esc(p.value)}</text>`;
      g += `<text class="agev" x="${f(ax)}" y="${f(ay)}" text-anchor="middle" dominant-baseline="central" font-size="${p.bold ? 7 : 5.8}"${p.bold ? ' font-weight="600"' : ''} opacity="${p.bold ? 0.72 : 0.48}">${esc(ageStart(p.label))}y</text>`;
      g += '</g>';
    }
  });
  // the eight decade marks — the ring's own scale, set larger than the dots
  const AGE_AT = [['0y', 180], ['10y', 225], ['20y', 270], ['30y', 315], ['40y', 0], ['50y', 45], ['60y', 90], ['70y', 135]];
  AGE_AT.forEach(([label, ang], si) => {
    const [x, y] = at(ang, ringR + 23);
    g += `<text x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="700" opacity="0.72">${label}</text>`;
    g += `<text x="${f(x)}" y="${f(y + 10)}" text-anchor="middle" dominant-baseline="central" font-size="7.5" opacity="0.6">${mx.ageRing[si].corner.start.slice(0, 4)}</text>`;
  });

  // — legend —
  g += `<text x="${C}" y="${BASE - 14}" text-anchor="middle" font-size="9" opacity="0.6">A day · B month · C year · D karmic sum · E comfort zone · $ money line · ♥ love line</text>`;

  const inner = size === BASE ? g : `<g transform="scale(${size / BASE})">${g}</g>`;
  return svgShell(inner, { size, standalone, title: 'Matrix of Destiny octagram' });
}
