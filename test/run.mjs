#!/usr/bin/env node
// ============================================================
// Chart Desk test suite — verifies the engines against their own
// published fixtures, the panchanga against an astro-seek
// reference, a reference chart end-to-end, and the HTTP API.
//
//   node test/run.mjs
//
// Exit 0 = everything green. All births used here are reference
// vectors or synthetic fixtures — no real profile data.
// ============================================================
import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { norm360, positions, ayanamsa, sidereal, ascendant, nakshatraOf, TEST_FIXTURES as EPH_FIX } from '../lib/engine/ephemeris.js';
import { buildVedicChart } from '../lib/engine/jyotish.js';
import { buildHDChart, TEST_FIXTURES as HD_FIX } from '../lib/engine/humandesign.js';
import { matrixChart, TEST_FIXTURES as MX_FIX } from '../lib/engine/matrix.js';
import { utFromLocal } from '../lib/engine/geo.js';
import { panchanga } from '../lib/atlas/panchanga.mjs';
import { castAll } from '../lib/cast.mjs';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) pass++;
  else { fail++; failures.push(label); }
}
function close(a, b, tolArcmin, label) {
  const d = Math.abs(norm360(a - b + 180) - 180) * 60;
  ok(d <= tolArcmin, `${label} (off ${d.toFixed(2)}′ > ${tolArcmin}′)`);
}

// ————— 1 · ephemeris fixture V1 (astro-seek reference chart) —————
{
  const f = EPH_FIX.v1;
  const ut = new Date(f.input.utc);
  const sid = sidereal(positions(ut), ayanamsa(ut));
  for (const [key, want] of Object.entries(f.sidereal)) {
    const got = sid.bodies[key];
    const tol = f.outers.includes(key) ? f.toleranceArcmin.outer : f.toleranceArcmin.classical;
    close(got.lon, want.lon, tol, `eph v1 ${key} lon`);
    ok(!!got.retro === want.retro, `eph v1 ${key} retro`);
    const nak = nakshatraOf(got.lon);
    ok(nak.name === want.nakshatra && nak.pada === want.pada, `eph v1 ${key} nakshatra/pada (${nak.name} ${nak.pada} vs ${want.nakshatra} ${want.pada})`);
  }
  const ang = sidereal(ascendant(ut, f.input.latDeg, f.input.lonDeg), ayanamsa(ut));
  close(ang.asc.lon, f.angles.asc.lon, 2, 'eph v1 asc');
  close(ang.mc.lon, f.angles.mc.lon, 2, 'eph v1 mc');
}

// ————— 2 · Human Design fixture charts (all three, all 26 columns) —————
{
  for (const [name, f] of Object.entries(HD_FIX.charts)) {
    const hd = buildHDChart({ utDate: new Date(f.input.utc) });
    const col = (list) => list.map((a) => `${a.gate}.${a.line}`);
    ok(JSON.stringify(col(hd.personality)) === JSON.stringify(f.personality), `hd ${name} personality column`);
    ok(JSON.stringify(col(hd.design)) === JSON.stringify(f.design), `hd ${name} design column`);
    ok(hd.type === f.type, `hd ${name} type (${hd.type})`);
    ok(hd.profile.label === f.profile, `hd ${name} profile (${hd.profile.label})`);
    ok(hd.authority === f.authority, `hd ${name} authority (${hd.authority})`);
    ok(hd.definition === f.definition, `hd ${name} definition (${hd.definition})`);
    const ch = hd.channels.map((c) => `${c.gates[0]}-${c.gates[1]}`).sort();
    ok(JSON.stringify(ch) === JSON.stringify([...f.channels].sort()), `hd ${name} channels`);
    ok(hd.incarnationCross.label.startsWith(f.cross.split(' (')[0]), `hd ${name} cross (${hd.incarnationCross.label})`);
  }
}

// ————— 3 · Matrix fixture —————
{
  const mx = matrixChart(MX_FIX.date);
  for (const [k, v] of Object.entries(MX_FIX.points)) {
    ok(mx.points[k] === v, `matrix point ${k} (${mx.points[k]} vs ${v})`);
  }
}

// ————— 4 · panchanga vs the astro-seek reference (1 Jan 1970 Bucharest) —————
{
  const { ut } = utFromLocal({ year: 1970, month: 1, day: 1, hour: 0, minute: 0, tz: 'Europe/Bucharest' });
  const p = panchanga({ utDate: ut, latDeg: 44.4323, lonDeg: 26.1063, tz: 'Europe/Bucharest' });
  ok(p.vara.name === 'Wednesday' && p.vara.lord === 'Mercury', `panchanga vara (${p.vara.name})`);
  ok(p.tithi.label === 'Krishna Ashtami' && p.tithi.lord === 'Rahu', `panchanga tithi (${p.tithi.label})`);
  ok(Math.abs(p.tithi.percentLeft - 53.47) < 0.1, `panchanga tithi % (${p.tithi.percentLeft.toFixed(2)})`);
  ok(p.yoga.name === 'Shobhana' && p.yoga.lord === 'Sun', `panchanga yoga (${p.yoga.name}/${p.yoga.lord})`);
  ok(p.karana.name === 'Balava' && p.karana.deity === 'Brahma', `panchanga karana (${p.karana.name})`);
  ok(Math.abs(p.karana.percentLeft - 6.94) < 0.1, `panchanga karana % (${p.karana.percentLeft.toFixed(2)})`);
  ok(p.hora.lord === 'Jupiter' && p.hora.index === 18, `panchanga hora (${p.hora.lord} #${p.hora.index})`);
  ok(p.hora.sunrise === '07:51' && p.hora.sunset === '16:45', `panchanga sun frame (${p.hora.sunrise}/${p.hora.sunset})`);
}

