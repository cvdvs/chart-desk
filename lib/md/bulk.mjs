// ============================================================
// Bulk export — many people at once, two different shapes.
//
//   archiveMd()   one master .md, every chosen section per person.
//                 For keeping, handing to an agent, or reading.
//
//   researchRows() one ROW per person, chosen columns. For pattern
//                 work: sixteen full atlases is 10,000 lines and
//                 hides the pattern; sixteen rows shows it.
//
// Both take the same cohort filter, and the cohort can be narrowed
// by PLACEMENT, not just by category and tag — which is the whole
// point for nakshatra-cohort research (gather every native with
// Moon in Magha, then look at what they share).
// ============================================================
import { vedicMd, hdMd, matrixMd, atlasMd, dashasMd } from './format.mjs';

export const SECTIONS = {
  vedic: { label: 'Vedic (positions, vargas, dashas, strength)', fn: vedicMd },
  dashas: { label: 'Vimshottari dasha timeline (with ages)', fn: dashasMd },
  'human-design': { label: 'Human Design', fn: hdMd },
  matrix: { label: 'Matrix of Destiny', fn: matrixMd },
  atlas: { label: 'Everything (the full intake pack)', fn: atlasMd },
};

const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu', 'uranus', 'neptune', 'pluto'];
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

/** Every body in a cast keyed by name, nodes folded in with the planets. */
function bodiesOf(cast) {
  const out = {};
  for (const p of cast.vedic.planets) out[p.body] = p;
  const n = cast.vedic.nodes ?? {};
  if (n.rahu) out.rahu = n.rahu;
  if (n.ketu) out.ketu = n.ketu;
  out.lagna = { ...cast.vedic.ascendant, body: 'lagna' };
  out.asc = out.lagna;
  return out;
}

/**
 * One dotted field of a chart. Deliberately small and predictable so it can
 * be typed into a URL or a UI box without documentation:
 *
 *   moon.nakshatra   moon.sign   moon.pada   moon.house   moon.degree
 *   moon.lord        — the nakshatra's ruling graha
 *   moon.dignity     venus.combust   venus.vargottama
 *   lagna.sign       lagna.nakshatra
 *   d9.venus.sign    — any implemented varga, sign only (vargas carry no degree)
 *   ak  amk  dk      — the chara karaka BODY
 *   karakamsa        — the karakamsa sign
 */
export function fieldOf(cast, path) {
  const parts = String(path).trim().toLowerCase().split('.');
  if (!parts[0]) return null;

  if (parts[0] === 'karakamsa') return cast.vedic.karakamsa?.signName ?? null;
  if (['ak', 'amk', 'bk', 'mk', 'pik', 'gk', 'dk', 'pk'].includes(parts[0])) {
    const k = cast.vedic.karakas?.ranked?.find((r) => r.karaka.toLowerCase() === parts[0]);
    return k ? cap(k.body) : null;
  }

  // an explicit varga prefix: d9.venus.sign — SIGN ONLY. A varga carries no
  // degree, so no nakshatra or pada exists; asking for one used to silently
  // return the sign under a nakshatra/degree heading (mislabeled data). A
  // request for anything but the sign returns null (an em-dash in the table).
  if (/^d\d+$/.test(parts[0])) {
    const dn = parts[0].toUpperCase();
    const v = cast.vedic.vargas?.[dn];
    if (!v) return null;
    const attr = parts[2] ?? 'sign';
    if (attr !== 'sign') return null;
    const key = parts[1] === 'lagna' || parts[1] === 'asc' ? 'asc' : parts[1];
    return v[key]?.signName ?? null;
  }

  const b = bodiesOf(cast)[parts[0]];
  if (!b) return null;
  const attr = parts[1] ?? 'sign';
  switch (attr) {
    case 'sign': return b.signName ?? null;
    case 'nakshatra': return b.nakshatra?.name ?? null;
    case 'pada': return b.nakshatra?.pada ?? null;
    case 'lord': return b.nakshatra?.lord ?? null;
    case 'house': return b.house ?? null;
    case 'degree': return b.degInSign != null ? fmtDeg(b.degInSign) : null;
    case 'retro': return b.retro ? 'R' : '';
    case 'dignity': case 'combust': case 'vargottama': {
      const st = cast.jaimini?.strength?.bodies?.find((x) => x.body === parts[0]);
      if (!st) return null;
      if (attr === 'dignity') return st.dignity?.state ?? null;
      if (attr === 'vargottama') return st.vargottama ? 'yes' : '';
      return st.combust?.is ? 'combust' : '';
    }
    default: return null;
  }
}

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const fmtDeg = (d) => `${Math.floor(d)}°${String(Math.floor((d % 1) * 60)).padStart(2, '0')}′`;

