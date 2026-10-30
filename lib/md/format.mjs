// ============================================================
// Markdown formatters — the LLM-facing export layer. Every
// system renders to a clean, self-contained .md a model (or a
// person) can read without the app: full tables, stated
// conventions, honest caveats. atlasMd() concatenates the whole
// set into the reading-intake pack.
// ============================================================
import { SIGNS } from '../engine/jyotish.js';
import { ARCANA } from '../engine/matrix.js';

const PLANET_LABELS = {
  sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune',
  pluto: 'Pluto', rahu: 'Rahu', ketu: 'Ketu', asc: 'Ascendant',
};
const CLASSICAL = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
const OUTERS = ['uranus', 'neptune', 'pluto'];

const dms = (deg) => {
  const d = Math.floor(deg);
  const m = Math.floor((deg - d) * 60);
  return `${d}°${String(m).padStart(2, '0')}′`;
};
const dt = (d) => new Date(d).toISOString().slice(0, 10);
const spanOf = (start, end) => {
  const days = (new Date(end) - new Date(start)) / 86400e3;
  if (days >= 365) return `${(days / 365.25).toFixed(1)}y`;
  if (days >= 45) return `${Math.round(days / 30.44)}mo`;
  return `${Math.round(days)}d`;
};
// the native's age when a period begins. Vimshottari's first mahadasha nominally
// starts before birth (the balance is its leftover), so at/before birth = "birth".
const ageAt = (ts, birthMs) => {
  const ms = new Date(ts) - birthMs;
  if (ms <= 0) return 'birth';
  const days = ms / 86400e3;
  const y = Math.floor(days / 365.25);
  const mo = Math.floor((days - y * 365.25) / 30.4375);
  if (y === 0) return mo === 0 ? '0' : `${mo}mo`;
  return mo === 0 ? `${y}y` : `${y}y ${mo}mo`;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const row = (cells) => `| ${cells.join(' | ')} |`;
const table = (head, rows) =>
  [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');

function headerBlock(profile, meta) {
  const b = meta.input;
  const lines = [
    `**Born:** ${b.date}${meta.timeUnknown ? ' (time unknown — noon cast)' : ` ${b.time}`} · ${b.place ?? `${b.lat}, ${b.lon}`} (${b.lat}, ${b.lon}) · ${b.tz} (UTC${meta.offsetMinutes >= 0 ? '+' : ''}${meta.offsetMinutes / 60})`,
    `**UT:** ${meta.utc} · **Ayanamsa:** ${meta.ayanamsa.name} ${dms(meta.ayanamsa.deg)} · **Houses:** whole-sign · **Node:** mean`,
  ];
  if (meta.caveats.length) lines.push(`**Caveats:** ${meta.caveats.join('; ')}`);
  return lines.join('\n');
}

// ————————————————————————————— VEDIC —————————————————————————————

export function vedicMd(cast, profile = {}, { vargas: vargaFilter = null } = {}) {
  const { vedic: vc, nakshatras: nk, panchanga: pan, meta } = cast;
  const out = [];
  out.push(`# Vedic chart — ${profile.name ?? 'ad-hoc cast'}`);
  out.push('');
  out.push(headerBlock(profile, meta));
  out.push('');

  // — angles —
  out.push('## Lagna & angles');
  out.push('');
  const ascN = nk.asc;
  out.push(table(
    ['Point', 'Sign', 'Degree', 'Nakshatra', 'Pada'],
    [
      ['Ascendant', vc.ascendant.signName, dms(vc.ascendant.degInSign), ascN.name, String(ascN.pada)],
      ['MC', vc.mc.signName, dms(vc.mc.degInSign), '—', '—'],
    ],
  ));
  out.push('');

  // — planets —
  out.push('## Planets (D1, sidereal)');
  out.push('');
  const prow = (key, p) => {
    const n = nk[key];
    return [
      PLANET_LABELS[key], p.signName, dms(p.degInSign), meta.timeUnknown ? '—' : String(p.house),
      n.name, String(n.pada), n.lord, n.padaLord, n.deity, n.purushartha, n.gana,
      p.retro ? 'R' : 'D',
    ];
  };
  const bodies = [
    ...vc.planets.filter((p) => CLASSICAL.includes(p.body)).map((p) => [p.body, p]),
    ['rahu', vc.nodes.rahu], ['ketu', vc.nodes.ketu],
    ...vc.planets.filter((p) => OUTERS.includes(p.body)).map((p) => [p.body, p]),
  ];
  out.push(table(
    ['Planet', 'Sign', 'Degree', 'House', 'Nakshatra', 'Pada', 'Nak. lord', 'Pada lord', 'Deity', 'Purushartha', 'Gana', 'Motion'],
    bodies.map(([k, p]) => prow(k, p)),
  ));
  out.push('');
  out.push('*Outers (Uranus/Neptune/Pluto) ride along for reference — classical technique layers never count them.*');
  out.push('');

  // — houses —
  if (!meta.timeUnknown) {
    out.push('## Whole-sign houses');
    out.push('');
    const occ = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, []]));
    for (const p of vc.planets) occ[p.house].push(PLANET_LABELS[p.body]);
    occ[vc.nodes.rahu.house].push('Rahu');
    occ[vc.nodes.ketu.house].push('Ketu');
    out.push(table(
      ['House', 'Sign', 'Occupants'],
      vc.houses.map((h) => [String(h.house), h.signName, occ[h.house].join(', ') || '—']),
    ));
    out.push('');
  }

  // — panchanga —
  out.push('## Panchanga');
  out.push('');
  const p5 = [];
  if (pan.vara) p5.push(['Vara', `${pan.vara.name} (${pan.vara.lord})`]);
  p5.push(['Tithi', `${pan.tithi.label} (${pan.tithi.lord} · ${pan.tithi.percentLeft.toFixed(1)}% left)`]);
  p5.push(['Nakshatra', `${nk.moon.name} pada ${nk.moon.pada} (${nk.moon.lord} · ${(100 - nk.moon.fractionTraversed * 100).toFixed(1)}% left)`]);
  p5.push(['Yoga', `${pan.yoga.name} (${pan.yoga.lord} · ${pan.yoga.percentLeft.toFixed(1)}% left)`]);
  p5.push(['Karana', `${pan.karana.name} (${pan.karana.deity}${pan.karana.lord ? ' · ' + pan.karana.lord : ''} · ${pan.karana.percentLeft.toFixed(1)}% left)`]);
  if (pan.hora) p5.push(['Hora', `${pan.hora.lord} (hour ${pan.hora.index} from sunrise ${pan.hora.sunrise}; sunset ${pan.hora.sunset})`]);
  out.push(table(['Limb', 'Value'], p5));
  out.push('');

  // — vargas: the signs grid (optionally filtered to a selection) —
  out.push('## Varga signs');
  out.push('');
  const VKEYS = ['asc', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu'];
  const vnames = Object.keys(vc.vargas).filter((dn) => !vargaFilter || vargaFilter.includes(dn));
  if (vargaFilter) out.push(`*Selected charts: ${vnames.join(', ')}*\n`);
  out.push(table(
    ['Chart', ...VKEYS.map((k) => (k === 'asc' ? 'AS' : PLANET_LABELS[k].slice(0, 2).toUpperCase()))],
    vnames.map((dn) => [dn, ...VKEYS.map((k) => vc.vargas[dn][k].signName.slice(0, 3))]),
  ));
  out.push('');
  if (meta.timeUnknown) out.push('*Noon cast: the Ascendant column and every varga are hour-sensitive — treat as unreliable.*\n');

  // — varga houses (1st from each varga's own asc) —
  if (!meta.timeUnknown) {
    out.push('## Varga houses (house from each varga lagna)');
    out.push('');
    out.push(table(
      ['Chart', ...VKEYS.slice(1).map((k) => PLANET_LABELS[k].slice(0, 2).toUpperCase())],
      vnames.map((dn) => {
        const v = vc.vargas[dn];
        return [dn, ...VKEYS.slice(1).map((k) => String(((v[k].sign - v.asc.sign + 12) % 12) + 1))];
      }),
    ));
    out.push('');
  }

  // — dashas —
  out.push('## Vimshottari dasha');
  out.push('');
  out.push(`Balance at birth: **${vc.dashaBalance.lord} ${vc.dashaBalance.years.toFixed(2)}y** (Moon in ${vc.dashaBalance.nakshatra.name}, ${(vc.dashaBalance.elapsedFraction * 100).toFixed(1)}% traversed). 365.25-day years (astro-seek convention).`);
  out.push('');
  const now = new Date();
  const curMD = vc.dashas.find((m) => now >= m.start && now < m.end);
  const curAD = curMD?.antardashas.find((a) => now >= a.start && now < a.end);
  if (curMD) out.push(`**Now:** ${curMD.lord} MD (${dt(curMD.start)} → ${dt(curMD.end)})${curAD ? ` / ${curAD.lord} AD (${dt(curAD.start)} → ${dt(curAD.end)})` : ''}`);
  out.push('');
  out.push('### Mahadashas');
  out.push('');
  const birthMs = +new Date(cast.meta.utc);
  out.push(table(
    ['Lord', 'Age', 'Years', 'Start', 'End'],
    vc.dashas.map((m) => [m.lord, ageAt(m.start, birthMs), m.years.toFixed(1), dt(m.start), dt(m.end)]),
  ));
  out.push('');
  out.push('*Nominal clock: the first mahadasha starts before birth (Age "birth") — the native only lives its balance from the birth instant on.*');
  out.push('');
  out.push('### Antardashas (full clock)');
  out.push('');
  for (const m of vc.dashas) {
    out.push(`**${m.lord} MD** (${dt(m.start)} → ${dt(m.end)}): ` +
      m.antardashas.map((a) => `${a.lord} ${dt(a.start)}`).join(' · '));
  }
  out.push('');

  // — karakas —
  out.push('## Chara karakas (8-scheme, BPHS order; Rahu counted 30°−deg)');
  out.push('');
  out.push(table(
    ['Karaka', 'Body', 'Deg in sign', 'Ranked deg'],
    vc.karakas.ranked.map((r) => [`${r.karaka} (${r.karakaName})`, PLANET_LABELS[r.body], dms(r.degInSign), dms(r.rankDeg)]),
  ));
  out.push('');
  out.push(`Karakamsa (AK's navamsa seat): **${vc.karakamsa.signName}**`);
  out.push('');

  if (!meta.timeUnknown) {
    // — arudhas —
    out.push('## Arudha lagnas (A1 = AL, A12 = UL)');
    out.push('');
    out.push(table(
      ['Pada', 'Base sign', 'Lord', 'Arudha sign', 'House from lagna'],
      Array.from({ length: 12 }, (_, i) => vc.arudhas[`A${i + 1}`]).map((a, i) => [
        `A${i + 1}${i === 0 ? ' (AL)' : i === 11 ? ' (UL)' : ''}`,
        a.baseSignName, cap(a.lord), a.signName, String(a.houseFromLagna),
      ]),
    ));
    out.push('');

    // — upapada —
    const up = vc.upapada;
    out.push('## Upapada (UL) detail');
    out.push('');
    out.push(`UL **${up.ul.signName}** (house ${up.ul.houseFromLagna} from lagna) · occupants: ${up.occupants.map((b) => PLANET_LABELS[b]).join(', ') || 'none'} · lord ${PLANET_LABELS[up.lord.body]} → ${up.lord.signName} H${up.lord.house}${up.lord.retro ? ' R' : ''}`);
    out.push(`2nd from UL **${up.second.signName}** (sustenance) · occupants: ${up.second.occupants.map((b) => PLANET_LABELS[b]).join(', ') || 'none'} · lord ${PLANET_LABELS[up.second.lord.body]} → ${up.second.lord.signName} H${up.second.lord.house}`);
    out.push('');

    // — ashtakavarga (sign-indexed, 0 = Aries; house column derived from lagna) —
    out.push('## Ashtakavarga (bindus by sign)');
    out.push('');
    const av = vc.ashtakavarga;
    out.push(table(
      ['Sign', 'House', ...CLASSICAL.filter((k) => k !== 'mercury' || true).map((k) => PLANET_LABELS[k].slice(0, 2)), 'SAV'],
      SIGNS.map((s, i) => [
        s,
        String(((i - vc.ascSign + 12) % 12) + 1),
        ...CLASSICAL.map((k) => String(av.bav[k][i])),
        String(av.sav[i]),
      ]),
    ));
    out.push('');
    const yg = vc.yogi.point;
    out.push(`Yogi point: **${yg.signName} ${dms(yg.degInSign)}** (${yg.nakshatra.name}) · yogi planet: ${cap(vc.yogi.planet ?? '—')} · sahayogi: ${cap(vc.yogi.duplicate ?? '—')}`);
    const av2 = vc.yogi.avayogi;
    if (av2) out.push(`Avayogi: **${av2.point.signName} ${dms(av2.point.degInSign)}** (${av2.point.nakshatra.name}) · avayogi planet: ${cap(av2.planet)}`);
    out.push('');

    // — strength (dignity · vargottama · combustion) —
    if (cast.jaimini?.strength) {
      out.push('## Strength (dignity · vargottama · combustion)');
      out.push('');
      out.push(table(
        ['Planet', 'Sign', 'Dignity', 'Vargottama', 'Combustion'],
        cast.jaimini.strength.bodies.map((b) => [
          PLANET_LABELS[b.body], b.signName,
          `${b.dignity.state}${b.dignity.detail ? ` (${b.dignity.detail})` : ''}`,
          b.vargottama ? '★ vargottama' : '—',
          b.combust ? (b.combust.is ? `COMBUST (${b.combust.separation.toFixed(1)}° < ${b.combust.orb}° orb)` : `no (${b.combust.separation.toFixed(1)}°)`) : '—',
        ]),
      ));
      if (cast.jaimini.strength.ascVargottama) out.push('\nThe lagna itself is vargottama.');
      out.push('');
      out.push('*Combustion uses the classical orbs; schools vary. Dignity is natural (naisargika) — compound temporal friendship not computed.*');
      out.push('');
    }

    // — Chara Dasha (K.N. Rao standard) —
    const cd = cast.jaimini?.charaDasha;
    if (cd && !cd.note) {
      out.push('## Chara Dasha (K.N. Rao standard)');
      out.push('');
      out.push(`*${cd.standard}.* Sequence runs **${cd.direction}**.`);
      out.push('');
      out.push(table(
        ['Sign', 'Years', 'Start', 'End', 'Note'],
        cd.majors.map((m) => [
          m.signName, String(m.years), dt(m.start), dt(m.end),
          m.alternative ? `dual-lord: alternative ${m.alternative.years}y (${cap(m.alternative.lord)})` : '',
        ]),
      ));
      out.push('');
      if (cd.current) {
        out.push(`**Now:** ${cd.current.major.signName} major (${dt(cd.current.major.start)} → ${dt(cd.current.major.end)})${cd.current.sub ? ` · ${cd.current.sub.signName} sub (${dt(cd.current.sub.start)} → ${dt(cd.current.sub.end)})` : ''}`);
        const curM = cd.majors.find((m) => m.signName === cd.current.major.signName);
        if (curM) out.push(`Sub-sequence of the running major: ${curM.subs.map((s) => `${s.signName} ${dt(s.start)}`).join(' · ')}`);
        out.push('');
      }
    }

    // — rashi drishti —
    if (cast.jaimini?.rashiDrishti) {
      out.push('## Rashi drishti (Jaimini sign aspects)');
      out.push('');
      out.push(cast.jaimini.rashiDrishti.map((r) => `${r.sign} ← ${r.aspects.join(', ')}`).join('  \n'));
      out.push('');
    }

    // — aspects —
    const aspLine = (a) => `${PLANET_LABELS[a.a] ?? cap(a.a)} ${a.type} ${PLANET_LABELS[a.b] ?? cap(a.b)} (orb ${a.orb.toFixed(1)}°${a.applying ? ', applying' : ', separating'})`;
    out.push('## Aspects (main)');
    out.push('');
    out.push((vc.aspects.main ?? []).map(aspLine).join(' · ') || '—');
    out.push('');
    out.push('## Aspects (angles + nodes)');
    out.push('');
    out.push((vc.aspects.other ?? []).map(aspLine).join(' · ') || '—');
    out.push('');
  }

  return out.join('\n');
}