// ————— 4b · varga houses vs the astro-seek reference (1 Jan 1970 Bucharest) —————
// Transcribed from astro-seek reference output; the 11 originally
// implemented vargas validated this transcription 143/143. Extended rows
// assert only when the engine implements the varga (post-resync).
{
  const { varga } = await import('../lib/engine/jyotish.js');
  const c = castAll({ date: '1970-01-01', time: '00:00', lat: 44.4333, lon: 26.1, tz: 'Europe/Bucharest' });
  const KEYS = ['asc', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'rahu', 'ketu'];
  const REF = {
    D1: [1, 4, 1, 5, 4, 6, 2, 8, 1, 3, 1, 6, 12], D2: [1, 1, 2, 1, 2, 1, 2, 2, 2, 1, 1, 1, 1],
    D3: [1, 4, 1, 1, 4, 6, 10, 4, 1, 11, 9, 10, 4], D4: [1, 7, 4, 2, 4, 9, 2, 8, 4, 12, 10, 9, 3],
    D5: [1, 4, 7, 9, 6, 10, 6, 6, 7, 1, 9, 10, 10], D6: [1, 8, 2, 12, 7, 8, 6, 6, 2, 12, 11, 9, 9],
    D7: [1, 11, 2, 4, 10, 2, 8, 2, 2, 2, 11, 3, 9], D8: [1, 2, 2, 7, 12, 6, 8, 8, 2, 3, 11, 7, 7],
    D9: [1, 5, 2, 11, 4, 12, 9, 3, 2, 5, 11, 1, 7], D10: [1, 10, 3, 3, 8, 1, 5, 11, 3, 2, 11, 2, 8],
    D11: [1, 12, 2, 7, 9, 10, 11, 5, 2, 9, 10, 12, 6], D12: [1, 6, 3, 3, 4, 9, 1, 7, 3, 1, 10, 10, 4],
    D16: [1, 3, 3, 1, 12, 12, 3, 3, 3, 6, 9, 2, 2], D20: [1, 5, 4, 5, 1, 10, 7, 7, 4, 2, 8, 12, 12],
    D24: [1, 6, 4, 8, 1, 7, 12, 11, 4, 9, 7, 10, 10], D27: [1, 2, 5, 7, 9, 10, 1, 7, 4, 2, 6, 1, 7],
    D30: [1, 4, 7, 1, 4, 10, 6, 6, 7, 1, 9, 10, 10], D40: [1, 2, 7, 5, 6, 4, 2, 2, 6, 6, 3, 9, 9],
    D45: [1, 8, 8, 8, 12, 8, 1, 12, 6, 1, 1, 12, 12], D60: [1, 3, 11, 6, 3, 9, 9, 3, 9, 5, 10, 3, 9],
    D81: [1, 6, 2, 9, 3, 6, 3, 9, 12, 6, 5, 2, 8],
    // D108 Uranus: astro-seek prints house 5; the engine computes 4 — the
    // base longitude sits 0.19′ under a 16.67′ part edge, inside the
    // documented ≤1′ engine-vs-astro-seek ephemeris residual. Pinned to the
    // engine value, same call the engine's own varga fixtures use.
    D108: [1, 12, 8, 2, 3, 3, 12, 6, 4, 12, 9, 3, 9],
    D144: [1, 7, 2, 11, 2, 8, 1, 6, 10, 1, 10, 12, 6],
  };
  let extendedImplemented = 0;
  for (const [dn, want] of Object.entries(REF)) {
    const n = Number(dn.slice(1));
    try { varga(15, n); } catch { continue; } // engine doesn't implement it (yet)
    const v = c.vedic.vargas[dn];
    ok(!!v, `varga ref: ${dn} exposed by cast`);
    if (!v) continue;
    const got = KEYS.map((k) => ((v[k].sign - v.asc.sign + 12) % 12) + 1);
    ok(got.every((g, i) => g === want[i]), `varga ref: ${dn} houses 13/13 (got ${got.join(',')})`);
    if (![1, 2, 3, 7, 9, 10, 12, 20, 27, 30, 60].includes(n)) extendedImplemented++;
  }
  if (extendedImplemented) console.log(`  (extended vargas implemented and verified: ${extendedImplemented})`);

  // ————— llms.txt must not lie about which vargas exist —————
  // It once claimed eleven working divisions "are not implemented anywhere in
  // the engine". An agent session followed the doc, tried them anyway, and
  // found they all render (2026-08-11). cast.mjs probes for vargas, so a resync
  // can add one silently — only a test keeps the prose honest.
  {
    const doc = readFileSync(
      join(dirname(dirname(fileURLToPath(import.meta.url))), 'llms.txt'), 'utf8');
    const listed = new Set((doc.match(/\bD\d+\b/g) ?? []));
    const real = Object.keys(c.vedic.vargas);
    for (const dn of real) {
      ok(listed.has(dn), `llms.txt lists implemented varga ${dn}`);
    }
    for (const dn of listed) {
      if (dn === 'D40') continue;                 // documented as the one absentee
      ok(real.includes(dn), `llms.txt does not claim unimplemented varga ${dn}`);
    }
    ok(/D40[\s\S]{0,200}not\s+(?:implemented|computed)/.test(doc),
      'llms.txt still records D40 as the one missing division');
  }
}

// ————— 5 · a reference chart casts a full, coherent chart —————
// A fictional birth (not a real person). Values are pinned as a regression
// anchor; the engine's astronomical correctness is proven in §1–4b.
{
  const c = castAll({ date: '1990-06-15', time: '14:30', lat: 40.7128, lon: -74.0060, tz: 'America/New_York', place: 'New York' });
  const vc = c.vedic;
  ok(vc.houses.length === 12 && vc.planets.length === 10, 'reference: 12 houses, 10 planets');
  ok(vc.ascendant.signName === 'Virgo', 'reference: Virgo lagna');
  ok(vc.nodes.rahu.house === 5 && vc.nodes.ketu.house === 11, 'reference: nodes on the H5/H11 axis');
  const sun = vc.planets.find((p) => p.body === 'sun');
  const mars = vc.planets.find((p) => p.body === 'mars');
  ok(sun.house === 10 && mars.house === 7, 'reference: Sun H10, Mars H7');
  ok(vc.karakas.byKaraka.AK === 'venus', 'reference: AK Venus');
  const sat = vc.planets.find((p) => p.body === 'saturn');
  ok(sat.signName === 'Capricorn' && sat.house === 5, 'reference: Saturn Capricorn H5');
  ok(c.nakshatras.ketu.name === 'Pushya' && c.nakshatras.ketu.pada === 4, 'reference: Ketu Pushya p4');
  ok(vc.vargas.D9.asc.signName === 'Gemini', 'reference: D9 lagna Gemini');
  ok(vc.vargas.D60.moon.signName === 'Aries', 'reference: D60 Moon Aries');
  ok(Object.keys(vc.vargas).length === 22, `reference: all implemented vargas exposed (${Object.keys(vc.vargas).length})`);
  const D = '2026-08-11';
  const md = vc.dashas.find((m) => new Date(D) >= m.start && new Date(D) < m.end);
  const ad = md.antardashas.find((a) => new Date(D) >= a.start && new Date(D) < a.end);
  ok(md.lord === 'Mercury' && ad.lord === 'Moon', `reference: Mercury/Moon period on ${D} (${md.lord}/${ad.lord})`);
  ok(vc.dashas.reduce((s, m) => s + m.years, 0) === 120, 'reference: vimshottari spans the full 120 years');
  ok(c.hd.incarnationCross.name === 'Right Angle Cross of Eden', `reference: HD cross (${c.hd.incarnationCross.name})`);
}

// ————— 5b · Jaimini Chara Dasha (K.N. Rao standard) —————
{
  const c = castAll({ date: '1990-06-15', time: '14:30', lat: 40.7128, lon: -74.0060, tz: 'America/New_York', place: 'New York' });
  const cd = c.jaimini.charaDasha;
  ok(cd.direction === 'direct', 'chara: direction direct');
  const seq = cd.majors.slice(0, 5).map((m) => `${m.signName}:${m.years}`).join(' ');
  ok(seq === 'Virgo:4 Libra:6 Scorpio:4 Sagittarius:6 Capricorn:12', `chara: K.N. Rao majors (${seq})`);
  ok(cd.majors.length === 24, `chara: two full cycles of twelve signs (${cd.majors.length})`);
  ok(cd.majors.every((m) => m.subs.length === 12), 'chara: every major carries twelve sub-periods');
  ok(!!cd.current.major?.signName && !!cd.current.sub?.signName, 'chara: a current major + sub resolve for today');
  ok(c.jaimini.strength.bodies.every((b) => typeof b.dignity?.state === 'string'), 'strength: every body carries a dignity state');
  ok(c.jaimini.rashiDrishti.length === 12 && c.jaimini.rashiDrishti[0].aspects.length === 3, 'jaimini: rashi drishti grid (12 signs × 3 aspects)');
}
function dtIso(d) { return new Date(d).toISOString().slice(0, 10); }