/**
 * `where` — comma-separated `field=value` terms, ANDed, case-insensitive.
 * A value may list alternatives with `|`:
 *
 *   moon.nakshatra=Magha
 *   moon.lord=Ketu,moon.sign=Leo|Aries|Sagittarius
 *   d9.venus.sign=Pisces,venus.dignity=debilitated
 */
export function parseWhere(str) {
  if (!str) return [];
  return String(str).split(',').map((t) => t.trim()).filter(Boolean).map((term) => {
    const i = term.indexOf('=');
    if (i < 0) throw new Error(`bad where term '${term}': want field=value`);
    const field = term.slice(0, i).trim();
    const values = term.slice(i + 1).split('|').map((v) => v.trim().toLowerCase()).filter(Boolean);
    if (!field || !values.length) throw new Error(`bad where term '${term}': want field=value`);
    return { field, values };
  });
}

export function matchesWhere(cast, terms) {
  return terms.every(({ field, values }) => {
    const got = fieldOf(cast, field);
    if (got === null || got === undefined) return false;
    return values.includes(String(got).toLowerCase());
  });
}

// ————— the master archive —————

export function archiveMd(rows, { sections = ['vedic'], vargas = null, scope = '', skipped = [] } = {}) {
  const picked = sections.filter((s) => SECTIONS[s]);
  if (!picked.length) throw new Error('bad sections: none recognised');
  const stamp = new Date().toISOString().slice(0, 10);

  const head = [
    `# Chart Desk archive — ${rows.length} ${rows.length === 1 ? 'person' : 'people'}`,
    '',
    scope ? `**Scope:** ${scope}` : null,
    skipped.length ? `**Not cast (skipped):** ${skipped.map((x) => `${x.name} — ${x.reason}`).join(' · ')}` : null,
    `**Sections:** ${picked.map((s) => SECTIONS[s].label).join(' · ')}`,
    vargas?.length ? `**Vargas:** ${vargas.join(' ')}` : null,
    `**Generated:** ${stamp} · computed locally, nothing left the device`,
    '',
    '> Every layer here is a computed signal for a reading method, never a verdict.',
    '> Where a birth time is unknown the cast is a noon cast and the hour-sensitive',
    '> layers are withheld rather than guessed — see each person\'s caveats.',
    '',
    '## Contents',
    '',
    ...rows.map((r, i) => `${i + 1}. **${r.profile.name}** — ${r.profile.birth.date}${r.profile.birth.timeUnknown ? ' (time unknown)' : ` ${r.profile.birth.time}`} · ${r.profile.birth.place ?? ''}`),
    '',
  ].filter((l) => l !== null).join('\n');

  const bodies = rows.map((r) => {
    const parts = [`\n---\n\n# ${mdHeading(r.profile.name)}\n`];
    for (const s of picked) {
      const fn = SECTIONS[s].fn;
      try {
        const md = s === 'vedic' ? fn(r.cast, r.profile, { vargas }) : fn(r.cast, r.profile);
        // demote one level so each person's sections nest under their name
        parts.push(String(md).replace(/^(#{1,5}) /gm, '#$1 ').trim(), '');
      } catch (e) {
        parts.push(`> _${SECTIONS[s].label} unavailable: ${e.message}_`, '');
      }
    }
    return parts.join('\n');
  });

  return `${head}${bodies.join('\n')}\n`;
}

// ————— the research table —————

export const DEFAULT_COLUMNS = [
  'lagna.sign', 'lagna.nakshatra', 'moon.sign', 'moon.nakshatra', 'moon.pada',
  'moon.lord', 'sun.sign', 'sun.nakshatra', 'ak', 'karakamsa',
];

// A column is hour-sensitive if its value moves with the birth time: the
// ascendant and everything derived from it (houses, varga lagnas) and the pada
// (finest-grained, the first thing to flip). For a noon cast these are fiction,
// so a research table must not print them as fact or tally them across a cohort.
function isHourSensitive(col) {
  const c = String(col).toLowerCase();
  return /(^|\.)(lagna|asc)(\.|$)/.test(c) || /\.house$/.test(c) || /\.pada$/.test(c)
    || /^d\d+\.(lagna|asc)\b/.test(c);
}

export function researchRows(rows, { columns = DEFAULT_COLUMNS } = {}) {
  const cols = columns.filter(Boolean);
  const sensitive = cols.map(isHourSensitive);
  return {
    columns: cols,
    sensitive,
    rows: rows.map((r) => {
      const timeUnknown = !!r.profile.birth.timeUnknown;
      return {
        name: r.profile.name,
        slug: r.profile.slug,
        category: r.profile.category,
        tags: (r.profile.tags ?? []).join(' '),
        birth: r.profile.birth.date,
        timeUnknown,
        values: cols.map((c, i) => {
          // withhold hour-sensitive cells for noon casts rather than fabricate them
          if (timeUnknown && sensitive[i]) return null;
          const v = fieldOf(r.cast, c);
          return v === null || v === undefined ? '' : String(v);
        }),
      };
    }),
  };
}

// A cell beginning = + - @ (or a tab/CR that a spreadsheet trims to reveal one)
// is executed as a FORMULA by Excel/Numbers, and RFC-4180 quoting does not stop
// it. Only profile name/tags are user-authored so the risk is low here, but the
// guard is one character: prefix a leading apostrophe, which every spreadsheet
// reads as "this is text". Then the ordinary delimiter/quote escaping.
const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// A '|' in a table cell shifts every column after it; a newline or a leading '#'
// in a name injects stray rows/headings into the archive. Names are user-authored
// and rarely contain these, but the '|' case is invisible in the output, so both
// the table cells and the archive heading are sanitized rather than trusted.
const mdCell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const mdHeading = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/^#+/, '').trim();

export function researchCsv(table) {
  const head = ['name', 'birth', 'category', 'tags', 'time_unknown', ...table.columns];
  const lines = [head.map(csvCell).join(',')];
  for (const r of table.rows) {
    // a withheld hour-sensitive cell (null) becomes empty, not the string 'null'
    const vals = r.values.map((v) => (v === null ? '' : v));
    lines.push([r.name, r.birth, r.category, r.tags, r.timeUnknown ? 'yes' : '', ...vals].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function researchMd(table, { scope = '', tally = true, skipped = [] } = {}) {
  const head = ['Name', 'Birth', ...table.columns];
  const sep = head.map(() => '---');
  // null = withheld (hour-sensitive on a noon cast) → '·'; '' = no data → '—'
  const cell = (v) => (v === null ? '·' : (v || '—'));
  const body = table.rows.map((r) => [
    mdCell(r.name) + (r.timeUnknown ? ' ⚠' : ''), r.birth, ...r.values.map((v) => mdCell(cell(v))),
  ]);
  const anyUnknown = table.rows.some((r) => r.timeUnknown);
  const anyWithheld = table.rows.some((r, ri) => r.values.some((v, ci) => v === null));
  const out = [
    `# Research table — ${table.rows.length} ${table.rows.length === 1 ? 'native' : 'natives'}`,
    '',
    scope ? `**Scope:** ${scope}` : null,
    skipped.length ? `**Not cast (skipped):** ${skipped.map((x) => `${x.name} — ${x.reason}`).join(' · ')}` : null,
    `**Generated:** ${new Date().toISOString().slice(0, 10)}`,
    anyUnknown
      ? '\n⚠ = birth time unknown (noon cast). For these rows the **ascendant, houses, varga lagnas and pada** are hour-sensitive and cannot be trusted — they are shown as **·** and left out of the distribution. Sign and nakshatra of the planets are usable (the Moon within a few degrees).'
      : null,
    '',
    `| ${head.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ].filter((l) => l !== null);

  // A count per distinct value is what turns a list into a finding — it is the
  // first thing you want when testing whether a cohort actually shares something.
  // Withheld cells (·) are excluded so a noon cast cannot skew the tally.
  if (tally) {
    out.push('', '## Distribution', '');
    table.columns.forEach((c, i) => {
      const counts = new Map();
      let withheld = 0;
      for (const r of table.rows) {
        const v = r.values[i];
        if (v === null) { withheld += 1; continue; }
        const key = v || '—';
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const sorted = [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
      const tail = withheld ? ` _(+${withheld} time-unknown, not counted)_` : '';
      out.push(`**${c}** — ${sorted.map(([v, n]) => `${v} ×${n}`).join(' · ') || '—'}${tail}`);
    });
  }
  out.push('');
  return out.join('\n');
}

export { BODIES, SIGNS };