// ————————————————————————————— HUMAN DESIGN —————————————————————————————

/**
 * The Vimshottari dasha timeline on its own — the full mahadasha + antardasha
 * sequence with the native's age at each period's start. Its own file, for
 * handing to a client or keeping. (The deeper pratyantardasha/sookshma levels
 * stay in the interactive view; this is the readable standard depth.)
 */
export function dashasMd(cast, profile = {}) {
  const vc = cast.vedic;
  const b = cast.meta.input;
  const birthMs = +new Date(cast.meta.utc);
  const now = new Date();
  const out = [
    `# Vimshottari Dasha — ${profile.name ?? ''}`.trim(),
    '',
    `**Born:** ${b.date}${b.time ? ` ${b.time}` : ' (time unknown)'}${b.place ? ` · ${b.place}` : ''}`,
    `**Balance at birth:** ${vc.dashaBalance.lord} ${vc.dashaBalance.years.toFixed(2)}y — Moon in ${vc.dashaBalance.nakshatra.name}`,
    `**Generated:** ${dt(now)} · Chart Desk · 365.25-day years · Age = the native's age when the period begins · ● = running now`,
    '',
    '| Period | Age | Span | Start | End |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const m of vc.dashas) {
    // Vimshottari's first mahadasha nominally begins before birth — you only live
    // its balance. Never print a pre-birth date: skip periods that end before birth,
    // and clamp a straddling period's start to the birth instant.
    if (+new Date(m.end) <= birthMs) continue;
    const mStart = Math.max(+new Date(m.start), birthMs);
    const cur = now >= mStart && now < new Date(m.end);
    out.push(`| **${m.lord}**${cur ? ' ●' : ''} | ${ageAt(mStart, birthMs)} | ${spanOf(mStart, m.end)} | ${dt(mStart)} | ${dt(m.end)} |`);
    for (const a of m.antardashas) {
      if (+new Date(a.end) <= birthMs) continue;
      const aStart = Math.max(+new Date(a.start), birthMs);
      const ac = now >= aStart && now < new Date(a.end);
      out.push(`| ${m.lord} / ${a.lord}${ac ? ' ●' : ''} | ${ageAt(aStart, birthMs)} | ${spanOf(aStart, a.end)} | ${dt(aStart)} | ${dt(a.end)} |`);
    }
  }
  out.push('');
  return out.join('\n');
}