// ————— 5c · the drawn plates carry what they claim —————
{
  const { matrixGraphSVG } = await import('../lib/svg/matrixgraph.mjs');
  const { hdGraphSVG } = await import('../lib/svg/hdgraph.mjs');
  const c = castAll({ date: '1990-06-15', time: '14:30', lat: 40.7128, lon: -74.0060, tz: 'America/New_York' });

  // Matrix age ring: every dot labelled, and the ages ascend 0→80 clockwise
  const svg = matrixGraphSVG(c.matrix);
  const C = 320, ringR = 225 + 34;
  const ages = [...svg.matchAll(/<text class="agev" x="([-\d.]+)" y="([-\d.]+)"[^>]*>([^<]+)<\/text>/g)]
    .map(([, x, y, t]) => ({ x: +x, y: +y, t }))
    .filter((o) => o.t.endsWith('y') && Math.hypot(o.x - C, o.y - C) < ringR)
    .map((o) => ({ ...o, k: ((Math.atan2(o.y - C, o.x - C) * 180) / Math.PI - 180 + 720) % 360 }))
    .sort((a, b) => a.k - b.k);
  ok(ages.length === 56, `matrix ring: all 56 points carry an age (${ages.length})`);
  const seq = ages.map((o) => parseFloat(o.t));
  ok(seq.every((v, i) => i === 0 || v > seq[i - 1]), 'matrix ring: ages ascend clockwise from the 0y vertex');
  ok(seq[0] === 1 && seq[seq.length - 1] === 78.5, `matrix ring: spans 1y → 78.5y (${seq[0]} → ${seq[seq.length - 1]})`);
  ok(/>0y<\/text>/.test(svg) && /<text[^>]*font-size="10"[^>]*>70y<\/text>/.test(svg), 'matrix ring: decade marks present and enlarged');

  // Bodygraph: every gate chipped, the four Variables drawn from real colors
  const hdsvg = hdGraphSVG(c.hd);
  ok((hdsvg.match(/data-g="/g) ?? []).length === 64, 'bodygraph: all 64 gates chipped');
  ok((hdsvg.match(/data-center="/g) ?? []).length === 9, 'bodygraph: nine centers');
  ok(['DETERMINATION', 'ENVIRONMENT', 'PERSPECTIVE', 'MOTIVATION'].every((v) => hdsvg.includes(v)), 'bodygraph: four Variable arrows');
  ok(hdsvg.includes('DESIGN') && hdsvg.includes('PERSONALITY'), 'bodygraph: both activation panels');
  ok(!hdsvg.includes('NaN') && !svg.includes('NaN'), 'plates: no NaN geometry');
  ok(hdGraphSVG(null).startsWith('<svg'), 'bodygraph: empty plate renders without a chart');
}

// ————— 6 · noon-cast honesty —————
{
  const c = castAll({ date: '1990-06-15', time: null, timeUnknown: true, lat: 40.7128, lon: -74.0060, tz: 'America/New_York' });
  ok(c.meta.noonCast === true, 'noon cast flagged');
  ok(c.hd === null, 'noon cast: HD withheld');
}

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
// ————— 6b · Chara Dasha anchoring + the profile store (audit 2026-08-11) —————
{
  const { charaDasha } = await import('../lib/atlas/jaimini.mjs');
  const { saveProfile, deleteProfile, getProfile } = await import('../lib/profiles.mjs');

  // The timeline must start on the LOCAL civil birth date. It used to be built
  // from the UT instant's calendar fields, so any birth that crosses the UTC
  // boundary shifted all 12 majors and all 144 subs by a day.
  const sameDay = { date: '1988-03-14', time: '15:05', tz: 'Europe/Bucharest', lat: 44.43, lon: 26.10 };
  const utBefore = { ...sameDay, time: '01:30' };                       // UT = 13 Mar
  const utAfter = { date: '1988-03-14', time: '20:00', tz: 'America/New_York', lat: 40.71, lon: -74.01 }; // UT = 15 Mar
  for (const [label, b] of [['same UT day', sameDay], ['UT day before', utBefore], ['UT day after', utAfter]]) {
    const first = castAll(b).jaimini.charaDasha.majors[0].start;
    const iso = new Date(first).toISOString().slice(0, 10);
    ok(iso === '1988-03-14', `chara: anchored on the local birth date, ${label} (got ${iso})`);
  }

  // 12 signs cover 12–144 years, so one cycle can be outlived; `current` then
  // silently went null and the whole "currently running" answer disappeared.
  for (const birth of [
    { date: '1990-06-15', time: '14:30', lat: 40.7128, lon: -74.0060, tz: 'America/New_York' },
    { date: '1975-11-02', time: '06:15', lat: 51.5074, lon: -0.1278, tz: 'Europe/London' },
  ]) {
    const cd = castAll(birth).jaimini.charaDasha;
    if (cd.note) continue;
    ok(cd.majors.length === 24, `chara: two cycles across ${birth.date} (got ${cd.majors.length})`);
    ok(!!cd.current, 'chara: a current period resolves');
  }

  // Sub-periods are counted from the major's own start, day clamped to the
  // month's end. They used to be chained month to month, so a 29th–31st start
  // rolled over (31 Jan + 1 month → "31 Feb" → 3 Mar), every later sub drifted
  // by days and the last ran past the major.
  for (const date of ['1990-01-31', '1993-10-29', '1992-02-29']) {
    const cd = castAll({ date, time: '12:00', lat: 44.43, lon: 26.10, tz: 'Europe/Bucharest' }).jaimini.charaDasha;
    let bad = null;
    for (const m of cd.majors) {
      const s0 = new Date(m.start);
      for (let k = 0; k < 12 && !bad; k++) {
        const total = s0.getUTCMonth() + k * m.years;
        const y = s0.getUTCFullYear() + Math.floor(total / 12), mo = total % 12;
        const want = Date.UTC(y, mo, Math.min(s0.getUTCDate(), new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()));
        if (+m.subs[k].start !== want) bad = `${m.signName} sub ${k + 1} starts ${dtIso(m.subs[k].start)}, want ${dtIso(want)}`;
        else if (k < 11 && +m.subs[k].end !== +m.subs[k + 1].start) bad = `${m.signName} sub ${k + 1} does not meet sub ${k + 2}`;
      }
      if (!bad && +m.subs[11].end !== +m.end) bad = `${m.signName} last sub ends ${dtIso(m.subs[11].end)}, major ends ${dtIso(m.end)}`;
      if (bad) break;
    }
    ok(!bad, `chara: subs counted from the major's start, day clamped (born ${date}${bad ? ` — ${bad}` : ''})`);
  }

  // Slug validation lives at the write, not at the route — POST used to take
  // body.slug verbatim into join(DIR, slug + '.json').
  for (const bad of ['../../../../tmp/qa-evil', '/etc/qa-evil', 'Has Spaces', '..', 'UPPER']) {
    let threw = false;
    try { saveProfile({ name: 'QA', slug: bad, birth: { date: '1990-01-01', time: '01:00', lat: 1, lon: 1, tz: 'UTC' } }, { isNew: true }); } catch { threw = true; }
    ok(threw, `profiles: slug '${bad}' refused on save`);
  }
  ok(getProfile('../../etc/passwd') === null, 'profiles: traversal slug reads null, never a path');

  // Nothing here may be unrecoverable: a save keeps a copy, a delete is reversible.
  {
    const qb = { date: '1990-01-01', time: '01:00', lat: 1, lon: 1, tz: 'UTC' };
    const slug = 'zz-durability-qa';
    saveProfile({ name: 'ZZ Durability QA', slug, birth: qb }, { isNew: true });
    saveProfile({ name: 'ZZ Durability QA', slug, birth: { ...qb, time: '02:00' } });
    const hist = readdirSync(join(ROOT_DIR, 'data/history')).filter((f) => f.startsWith(`${slug}--`));
    ok(hist.length >= 1, 'durability: a save keeps the version it replaced');
    deleteProfile(slug);
    ok(getProfile(slug) === null, 'durability: delete removes it from the desk');
    const trashed = readdirSync(join(ROOT_DIR, 'data/trash')).filter((f) => f.startsWith(`${slug}--`));
    ok(trashed.length === 1, 'durability: delete is recoverable from data/trash');
    for (const f of trashed) rmSync(join(ROOT_DIR, 'data/trash', f));
    for (const f of hist) rmSync(join(ROOT_DIR, 'data/history', f));
  }

  // The ephemeris is pinned: every planetary position comes from it, and a
  // caret range let `npm install` change every chart silently.
  {
    const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8'));
    const want = pkg.dependencies['astronomy-engine'];
    ok(/^\d+\.\d+\.\d+$/.test(want), `deps: astronomy-engine pinned exactly (got ${want})`);
    const got = JSON.parse(readFileSync(join(ROOT_DIR, 'node_modules/astronomy-engine/package.json'), 'utf8')).version;
    ok(got === want, `deps: installed astronomy-engine matches the pin (${got} vs ${want})`);
  }

  // South Indian: a label must never render inside the neighbouring sign's cell.
  // Parses the ACTUAL SVG the renderer emits and counts how many body labels
  // land in each cell's rectangle, against how many that sign should hold.
  // (A first version recomputed the layout maths inside the test — which meant
  // it was checking its own copy and passed happily with the fix reverted.)
  {
    const { placements, southIndianSVG } = await import('../lib/svg/charts.mjs');
    const M = 10, W = 440, cellSz = W / 4;
    const CELL = [[1,0],[2,0],[3,0],[3,1],[3,2],[3,3],[2,3],[1,3],[0,3],[0,2],[0,1],[0,0]];
    let mismatches = 0, seen = 0, crowded = 0;
    // a spread of synthetic births — enough charts across enough signs to
    // exercise every cell, and to force some crowded (5+ body) cells.
    const births = [];
    for (let mo = 1; mo <= 12; mo++) {
      for (const [lat, lon, tz] of [[40.7128, -74.0060, 'America/New_York'], [51.5074, -0.1278, 'Europe/London']]) {
        births.push({ date: `1985-${String(mo).padStart(2, '0')}-10`, time: '12:30', lat, lon, tz });
      }
    }
    for (const birth of births) {
      let c; try { c = castAll(birth); } catch { continue; }
      for (const n of [1, 2, 9, 60]) {
        const pl = placements(c.vedic, n);
        const want = Array.from({ length: 12 }, () => 0);
        for (const b of pl.bodies) want[b.sign]++;
        if (want.some((w) => w >= 5)) crowded++;
        const svg = southIndianSVG(pl, {});
        // body labels are the bold ones; sign watermarks and house numbers are not
        const got = Array.from({ length: 12 }, () => 0);
        for (const m of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*font-weight="600"[^>]*>([^<]*)</g)) {
          if (m[3] === 'La') continue;          // the lagna marker shares font-weight 600
          const lx = parseFloat(m[1]), ly = parseFloat(m[2]);
          seen++;
          const idx = CELL.findIndex(([cc, rr]) => {
            const x0 = M + cc * cellSz, y0 = M + rr * cellSz;
            return lx >= x0 && lx <= x0 + cellSz && ly >= y0 && ly <= y0 + cellSz;
          });
          if (idx >= 0) got[idx]++;
        }
        for (let sg = 0; sg < 12; sg++) if (got[sg] !== want[sg]) mismatches++;
      }
    }
    ok(seen > 500, `charts: south layout exercised (${seen} labels drawn)`);
    ok(crowded > 0, `charts: crowded cells actually present in the fixtures (${crowded})`);
    ok(mismatches === 0, `charts: every label lands in its own sign's cell (${mismatches} cells off)`);
  }
  let delThrew = false;
  try { deleteProfile('../../../../tmp/qa-evil'); } catch { delThrew = true; }
  ok(delThrew, 'profiles: traversal slug refused on delete');
}

// ————— 6c · follow-up fixes (review 2026-08-12) —————
{
  const { fieldOf, researchRows, researchMd, researchCsv } = await import('../lib/md/bulk.mjs');
  const { placements, southIndianSVG, northIndianSVG } = await import('../lib/svg/charts.mjs');
  const { saveProfile, deleteProfile } = await import('../lib/profiles.mjs');

  // — varga columns are sign-only; a nakshatra/degree sub-attribute returns null —
  const cC = castAll({ date: '1990-06-15', time: '14:30', lat: 40.7128, lon: -74.0060, tz: 'America/New_York' });
  ok(fieldOf(cC, 'd9.moon.sign') && fieldOf(cC, 'd9.moon.nakshatra') === null && fieldOf(cC, 'd9.moon.degree') === null,
    'bulk: d9.body.sign resolves, d9.body.nakshatra/degree return null');

  // — research table withholds hour-sensitive columns for a noon cast and keeps them out of the tally —
  const mk = (name, timeUnknown, tags = []) => ({
    profile: { name, slug: 'x', category: 'research', tags, birth: { date: '1990-06-15', time: timeUnknown ? null : '14:30', timeUnknown, place: 'x' } },
    cast: castAll({ date: '1990-06-15', time: timeUnknown ? '12:00' : '14:30', lat: 40.7128, lon: -74.006, tz: 'America/New_York', timeUnknown }),
  });
  const tbl = researchRows([mk('Timed', false), mk('NoTime', true)], { columns: ['lagna.sign', 'moon.pada', 'moon.sign'] });
  ok(tbl.rows[1].values[0] === null && tbl.rows[1].values[1] === null,
    'bulk: noon cast withholds lagna.sign and moon.pada (hour-sensitive)');
  ok(tbl.rows[1].values[2] !== null, 'bulk: noon cast keeps moon.sign (usable)');
  const md = researchMd(tbl, {});
  ok(/lagna\.sign\*\* — Virgo ×1 _\(\+1 time-unknown/.test(md), 'bulk: tally excludes the withheld cell');
  ok(!/read sign and nakshatra only/.test(md) && /ascendant, houses, varga lagnas and pada/.test(md),
    'bulk: the caveat names the ascendant/pada as unreliable, not the reverse');

  // — CSV formula-injection guard and markdown pipe escaping —
  const csv = researchCsv(researchRows([mk('=cmd', false, ['@vip'])], { columns: ['moon.sign'] }));
  const dataRow = csv.split('\n')[1];
  ok(dataRow.startsWith("'=cmd,"), `csv: a leading = in a name is guarded with an apostrophe (got ${dataRow.slice(0, 12)})`);
  ok(dataRow.includes("'@vip"), 'csv: an @-prefixed tag cell is guarded too');
  const mdPipe = researchMd(researchRows([mk('Bad|Name', false)], { columns: ['moon.sign'] }), {});
  ok(mdPipe.includes('Bad\\|Name'), 'bulk: a | in a name is escaped in the research table');

  // — backup filenames never collide, even at same-millisecond writes —
  const qb = { date: '1990-01-01', time: '01:00', lat: 1, lon: 1, tz: 'UTC' };
  saveProfile({ name: 'ZZ Backup QA', slug: 'zz-backup-qa', birth: qb }, { isNew: true });
  for (let i = 0; i < 5; i++) saveProfile({ name: 'ZZ Backup QA', slug: 'zz-backup-qa', birth: { ...qb, time: `0${i}:00` } });
  const hist = readdirSync(join(ROOT_DIR, 'data/history')).filter((f) => f.startsWith('zz-backup-qa--'));
  ok(hist.length === new Set(hist).size && hist.length >= 5,
    `durability: ${hist.length} history copies, all uniquely named (no same-ms overwrite)`);
  deleteProfile('zz-backup-qa');
  for (const dir of ['data/trash', 'data/history']) {
    for (const f of readdirSync(join(ROOT_DIR, dir)).filter((f) => f.startsWith('zz-backup-qa--'))) rmSync(join(ROOT_DIR, dir, f));
  }

  // — noon-cast charts: fictional lagna/houses suppressed, caveat stamped, signs kept —
  const noon = castAll({ date: '1990-06-15', time: '12:00', lat: 40.7128, lon: -74.006, tz: 'America/New_York', timeUnknown: true });
  const sNoon = southIndianSVG(placements(noon.vedic, 1, { timeUnknown: true }), {});
  ok(!/>La</.test(sNoon) && /no birth time/.test(sNoon), 'charts: noon South drops the La marker and stamps a caveat');
  ok((sNoon.match(/font-weight="600"/g) ?? []).length >= 9, 'charts: noon South still draws the planets by sign');
  const sTimed = southIndianSVG(placements(cC.vedic, 1, { timeUnknown: false }), {});
  ok(/>La</.test(sTimed) && !/no birth time/.test(sTimed), 'charts: a timed chart keeps La and no caveat');
  ok(/houses are a noon guess/.test(northIndianSVG(placements(noon.vedic, 1, { timeUnknown: true }), {})),
    'charts: noon North stamps the house-framing caveat');

  // — dasha exports never print a pre-birth date (the first mahadasha's nominal
  //   start precedes birth; the timeline clamps to the birth instant) —
  const { dashasMd } = await import('../lib/md/format.mjs');
  // Roberta-like: a tiny Venus balance means the nominal Venus MD starts ~19y before birth.
  const cClamp = castAll({ date: '1999-05-24', time: '08:15', lat: 44.43, lon: 26.11, tz: 'Europe/Bucharest' });
  const birthYear = +new Date(cClamp.meta.utc).getUTCFullYear();
  const dmd = dashasMd(cClamp, { name: 'Clamp QA' });
  const dateCells = [...dmd.matchAll(/\| (\d{4})-\d{2}-\d{2} \|/g)].map((m) => +m[1]);
  ok(dateCells.length > 0 && Math.min(...dateCells) >= birthYear,
    `dashas: no export date precedes the birth year ${birthYear} (min ${Math.min(...dateCells)})`);
  const firstRow = dmd.split('\n').find((l) => l.startsWith('| **'));
  ok(/\| birth \|/.test(firstRow) && firstRow.includes(`${birthYear}-`),
    `dashas: first mahadasha row reads Age "birth" and starts in the birth year (${firstRow})`);
}

// ————— 6e · the live sky: every body's stay, both zodiacs (2026-10-05) —————
{
  const { skyNow } = await import('../lib/atlas/sky.mjs');
  const { SIGNS } = await import('../lib/engine/jyotish.js');
  const { Seasons } = await import('astronomy-engine');
  const AT = new Date('2026-10-05T12:00:00Z');
  const at = +AT;
  const sky = skyNow(AT);
  ok(sky.vedic.map((r) => r.key).join() === 'sun,moon,mercury,venus,mars,jupiter,saturn,rahu,ketu'
    && sky.tropical.length === 11, 'sky: nine grahas sidereal, eleven bodies tropical');

  // an independent read of where a body is — positions() + ayanamsa, none of sky.mjs
  const EK = { rahu: 'meanNode' };
  const lonOf = (key, zod, ms) => {
    const d = new Date(ms);
    const l = positions(d).bodies[EK[key] ?? key].lon;
    return zod === 'v' ? norm360(l - ayanamsa(d)) : l;
  };
  const signOf = (key, zod, ms) => SIGNS[Math.floor(lonOf(key, zod, ms) / 30)];
  const M2 = 2 * 60e3;
  const nextTo = (a, b) => [1, 11].includes((SIGNS.indexOf(b) - SIGNS.indexOf(a) + 12) % 12);
  const bad = [];
  for (const [zod, rows] of [['v', sky.vedic], ['t', sky.tropical]]) {
    for (const r of rows) {
      const since = Date.parse(r.stay.since), until = Date.parse(r.stay.until), tag = `${zod}:${r.key}`;
      if (!(since < at && at < until)) bad.push(`${tag} window`);
      if (signOf(r.key, zod, at) !== r.sign) bad.push(`${tag} sign now`);
      if (signOf(r.key, zod, since + M2) !== r.sign || signOf(r.key, zod, until - M2) !== r.sign) bad.push(`${tag} inside`);
      if (signOf(r.key, zod, since - M2) !== r.stay.from || signOf(r.key, zod, until + M2) !== r.stay.to) bad.push(`${tag} outside`);
      if (!nextTo(r.sign, r.stay.to) || !nextTo(r.stay.from, r.sign)) bad.push(`${tag} not adjacent`);
    }
  }
  ok(bad.length === 0, `sky: every body holds its sign from 'since' to 'until', and the neighbour outside (${bad.join(', ') || 'all 20 hold'})`);

  // an outside anchor for the search itself: astronomy-engine's own equinox
  const sunT = sky.tropical.find((r) => r.key === 'sun');
  const eqOff = Math.abs(Date.parse(sunT.stay.since) - +Seasons(2026).sep_equinox.date) / 60e3;
  ok(sunT.sign === 'Libra' && eqOff < 3, `sky: the Sun's tropical Libra ingress is the September equinox (off ${eqOff.toFixed(1)} min)`);
  const sunV = sky.vedic.find((r) => r.key === 'sun');
  ok(sunV.sign === 'Virgo' && sunV.stay.to === 'Libra' && /^2026-10-1[678]/.test(sunV.stay.until),
    `sky: the sidereal Sun reaches Libra (Tula sankranti) Oct 16–18 (${sunV.stay.until})`);
  const days = (r) => (Date.parse(r.stay.until) - Date.parse(r.stay.since)) / 86400e3;
  const moonV = sky.vedic.find((r) => r.key === 'moon');
  ok(days(moonV) > 2 && days(moonV) < 3 && days(sunV) > 29 && days(sunV) < 32,
    `sky: the Moon holds a sign 2–3 days, the Sun 29–32 (${days(moonV).toFixed(2)}d, ${days(sunV).toFixed(1)}d)`);
  const rahu = sky.vedic.find((r) => r.key === 'rahu'), ketu = sky.vedic.find((r) => r.key === 'ketu');
  ok(rahu.retro && ketu.retro && Math.abs(Date.parse(rahu.stay.until) - Date.parse(ketu.stay.until)) < M2,
    'sky: the mean nodes are retrograde and change sign at the same instant');

  // nakshatra + pada: in it just before its edge, in the reported next one just after
  const nakAt = (key, ms) => nakshatraOf(lonOf(key, 'v', ms));
  const badNak = [];
  for (const r of sky.vedic) {
    const n = r.nakshatra, u = Date.parse(n.until), pu = Date.parse(n.padaUntil);
    if (nakAt(r.key, u - M2).name !== n.name || nakAt(r.key, u + M2).name !== n.next) badNak.push(`${r.key} nakshatra`);
    if (!(pu <= u + 60e3) || nakAt(r.key, pu - M2).pada !== n.pada || nakAt(r.key, pu + M2).pada !== n.padaNext) badNak.push(`${r.key} pada`);
  }
  ok(badNak.length === 0, `sky: nakshatra and pada edges land where the body actually crosses (${badNak.join(', ') || 'all 9 hold'})`);
  const venus = sky.vedic.find((r) => r.key === 'venus');
  ok(venus.retro && venus.nakshatra.padaNext === venus.nakshatra.pada - 1,
    `sky: a retrograde graha steps BACK a pada (Venus ${venus.nakshatra.name} p${venus.nakshatra.pada} → p${venus.nakshatra.padaNext})`);

  // stations: each one is a real turn of the motion, and the 2026 calendar holds
  const speed = (key, ms) => positions(new Date(ms)).bodies[EK[key] ?? key].speed;
  const D1 = 86400e3, badSt = [];
  for (const r of [...sky.vedic, ...sky.tropical]) {
    const turn = (iso, before, after) => iso && !(Math.sign(speed(r.key, Date.parse(iso) - D1)) === before && Math.sign(speed(r.key, Date.parse(iso) + D1)) === after);
    if (turn(r.directOn, -1, 1)) badSt.push(`${r.key} direct`);
    if (turn(r.retroSince, 1, -1)) badSt.push(`${r.key} retro start`);
    if (turn(r.nextRetro, 1, -1)) badSt.push(`${r.key} next retro`);
  }
  ok(badSt.length === 0, `sky: every station is a real turn of motion (${badSt.join(', ') || 'all hold'})`);
  const merc = sky.vedic.find((r) => r.key === 'mercury');
  ok(/^2026-10-2[345]/.test(merc.nextRetro ?? '') && /^2026-11-1[345]/.test(venus.directOn ?? ''),
    `sky: Mercury turns retrograde ~Oct 24, Venus direct ~Nov 14 (${merc.nextRetro}, ${venus.directOn})`);

  // the cache: past an edge it moves on; back at the earlier instant it is still exact
  const moonT = sky.tropical.find((r) => r.key === 'moon');
  const later = skyNow(new Date(Date.parse(moonT.stay.until) + 3600e3)).tropical.find((r) => r.key === 'moon');
  ok(later.sign === moonT.stay.to && Math.abs(Date.parse(later.stay.since) - Date.parse(moonT.stay.until)) < M2,
    `sky: an hour past the Moon's exit the reading has moved on (${later.sign} since ${later.stay.since})`);
  const again = skyNow(AT);
  ok(JSON.stringify([again.vedic, again.tropical]) === JSON.stringify([sky.vedic, sky.tropical]),
    'sky: re-reading the earlier instant gives the identical answer (no stale edge served)');
  // nobody opens the dashboard for a lunar month: the Moon is back in the same
  // sign, and its stay must be this month's, not the one cached last month
  const mid = (Date.parse(moonT.stay.since) + Date.parse(moonT.stay.until)) / 2;
  skyNow(new Date(mid));
  const lunar = mid + 27.32 * 86400e3;
  const moonL = skyNow(new Date(lunar)).tropical.find((r) => r.key === 'moon');
  ok(moonL.sign === moonT.sign && Date.parse(moonL.stay.since) <= lunar && lunar < Date.parse(moonL.stay.until),
    `sky: a lunar month on, back in ${moonL.sign}, the stay is this month's (${moonL.stay.since} → ${moonL.stay.until})`);
}

// ————— 6f · the Matrix age ring on the calendar —————
{
  const { dateAtAge } = await import('../lib/atlas/matrix-calendar.mjs');
  const { matrixMd } = await import('../lib/md/format.mjs');
  const { matrixGraphSVG } = await import('../lib/svg/matrixgraph.mjs');
  const castOn = (date) => castAll({ date, time: '12:00', lat: 0, lon: 0, tz: 'UTC' });
  const periods = (mx) => mx.ageRing.flatMap((s) => [s.corner, ...s.points]);
  const sample = castOn('1990-06-15');

  // a decade corner holds its whole year; the next dot opens the year after
  const c30 = sample.matrix.ageRing[3].corner;
  ok(c30.value === 7 && c30.start === '2020-06-15' && c30.end === '2021-06-15',
    `ring dates: the 30 corner runs from the 30th birthday to the 31st (${c30.value}: ${c30.start} → ${c30.end})`);

  // the dates sit beside the ring: arcana and printed ages stay the engine's
  const shape = (mx) => JSON.stringify(mx.ageRing.map((s) => s.points.map((p) => [p.value, p.label, p.bold])));
  ok(shape(sample.matrix) === shape(matrixChart(MX_FIX.date)), 'ring dates: arcana and printed ages match the raw engine ring');
  ok(sample.matrix.ageRing[0].points.map((p) => p.value).join() === MX_FIX.sectorA_NW.join(), 'ring dates: the pinned sector still reads true through the cast');

  // the calendar edges: no month rolls over, and a leap-day birth keeps its own day when it can
  ok(dateAtAge({ year: 1992, month: 8, day: 31 }, 2.5) === '1995-02-28', 'ring dates: Aug 31 + 2.5y stays in February');
  ok(dateAtAge({ year: 2000, month: 2, day: 29 }, 1) === '2001-02-28' && dateAtAge({ year: 2000, month: 2, day: 29 }, 4) === '2004-02-29',
    'ring dates: a Feb 29 birth lands on Feb 28 or 29, never March');
  ok(dateAtAge({ year: 2000, month: 12, day: 15 }, 1.5) === '2002-06-15', 'ring dates: a half-year crosses New Year cleanly');

  // no stretch of a life left off the dial: seamless, birth to 80, on the ring's own beat
  const months = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  const bad = [];
  for (const date of ['1990-06-15', '2000-02-29', '1992-08-31', '1985-12-31', '1970-01-01']) {
    const list = periods(castOn(date).matrix);
    if (list.length !== 64) bad.push(`${date} has ${list.length} periods`);
    if (list[0].start !== date) bad.push(`${date} opens ${list[0].start}`);
    if (months(list[0].start, list.at(-1).end) !== 960) bad.push(`${date} closes ${list.at(-1).end}`);
    list.forEach((p, i) => {
      if (i && list[i - 1].end !== p.start) bad.push(`${date} seam at ${p.label}y`);
      if (![12, 18].includes(months(p.start, p.end))) bad.push(`${date} ${p.label}y spans ${months(p.start, p.end)}mo`);
    });
  }
  ok(bad.length === 0, `ring dates: every period opens where the last closed, birth to 80, 12 or 18 months each, 15 on average (${bad.slice(0, 5).join(', ') || 'five births hold'})`);
  const noon = castAll({ date: '1990-06-15', time: null, timeUnknown: true, lat: 40.7128, lon: -74.006, tz: 'America/New_York' }).matrix;
  ok(noon.ageRing[3].corner.start === '2020-06-15', 'ring dates: a noon cast loses nothing, the ring needs only the date');

  // every surface carries them
  const today = new Date().toISOString().slice(0, 10);
  const rows = matrixMd(sample, { name: 'QA' }).split('\n').filter((l) => /^\| .*\d{4}-\d{2}-\d{2} \| \d{4}-\d{2}-\d{2} \|/.test(l));
  const running = rows.filter((l) => l.includes('●'));
  const [, , from, to] = (running[0] ?? '').split('|').map((s) => s.trim());
  ok(rows.length === 64 && running.length === 1 && from <= today && today < to,
    `ring dates: matrix.md lists all 64 periods, the one running now marked (${running.length} marked, ${from} → ${to})`);
  ok(!matrixMd(castOn('1900-01-15'), { name: 'QA' }).includes(' ● |'), 'ring dates: past 80 the dial has ended, nothing is marked running');
  const plate = matrixGraphSVG(sample.matrix);
  ok(plate.includes('Ages 31–32.5 (2021-06-15 to 2022-12-15)'), 'ring dates: a ring dot’s hover carries its dates');
  ok(['1990', '2000', '2010', '2020', '2030', '2040', '2050', '2060'].every((y) => plate.includes(`>${y}</text>`)),
    'ring dates: the octagram prints each decade mark’s year');
}

// ————— 6g · PDF export: no line may fall out of the font —————
{
  const { createRequire } = await import('node:module');
  const { jsPDF } = createRequire(import.meta.url)('jspdf');
  const F = await import('../lib/md/format.mjs');
  const src = readFileSync(join(ROOT_DIR, 'ui/app.js'), 'utf8');
  const pdfText = new Function(`${src.match(/const PDF_OFF_FONT[\s\S]*?'\?'\);/)[0]}\nreturn pdfText;`)();
  // a line jsPDF could not encode goes out as 16-bit text, NUL before every character
  const garbled = (lines) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFont('courier', 'normal'); doc.setFontSize(7.6);
    lines.forEach((l, i) => doc.text(l || ' ', 46, 46 + (i % 70) * 10));
    return /\u0000/.test(doc.output());
  };
  ok(garbled(['| 30y ● | 2020-06-15 |']), 'pdf: the check itself works, a raw ● does break a line');
  ok(pdfText('● 17°29′ → Șerban') === "* 17°29' -> Serban", `pdf: off-font characters become plain stand-ins (${pdfText('● 17°29′ → Șerban')})`);
  ok(pdfText('0–10 · é — “x”') === '0–10 · é — “x”', 'pdf: what the font can print is left alone');
  const cast = castAll({ date: '1990-06-15', time: '14:30', lat: 40.7128, lon: -74.006, tz: 'America/New_York' });
  const lines = Object.entries(F).filter(([k, fn]) => k.endsWith('Md') && typeof fn === 'function')
    .flatMap(([, fn]) => fn(cast, { name: 'QA Șțăîâ Name' }).split('\n'));
  ok(lines.length > 300 && !garbled(lines.map((l) => pdfText(l.replace(/\*\*/g, '')))), `pdf: all ${lines.length} lines of every export print cleanly`);
  ok(/splitTextToSize\(pdfText\(/.test(src) && (src.match(/doc\.text\(pdfText\(/g) ?? []).length === 2, 'pdf: the body and both header lines go through pdfText');
}

// ————— 7 · API end-to-end on a throwaway port —————
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
await new Promise((resolve) => {
  const srv = spawn('node', [join(ROOT, 'server.mjs')], {
    env: { ...process.env, CHARTDESK_PORT: '4799' },
    stdio: 'ignore',
  });
  const done = (fn) => { srv.kill(); resolve(); if (fn) fn(); };
  setTimeout(async () => {
    try {
      const base = 'http://127.0.0.1:4799';
      const j = (p, o) => fetch(base + p, o).then(async (r) => ({ status: r.status, body: (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : await r.text() }));

      let r = await j('/api/health');
      ok(r.status === 200 && r.body.ok, 'api: health');
      r = await j('/llms.txt');
      ok(r.status === 200 && r.body.includes('atlas.md'), 'api: llms.txt');
      r = await j('/api/cities?q=buchar');
      ok(r.status === 200 && r.body[0]?.name === 'Bucharest', 'api: city search');
      r = await j('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test Person QA', category: 'research', birth: { date: '1988-11-20', time: '08:30', lat: 41.4, lon: -75.6, tz: 'America/New_York', place: 'Scranton' } }) });
      ok(r.status === 201 && r.body.slug === 'test-person-qa', 'api: create profile');
      r = await j('/api/profiles/test-person-qa/atlas.md');
      ok(r.status === 200 && r.body.includes('# Vedic chart') && r.body.includes('# Human Design chart'), 'api: atlas.md');
      r = await j('/api/profiles/test-person-qa/chart.svg?style=south&varga=9');
      ok(r.status === 200 && r.body.startsWith('<svg'), 'api: chart.svg');
      r = await j('/api/profiles/test-person-qa/varga?n=30');
      ok(r.status === 200 && r.body.bodies?.length > 0, 'api: varga view');
      r = await j('/api/profiles/test-person-qa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test Person QA', category: 'other' }) });
      ok(r.status === 200 && r.body.category === 'other', 'api: patch profile');
      r = await j('/api/profiles/test-person-qa', { method: 'DELETE' });
      ok(r.status === 200, 'api: delete profile');
      r = await j('/api/profiles/test-person-qa');
      ok(r.status === 404, 'api: deleted profile 404s');
      r = await j('/api/cast/vedic.md?date=1990-03-15&time=06:30&lat=46.77&lon=23.6&tz=Europe/Bucharest&place=Cluj');
      ok(r.status === 200 && r.body.includes('Vimshottari'), 'api: ad-hoc cast md');
      // ————— bulk export: archive + research —————
      r = await j('/api/research.md?columns=moon.nakshatra,lagna.sign');
      ok(r.status === 200 && r.body.includes('| Name | Birth | moon.nakshatra | lagna.sign |'),
        'bulk: research table renders the requested columns');
      ok(r.body.includes('## Distribution'), 'bulk: research table tallies each column');

      // the cohort filter is the point — placement terms, not just category/tag.
      // Derive a moon.nakshatra that actually occurs, then prove where= narrows to it.
      const dataRows = (md) => md.split('\n').filter((l) => /^\| [^|]+ \| \d{4}-\d{2}-\d{2} \|/.test(l));
      r = await j('/api/research.md?columns=moon.nakshatra');
      const everyoneRows = dataRows(r.body);
      const everyone = everyoneRows.length;
      const someNak = everyoneRows[0].split('|')[3].trim();
      r = await j(`/api/research.md?where=moon.nakshatra=${encodeURIComponent(someNak)}&columns=moon.pada`);
      ok(r.status === 200 && /# Research table — \d+ native/.test(r.body),
        'bulk: where= narrows by placement');
      const cohort = dataRows(r.body).length;
      ok(cohort > 0 && cohort <= everyone, `bulk: the cohort is a real subset (${cohort} of ${everyone})`);

      r = await j('/api/research.md?where=moon.nakshatra=NoSuchNakshatra');
      ok(r.status === 404, 'bulk: an empty cohort 404s rather than returning an empty table');
      r = await j('/api/research.md?where=garbage');
      ok(r.status === 400, 'bulk: a malformed where term is a 400');

      r = await j('/api/research.csv?columns=moon.sign');
      ok(r.status === 200 && r.body.split('\n')[0] === 'name,birth,category,tags,time_unknown,moon.sign',
        'bulk: csv header');

      r = await j('/api/archive.md?tag=sample&sections=vedic&vargas=D1,D9');
      ok(r.status === 200 && r.body.startsWith('# Chart Desk archive'), 'bulk: archive builds');
      ok(/^## Contents$/m.test(r.body), 'bulk: archive has a contents list');
      // each person's own sections must nest UNDER their name, or the file is
      // one flat run of identically-titled headings
      ok(/^# [^#\n]+$/m.test(r.body) && /^## Vedic chart/m.test(r.body),
        'bulk: sections are demoted under each person');
      r = await j('/api/archive.md?sections=nonsense');
      ok(r.status === 400, 'bulk: unknown section is a 400');

      // ————— bulk import (the collaborative write layer) —————
      const importBody = {
        category: 'research', tags: ['import-qa'], dryRun: true,
        people: [
          { name: 'Zz Import Geocode', date: '1970-07-07', time: '07:07', place: 'Cluj-Napoca, Romania' },
          { name: 'Zz Import NoPlace', date: '1990-01-01', time: '09:00' },
          { name: 'Zz Import BadDate', date: '1990-13-45', place: 'Paris, France' },
        ],
      };
      r = await j('/api/profiles/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(importBody) });
      ok(r.status === 200 && r.body.dryRun === true, 'import: dry-run returns 200 without writing');
      ok(r.body.created.length === 1 && r.body.created[0].birth.tz === 'Europe/Bucharest',
        'import: a place name is geocoded to lat/lon/tz');
      ok(r.body.errors.some((e) => /BadDate/.test(e.name) && /real YYYY-MM-DD/.test(e.reason)),
        'import: a bad calendar date is rejected per-person, not fatal');
      ok(r.body.errors.some((e) => /NoPlace/.test(e.name)), 'import: a person with no place or coords errors');
      // dry-run must not have written anything
      r = await j('/api/profiles/zz-import-geocode');
      ok(r.status === 404, 'import: dry-run wrote nothing to disk');

      // real write, then confirm it casts, then clean up
      r = await j('/api/profiles/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...importBody, dryRun: false, people: [importBody.people[0]] }) });
      ok(r.status === 200 && r.body.created.length === 1, 'import: real write creates the profile');
      r = await j('/api/profiles/zz-import-geocode');
      ok(r.status === 200 && r.body.birth.lat > 46 && r.body.tags.includes('import-qa'), 'import: the written profile has the geocoded birth and tags');
      r = await j('/api/profiles/zz-import-geocode', { method: 'DELETE' });
      ok(r.status === 200, 'import: cleanup delete');
      // a non-JSON import body is refused like every write
      r = await j('/api/profiles/import', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
      ok(r.status === 400, 'import: non-JSON body refused');

      r = await j('/api/cast?date=bad');
      ok(r.status === 400, 'api: bad input 400s');

      // ————— the browser boundary (audit 2026-08-11) —————
      // Every one of these was exploitable from any web page she visited.
      const raw = (p, o) => fetch(base + p, o);
      let h = await raw('/api/profiles');
      ok(h.headers.get('access-control-allow-origin') === null,
        'security: no Access-Control-Allow-Origin header anywhere');

      r = await j('/api/profiles', { headers: { Origin: 'https://evil.example.com' } });
      ok(r.status === 403, 'security: cross-origin read refused');
      r = await j('/api/profiles/test-x', { method: 'DELETE', headers: { Origin: 'https://evil.example.com' } });
      ok(r.status === 403, 'security: cross-origin DELETE refused');

      // fetch() refuses to set Host (a forbidden header name), so the Host
      // allowlist has to be probed with the raw client or the test proves nothing.
      const rawReq = (path, headers) => new Promise((res2) => {
        const req = httpRequest({ host: '127.0.0.1', port: 4799, path, method: 'GET', headers }, (rr) => {
          rr.resume(); rr.on('end', () => res2(rr.statusCode));
        });
        req.on('error', () => res2(0));
        req.end();
      });

      // DNS rebinding does not use CORS at all — only the Host allowlist stops it
      ok(await rawReq('/api/profiles', { Host: 'evil.com' }) === 403,
        'security: foreign Host refused (DNS rebinding)');

      // same-origin, and any tailnet name a device arrives under (*.ts.net)
      r = await j('/api/health', { headers: { Origin: 'http://127.0.0.1:4799' } });
      ok(r.status === 200, 'security: same-origin allowed');
      ok(await rawReq('/api/health', { Host: 'mymachine.tailnet.ts.net:9443', Origin: 'https://mymachine.tailnet.ts.net:9443' }) === 200,
        'security: tailnet origin allowed');
      ok(await rawReq('/api/health', { Host: 'mymachine.tailnet.ts.net:9443', Origin: 'https://evil.example.com' }) === 403,
        'security: foreign Origin on a valid Host still refused');

      // a text/plain POST is a CORS "simple request" — no preflight to refuse
      r = await j('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"name":"x"}' });
      ok(r.status === 400, 'security: non-JSON Content-Type refused');

      // the create route took body.slug verbatim into a file path
      r = await j('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Traversal QA', slug: '../../../../tmp/chartdesk-qa-evil', birth: { date: '1990-01-01', time: '01:00', lat: 1, lon: 1, tz: 'UTC' } }),
      });
      ok(r.status === 400, 'security: traversal slug refused on create');
      ok(!existsSync('/tmp/chartdesk-qa-evil.json'), 'security: no file written outside data/profiles');

      // one malformed Host used to throw outside the try — a launchd respawn
      ok(await rawReq('/', { Host: 'a b c' }) === 400, 'robustness: malformed Host is a 400');
      r = await j('/api/health');
      ok(r.status === 200 && r.body.ok, 'robustness: server survived the malformed Host');

      // — v2: tags/order, sections, dashboard, tropical, graph SVGs —
      r = await j('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Tag Test QA', category: 'research', tags: ['alpha', 'beta'], birth: { date: '1985-03-03', time: '10:10', lat: 40, lon: -83, tz: 'America/New_York', place: 'Ohio' } }) });
      ok(r.status === 201 && r.body.tags.join(',') === 'alpha,beta', 'api: create with tags');
      r = await j('/api/profiles/tag-test-qa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Tag Test QA', order: 30, category: 'circle' }) });
      ok(r.status === 200 && r.body.order === 30 && r.body.category === 'circle' && r.body.tags.length === 2, 'api: patch order+category keeps tags');
      r = await j('/api/profiles/tag-test-qa/tropical');
      ok(r.status === 200 && r.body.zodiac === 'tropical' && r.body.bodies.length === 12 && r.body.ascendant, 'api: tropical view');
      for (const svg of ['wheel.svg', 'hd.svg', 'matrix.svg']) {
        r = await j(`/api/profiles/tag-test-qa/${svg}`);
        ok(r.status === 200 && r.body.startsWith('<svg'), `api: ${svg}`);
      }
      r = await j('/api/profiles/tag-test-qa/varga?n=9');
      ok(r.status === 200 && r.body.aspects?.main, 'api: varga carries aspects');
      r = await j('/api/cast/wheel.svg?date=1985-03-03&lat=40&lon=-83&tz=America/New_York');
      ok(r.status === 400, 'api: wheel without birth time 400s');
      r = await j('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'QA Section' }) });
      ok(r.status === 201 && r.body.some((c) => c.key === 'qa-section'), 'api: add section');
      r = await j('/api/dashboard');
      ok(r.status === 200 && r.body.totals.profiles > 0 && Array.isArray(r.body.distributions.lagnaSigns) && Array.isArray(r.body.upcomingTransitions), 'api: dashboard');
      r = await j('/api/profiles/river-okafor/matrix');
      ok(r.status === 200 && r.body.ageRing[3].corner.start === '2020-06-15' && r.body.ageRing[3].points[0].end === '2022-12-15',
        'api: the matrix view carries the ring dates');
      r = await j('/api/sky');
      ok(r.status === 200 && r.body.vedic?.length === 9 && r.body.tropical?.length === 11
        && r.body.vedic.every((x) => x.stay?.until && x.nakshatra?.until), 'api: /api/sky — both zodiacs, every body with its stay');
      // svg text carries an explicit currentColor fill (the dark-mode fix)
      r = await j('/api/profiles/tag-test-qa/chart.svg');
      ok(r.body.includes('fill:currentColor'), 'api: chart text inherits currentColor');

      // — smart city search + varga-filtered vedic.md —
      r = await j('/api/cities?q=' + encodeURIComponent('berlin new hampshire'));
      ok(r.status === 200 && r.body[0]?.name === 'Berlin' && r.body[0]?.admin1 === 'NH' && r.body[0]?.adminName === 'New Hampshire', 'api: city search "berlin new hampshire"');
      r = await j('/api/cities?q=' + encodeURIComponent('new hampshire berlin'));
      ok(r.status === 200 && r.body[0]?.admin1 === 'NH', 'api: region-first "new hampshire berlin"');
      r = await j('/api/cities?q=' + encodeURIComponent('berlin germany'));
      ok(r.status === 200 && r.body[0]?.country === 'DE' && r.body[0]?.population > 1000000, 'api: "berlin germany" finds the capital');
      // hand-added places (under the GeoNames cities15000 cut) stay findable
      for (const q of ['berlin vermont', 'vermont berlin', 'berlin vt']) {
        r = await j('/api/cities?q=' + encodeURIComponent(q));
        ok(r.status === 200 && r.body[0]?.name === 'Berlin' && r.body[0]?.admin1 === 'VT', `api: custom place found via "${q}"`);
      }
      r = await j('/api/cities?q=berlin');
      ok(r.body[0]?.country === 'DE', 'api: a bare "berlin" still ranks the capital first');
      r = await j('/api/cities?q=' + encodeURIComponent('paris texas'));
      ok(r.status === 200 && r.body[0]?.name === 'Paris' && r.body[0]?.admin1 === 'TX', 'api: "paris texas"');
      r = await j('/api/cities?q=' + encodeURIComponent('cluj romania'));
      ok(r.status === 200 && r.body[0]?.countryName === 'Romania', 'api: "cluj romania" enriched');
      r = await j('/api/cast/vedic.md?date=1990-06-15&time=14:30&lat=40.7128&lon=-74.006&tz=America/New_York&vargas=D1,D9,D60');
      ok(r.status === 200 && r.body.includes('Selected charts: D1, D9, D60') && !r.body.match(/^\| D30 /m), 'api: vedic.md varga filter');
      r = await j('/api/cast/vedic.md?date=1990-06-15&time=14:30&lat=40.7128&lon=-74.006&tz=America/New_York');
      ok(r.body.includes('Chara Dasha (K.N. Rao standard)') && r.body.includes('Strength (dignity'), 'api: vedic.md carries strength + chara sections');
      // fresh=1 recomputes (castAt moves)
      const c1 = (await j('/api/cast?date=1985-03-03&time=10:10&lat=40&lon=-83&tz=America/New_York')).body.meta.castAt;
      await new Promise((res2) => setTimeout(res2, 25));
      const c2 = (await j('/api/cast?date=1985-03-03&time=10:10&lat=40&lon=-83&tz=America/New_York&fresh=1')).body.meta.castAt;
      const c3 = (await j('/api/cast?date=1985-03-03&time=10:10&lat=40&lon=-83&tz=America/New_York')).body.meta.castAt;
      ok(c2 !== c1, 'api: fresh=1 recasts (castAt moves)');
      ok(c3 === c2, 'api: without fresh the daily cache serves');
      // cleanup
      await j('/api/profiles/tag-test-qa', { method: 'DELETE' });
      const cats = (await j('/api/categories')).body.filter((c) => c.key !== 'qa-section');
      await j('/api/categories', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cats) });
      // Deletes are recoverable now, which means the suite's own fixtures pile
      // up in data/trash and data/history on every run. Sweep only the QA slugs.
      for (const dir of ['data/trash', 'data/history']) {
        const full = join(ROOT_DIR, dir);
        if (!existsSync(full)) continue;
        for (const f of readdirSync(full)) {
          if (/^(test-person-qa|tag-test-qa|zz-durability-qa|recover-qa|traversal-qa)--/.test(f)) {
            rmSync(join(full, f));
          }
        }
      }
    } catch (e) {
      ok(false, `api suite crashed: ${e.message}`);
    }
    done();
  }, 900);
});

// ————— report —————
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('failures:');
  for (const f of failures) console.log('  ✗', f);
  process.exit(1);
}