export function hdMd(cast, profile = {}) {
  const { hd, meta } = cast;
  const out = [`# Human Design chart — ${profile.name ?? 'ad-hoc cast'}`, ''];
  out.push(headerBlock(profile, meta));
  out.push('');
  if (!hd) {
    out.push('**No chart — birth time unknown.** The design instant (Sun −88°) needs the hour; the system degrades honestly rather than guessing.');
    return out.join('\n');
  }
  out.push(`**Design instant (Sun −88°):** ${hd.input.designUtc}`);
  out.push('');
  out.push(table(
    ['Property', 'Value'],
    [
      ['Type', hd.type],
      ['Strategy', hd.strategy],
      ['Authority', hd.authority],
      ['Profile', `${hd.profile.label} (${hd.profile.names}) — ${hd.profile.angle} angle`],
      ['Definition', hd.definition],
      ['Incarnation Cross', hd.incarnationCross.label],
      ['Signature', hd.signature],
      ['Not-self theme', hd.notSelfTheme],
    ],
  ));
  out.push('');
  // — the four Variables, from the colors (PHS): 1–3 left · 4–6 right —
  const P = hd.personality, D = hd.design;
  const byLabel = (c, l) => c.find((a) => a.label === l);
  const VARS = [
    ['Determination (digestion)', byLabel(D, 'Sun'), 'Design Sun'],
    ['Environment', byLabel(D, 'North Node'), 'Design Node'],
    ['Perspective (view)', byLabel(P, 'North Node'), 'Personality Node'],
    ['Motivation', byLabel(P, 'Sun'), 'Personality Sun'],
  ].filter(([, a]) => a);
  if (VARS.length) {
    out.push('## Variables (the four arrows)');
    out.push('');
    out.push(table(
      ['Variable', 'Arrow', 'Source', 'Color'],
      VARS.map(([name, a, src]) => [name, a.color <= 3 ? '← left' : 'right →', src, String(a.color)]),
    ));
    out.push('');
    out.push('*PHS / Rave Psychology: the arrow follows the source activation’s color — 1–3 point left, 4–6 right.*');
    out.push('');
  }

  out.push('## Activations');
  out.push('');
  out.push(table(
    ['Body', 'Personality', 'P color/tone', 'Design', 'D color/tone'],
    P.map((a, i) => [a.label, `${a.gate}.${a.line}`, `${a.color}/${a.tone}`, `${D[i].gate}.${D[i].line}`, `${D[i].color}/${D[i].tone}`]),
  ));
  out.push('');
  out.push(`**Defined gates:** ${hd.definedGates.join(', ')}`);
  out.push('');
  out.push('## Channels');
  out.push('');
  for (const ch of hd.channels) out.push(`- **${ch.gates[0]}–${ch.gates[1]}** ${ch.name} (${ch.centers[0]} ↔ ${ch.centers[1]})`);
  if (!hd.channels.length) out.push('- none');
  out.push('');
  out.push(`**Defined centers:** ${hd.centers.defined.join(', ') || 'none'}  \n**Open centers:** ${hd.centers.open.join(', ') || 'none'}`);
  out.push('');
  out.push('*Feature named descriptively — "Human Design" and "BodyGraph" are trademarks of their rights holders; no affiliation.*');
  return out.join('\n');
}

// ————————————————————————————— MATRIX —————————————————————————————

export function matrixMd(cast, profile = {}) {
  const { matrix: mx, meta } = cast;
  const arcName = (n) => `${n}`;
  const out = [`# Matrix of Destiny chart — ${profile.name ?? 'ad-hoc cast'}`, ''];
  out.push(headerBlock(profile, meta));
  out.push('');
  out.push('*Birth-date arithmetic only — the hour plays no part. Arcana numbering: 22 = The Fool.*');
  out.push('');
  const P = mx.points;
  out.push('## Core points (the octagram)');
  out.push('');
  const label = (n) => `**${n}**`;
  out.push(table(
    ['Point', 'Arcanum', 'Position / age'],
    [
      ['A (day)', label(P.A), 'left · age 0'],
      ['B (month)', label(P.B), 'top · age 20'],
      ['C (year)', label(P.C), 'right · age 40'],
      ['D (A+B+C)', label(P.D), 'bottom · age 60'],
      ['E (center)', label(P.E), 'comfort zone / soul core'],
      ['NW (A+B)', label(P.NW), 'age 10'],
      ['NE (B+C)', label(P.NE), 'age 30'],
      ['SE (C+D)', label(P.SE), 'age 50'],
      ['SW (D+A)', label(P.SW), 'age 70'],
    ],
  ));
  out.push('');
  out.push('## Inner chains');
  out.push('');
  const C = mx.chains;
  out.push(table(
    ['Axis', 'p3 (vertex-side)', 'p2 (square edge)', 'p4 (center-side)'],
    [
      ['Left (A)', String(C.left.p3), String(C.left.p2), String(C.left.p4)],
      ['Top (B)', String(C.top.p3), String(C.top.p2), String(C.top.p4)],
      ['Right (C)', String(C.right.p3), String(C.right.p2), '—'],
      ['Bottom (D)', String(C.bottom.p3), String(C.bottom.p2), '—'],
    ],
  ));
  out.push('');
  out.push(`**Money chain:** k1 ${mx.money.k1} · k2 ${mx.money.k2} ($ on k2) · **Love–money chord:** ${mx.loveMoneyLine.a} — ♥ ${mx.loveMoneyLine.mid} — ${mx.loveMoneyLine.b}`);
  out.push('');
  out.push('## Generation lines');
  out.push('');
  out.push(`Paternal (male) diagonal NW–SE: ${mx.generation.male.triad.join(' · ')}  \nMaternal (female) diagonal NE–SW: ${mx.generation.female.triad.join(' · ')}`);
  out.push('');
  out.push('## Corner chains (karmic inheritance hugging each diagonal corner)');
  out.push('');
  out.push(table(
    ['Corner', 'Outer', 'Inner'],
    Object.entries(mx.corners).map(([k, c]) => [k, String(c.outer), String(c.inner)]),
  ));
  out.push('');
  out.push('## Chakra table (physics / energy / emotions)');
  out.push('');
  out.push(table(
    ['Chakra', 'Sphere', 'Physics', 'Energy', 'Emotions'],
    [
      ...mx.chakras.map((c) => [c.name, c.label, String(c.physics), String(c.energy), String(c.emotions)]),
      ['**Result**', 'Common energy-zone', String(mx.result.physics), String(mx.result.energy), String(mx.result.emotions)],
    ],
  ));
  out.push('');
  out.push('## Synthesis');
  out.push('');
  const S = mx.synthesis;
  out.push(`Soul: sky ${S.soul.sky} + earth ${S.soul.earth} → **${S.soul.result}** · Socialization: m ${S.socialization.m} + f ${S.socialization.f} → **${S.socialization.result}** · Spiritual: **${S.spiritual}**`);
  out.push('');
  out.push('## Age ring: which arcanum runs when');
  out.push('');
  out.push('Each arcanum holds until the next one opens, so every date from birth to 80 has one; the ages are the ring’s printed labels. Bold rows are the decade corners and the 5-year points. ● = running now.');
  out.push('');
  const today = dt(new Date());
  const ringRow = (p, big) => {
    const b = (s) => (big ? `**${s}**` : s);
    const cur = p.start <= today && today < p.end;
    return [`${b(`${p.label}y`)}${cur ? ' ●' : ''}`, p.start, p.end, b(p.value), b(ARCANA[p.value].name)];
  };
  out.push(table(
    ['Ages', 'From', 'To', 'Arc.', 'Name'],
    mx.ageRing.flatMap((s) => [ringRow(s.corner, true), ...s.points.map((p) => ringRow(p, p.bold))]),
  ));
  out.push('');
  out.push('## Arcana key (numbers present in this chart)');
  out.push('');
  const used = new Set([
    ...Object.values(P), ...Object.values(C.left), ...Object.values(C.top),
    ...Object.values(C.right), ...Object.values(C.bottom),
    mx.money.k1, mx.money.k2, mx.loveMoneyLine.a, mx.loveMoneyLine.mid, mx.loveMoneyLine.b,
    ...Object.values(mx.corners).flatMap((c) => [c.outer, c.inner]),
    ...mx.chakras.flatMap((c) => [c.physics, c.energy, c.emotions]),
  ]);
  for (const n of [...used].sort((a, b) => a - b))
    out.push(`- **${n}** ${ARCANA[n].name} — ${ARCANA[n].essence}`);
  return out.join('\n');
}

// ————————————————————————————— THE ATLAS PACK —————————————————————————————

export function atlasMd(cast, profile = {}) {
  const name = profile.name ?? 'ad-hoc cast';
  const head = [
    `# Atlas pack — ${name}`,
    '',
    headerBlock(profile, cast.meta),
    '',
    profile.category ? `**Category:** ${profile.category}` : '',
    profile.notes ? `**Notes:** ${profile.notes}` : '',
    '',
    'Everything in one file: Vedic (D1–D60, panchanga, dashas, karakas, arudhas, ashtakavarga), Human Design, and Matrix of Destiny.',
    '',
    '---',
    '',
  ].filter((l) => l !== '');
  return [
    head.join('\n'),
    vedicMd(cast, profile), '\n---\n',
    hdMd(cast, profile), '\n---\n',
    matrixMd(cast, profile),
  ].join('\n');
}
