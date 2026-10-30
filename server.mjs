// ============================================================
// Chart Desk — the local chart engine server.
//
// One zero-dependency node:http process:
//   · serves the utility UI (ui/)
//   · JSON API for profiles + casting (every system)
//   · Markdown exports (the LLM intake packs)
//   · SVG chart renders (North/South Indian, any varga)
//   · /llms.txt — self-describing docs for agents
//
// Binds 127.0.0.1:4700. Can be reached from another device on
// your own network (e.g. `tailscale serve` in front of it — any
// *.ts.net host is accepted by the origin gate below).
// ============================================================
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchCities } from './lib/engine/geo.js';
import { castAll, vargaView } from './lib/cast.mjs';
import {
  listProfiles, getProfile, saveProfile, deleteProfile, slugify,
  categories, saveCategories, AVATAR_COLORS, AVATAR_GLYPHS, initialsOf,
} from './lib/profiles.mjs';
import { vedicMd, hdMd, matrixMd, atlasMd, dashasMd } from './lib/md/format.mjs';
import {
  archiveMd, researchRows, researchCsv, researchMd,
  parseWhere, matchesWhere, DEFAULT_COLUMNS, SECTIONS,
} from './lib/md/bulk.mjs';
import { searchPlaces } from './lib/geo-names.mjs';
import { placements, northIndianSVG, southIndianSVG } from './lib/svg/charts.mjs';
import { wheelSVG } from './lib/svg/wheel.mjs';
import { hdGraphSVG } from './lib/svg/hdgraph.mjs';
import { matrixGraphSVG } from './lib/svg/matrixgraph.mjs';
import { skyNow } from './lib/atlas/sky.mjs';
import { aspects, aspectInputsOf, SIGNS } from './lib/engine/jyotish.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CHARTDESK_PORT ?? 4700);
const HOST = process.env.CHARTDESK_HOST ?? '127.0.0.1';
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// — cast cache (profiles change rarely; casting is ~50ms). The key
// carries the UTC date so the "current period" pointers (vimshottari
// MD/AD/PD, chara major/sub) recompute themselves daily — a
// long-running process never serves a stale "now" to the
// markdown/JSON exports. `fresh` forces it.
const cache = new Map();
function cachedCast(birth, { fresh = false } = {}) {
  const key = JSON.stringify(birth) + '|' + new Date().toISOString().slice(0, 10);
  if (fresh) cache.delete(key);
  if (cache.has(key)) return cache.get(key);
  const r = castAll(birth);
  cache.set(key, r);
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return r;
}

// — a node fetcher for the city shards on disk —
const cityFetcher = async (url) => {
  const p = join(ROOT, 'data/cities', url.split('/').pop());
  return { ok: existsSync(p), json: async () => JSON.parse(readFileSync(p, 'utf8')) };
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// NO Access-Control-Allow-Origin. It used to be '*' here, which told every
// website on the internet it could read these replies — and since the browser
// doing the reading is itself on 127.0.0.1, binding to loopback protected
// nothing. Any page in any tab could have read all 17 people's birth data.
// Nothing legitimate needs it: the UI is served from this same origin, app.js
// only fetches relative paths, and curl/agents are not subject to CORS at all.
const send = (res, code, body, type = 'application/json') => {
  const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2);
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(buf);
};
const sendMd = (res, md) => send(res, 200, md, 'text/markdown; charset=utf-8');
const notFound = (res, what = 'not found') => send(res, 404, { error: what });

// ————— who is allowed to talk to this server —————
// Two independent checks, because they stop different attacks.
//
// 1. Host allowlist. DNS rebinding does not use CORS at all: a page on
//    evil.com whose DNS flips to 127.0.0.1 reaches us with `Host: evil.com`.
//    Only the names this server is actually reachable under are accepted:
//    loopback, plus any Tailscale tailnet name (`tailscale serve` forwards
//    the `*.ts.net` Host verbatim, so a phone on the tailnet passes).
// 2. Origin must match Host when present. Browsers omit Origin on same-origin
//    GETs but always send it on POST/PATCH/DELETE, so this is what actually
//    stops a visited page from deleting or silently editing a profile. curl,
//    agent scripts and the Mac app send no Origin and are unaffected.
const LOOPBACK_HOSTS = new Set([
  `127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`,
  `127.0.0.1`, `localhost`,
]);
const TAILNET_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net(:\d+)?$/i;

export function originAllowed(req) {
  const host = String(req.headers.host ?? '');
  if (!LOOPBACK_HOSTS.has(host) && !TAILNET_HOST.test(host)) return false;
  const origin = req.headers.origin;
  if (!origin || origin === 'null') return !origin;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function readBody(req) {
  // Content-Type is checked, not just parsed: a `text/plain` POST is a CORS
  // "simple request" that never triggers a preflight, so without this a visited
  // page could still reach the write routes by mislabelling its body.
  const ct = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (ct && ct !== 'application/json') {
    throw new Error('bad Content-Type: application/json required');
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new Error('bad request: body too large');
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('bad request: body is not valid JSON'); }
}

// — birth from query params (ad-hoc casting) —
function birthFromQuery(q) {
  // Only coerce a coordinate that was actually supplied. `Number(null)` and
  // `Number('')` are both 0, and 0 is a valid-looking latitude — so a request
  // that simply omitted lat/lon used to come back 200 with a complete chart for
  // 0°N 0°E in the Gulf of Guinea, a different ascendant, and an EMPTY caveats
  // list. This is the agent-facing endpoint: an LLM that drops one parameter
  // must get an error, not a fabricated chart.
  const num = (k) => (q.has(k) && q.get(k) !== '' ? Number(q.get(k)) : undefined);
  const lat = num('lat');
  const lon = num('lon');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('lat and lon are required numbers (the birth place anchors the houses)');
  }
  if (Math.abs(lat) > 90) throw new Error('bad lat: out of range (-90..90)');
  if (Math.abs(lon) > 180) throw new Error('bad lon: out of range (-180..180)');
  return {
    date: q.get('date'),
    time: q.get('time') || null,
    timeUnknown: q.get('timeUnknown') === '1' || !q.get('time'),
    lat,
    lon,
    tz: q.get('tz'),
    place: q.get('place') ?? undefined,
  };
}

/**
 * Resolve a cohort from the query: category, tag, explicit slugs, and `where`
 * placement terms. Returns the cast rows plus a human-readable scope line that
 * goes into the export header, so an archive always says what it is.
 * A profile that fails to cast is skipped, never fatal — one broken record must
 * not deny her the other sixteen.
 */
function selectCohort(q) {
  const category = q.get('category') || null;
  const tag = q.get('tag') || null;
  const slugs = q.get('slugs')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
  const terms = parseWhere(q.get('where'));

  let profiles = listProfiles();
  if (slugs) profiles = profiles.filter((p) => slugs.includes(p.slug));
  if (category) profiles = profiles.filter((p) => p.category === category);
  if (tag) profiles = profiles.filter((p) => (p.tags ?? []).includes(tag));

  const rows = [];
  const skipped = [];
  for (const profile of profiles) {
    let cast;
    // Failing soft is right — one broken record must not deny her the rest —
    // but a silent drop makes an export quietly undercount the cohort. Collect
    // the skipped so the header can name them rather than hiding them.
    try { cast = cachedCast(profile.birth); } catch (e) { skipped.push({ name: profile.name, reason: e.message }); continue; }
    if (terms.length && !matchesWhere(cast, terms)) continue;
    rows.push({ profile, cast });
  }
  const scope = [
    slugs ? `${slugs.length} named` : null,
    category ? `section ${category}` : null,
    tag ? `tag ${tag}` : null,
    q.get('where') ? `where ${q.get('where')}` : null,
  ].filter(Boolean).join(' · ');
  return { rows, scope, skipped };
}

// ————— bulk import: the collaborative write layer —————
// The counterpart to bulk export: point an agent at a .md of scraped names +
// birth details and let it add them all in one call. A place NAME is geocoded
// here (top hit) so the agent needs no coordinates; explicit lat/lon/tz win.
function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

async function resolveBirthPlace(person, fetcher) {
  const lat = Number(person.lat), lon = Number(person.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon) && person.tz) {
    return { lat, lon, tz: person.tz, place: person.place ?? `${lat}, ${lon}` };
  }
  if (person.place) {
    const hits = await searchPlaces(String(person.place), fetcher, 1);
    if (hits.length) {
      const c = hits[0];
      const label = [c.name, c.adminName, c.countryName].filter(Boolean).join(', ');
      return { lat: c.lat, lon: c.lon, tz: c.tz, place: label };
    }
  }
  return null;
}

async function importPeople(body, fetcher) {
  const people = Array.isArray(body?.people) ? body.people : [];
  const defCategory = body?.category || null;
  const defTags = Array.isArray(body?.tags) ? body.tags : [];
  const onExisting = body?.onExisting === 'update' ? 'update' : 'skip';
  const dryRun = !!body?.dryRun;
  const out = { dryRun, created: [], updated: [], skipped: [], errors: [] };
  if (!people.length) { out.errors.push({ name: null, reason: 'body.people must be a non-empty array' }); return out; }

  for (const person of people) {
    const name = String(person?.name ?? '').trim();
    if (!name) { out.errors.push({ name: person?.name ?? null, reason: 'name is required' }); continue; }
    if (!isRealDate(person?.date)) { out.errors.push({ name, reason: `date must be a real YYYY-MM-DD (got ${JSON.stringify(person?.date)})` }); continue; }

    const geo = await resolveBirthPlace(person, fetcher);
    if (!geo) { out.errors.push({ name, reason: person?.place ? `could not resolve place "${person.place}"` : 'need a place name, or lat + lon + tz' }); continue; }

    const slug = slugify(name);
    const existing = getProfile(slug);
    if (existing && onExisting === 'skip') { out.skipped.push({ name, slug, reason: 'already exists (onExisting=skip)' }); continue; }

    const tags = [...new Set([...defTags, ...(Array.isArray(person.tags) ? person.tags : [])].map((t) => String(t).trim()).filter(Boolean))];
    const time = person.time || null;
    const profile = {
      name,
      category: person.category || defCategory || 'other',
      tags,
      notes: person.notes ?? undefined,
      birth: { date: person.date, time, timeUnknown: !!person.timeUnknown || !time, lat: geo.lat, lon: geo.lon, tz: geo.tz, place: geo.place },
    };
    const bucket = existing ? out.updated : out.created;
    if (dryRun) { bucket.push({ name, slug, category: profile.category, tags, birth: profile.birth }); continue; }
    try {
      saveProfile(profile, { isNew: !existing });
      bucket.push({ name, slug, category: profile.category, tags, place: geo.place });
    } catch (e) { out.errors.push({ name, reason: e.message }); }
  }
  return out;
}

const MD_VIEWS = {
  'vedic.md': vedicMd, 'human-design.md': hdMd, 'matrix.md': matrixMd, 'atlas.md': atlasMd,
  'dashas.md': dashasMd,
};
const JSON_VIEWS = {
  chart: (c) => c,
  vedic: (c) => c.vedic,
  nakshatras: (c) => c.nakshatras,
  panchanga: (c) => c.panchanga,
  'human-design': (c) => c.hd ?? { note: 'needs birth time' },
  matrix: (c) => c.matrix,
};

function chartSvg(cast, q) {
  const style = q.get('style') === 'south' ? 'south' : 'north';
  const n = Number(q.get('varga') ?? 1);
  const pl = placements(cast.vedic, n, { outers: q.get('outers') === '1', timeUnknown: cast.meta.timeUnknown });
  const opts = { standalone: q.get('standalone') === '1', size: Number(q.get('size') ?? 460) };
  return style === 'south' ? southIndianSVG(pl, opts) : northIndianSVG(pl, opts);
}

const SVG_VIEWS = {
  'chart.svg': (cast, q) => chartSvg(cast, q),
  'wheel.svg': (cast, q) => {
    if (cast.meta.timeUnknown || !cast.tropical.ascendant) throw new Error('wheel needs a birth time (the ascendant anchors it)');
    return wheelSVG(
      {
        ascLon: cast.tropical.ascendant.lon,
        mcLon: cast.tropical.mc.lon,
        bodies: cast.tropical.bodies,
        aspects: cast.vedic.aspects, // zodiac-independent — same angular relations
      },
      { standalone: q.get('standalone') === '1' },
    );
  },
  'hd.svg': (cast, q) => hdGraphSVG(cast.hd, { standalone: q.get('standalone') === '1' }),
  'matrix.svg': (cast, q) => matrixGraphSVG(cast.matrix, { standalone: q.get('standalone') === '1' }),
};

// sign → element (index % 4): the classical fire · earth · air · water cycle
const ELEMENT_OF = ['fire', 'earth', 'air', 'water'];
const SIGN_INDEX = Object.fromEntries(SIGNS.map((s, i) => [s, i]));
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The desk's own statistics, optionally scoped to one section or tag.
 * Rows carry the sign(s) they involve so the UI can glyph and
 * element-color them (Magha → ♌ fire, Revati → ♓ water, …).
 */
function dashboardData({ category = null, tag = null } = {}) {
  const cats = categories();
  const all = listProfiles();
  const profiles = all.filter((p) =>
    (!category || p.category === category) && (!tag || (p.tags ?? []).includes(tag)));
  const casts = [];
  for (const p of profiles) {
    try { casts.push({ p, c: cachedCast(p.birth) }); } catch { /* a broken record never takes the desk down */ }
  }

  // rows: { key, count, signs[] } — signs drive the glyph + element color
  const rows = (list) => {
    const m = new Map();
    for (const it of list) {
      if (!it?.key) continue;
      if (!m.has(it.key)) m.set(it.key, { key: it.key, count: 0, signs: new Set() });
      const e = m.get(it.key);
      e.count++;
      if (it.sign) e.signs.add(it.sign);
    }
    return [...m.values()]
      .map((e) => ({ key: e.key, count: e.count, signs: [...e.signs] }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };
  const bySign = (name) => (name ? { key: name, sign: name } : null);
  const moonOf = ({ c }) => c.vedic.planets.find((x) => x.body === 'moon');
  const sunOf = ({ c }) => c.vedic.planets.find((x) => x.body === 'sun');

  const now = new Date();
  const horizon = new Date(now.getTime() + 366 * 86400e3);
  const transitions = [];
  for (const { p, c } of casts) {
    for (const md of c.vedic.dashas) {
      const s = new Date(md.start);
      if (s > now && s <= horizon) transitions.push({ name: p.name, slug: p.slug, kind: 'MD', to: md.lord, date: md.start });
      for (const ad of md.antardashas) {
        const as = new Date(ad.start);
        if (as > now && as <= horizon) transitions.push({ name: p.name, slug: p.slug, kind: 'AD', to: `${md.lord}/${ad.lord}`, date: ad.start });
      }
    }
  }
  transitions.sort((a, b) => new Date(a.date) - new Date(b.date));

  // next birthdays inside a year
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const birthdays = profiles
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.birth?.date ?? ''))
    .map((p) => {
      const [by, bm, bd] = p.birth.date.split('-').map(Number);
      let next = new Date(Date.UTC(today.getUTCFullYear(), bm - 1, bd));
      if (next < today) next = new Date(Date.UTC(today.getUTCFullYear() + 1, bm - 1, bd));
      return {
        slug: p.slug, name: p.name, avatar: p.avatar,
        date: next.toISOString().slice(0, 10),
        turns: next.getUTCFullYear() - by,
        inDays: Math.round((next - today) / 86400e3),
      };
    })
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, 8);

  const lite = (p) => ({ slug: p.slug, name: p.name, category: p.category, avatar: p.avatar, tags: p.tags ?? [], created: p.created });
  const tagCounts = rows(all.flatMap((p) => (p.tags ?? []).map((t) => ({ key: t }))));

  return {
    scope: { category, tag, count: profiles.length, of: all.length },
    totals: {
      profiles: profiles.length,
      byCategory: cats.map((c) => ({ ...c, count: all.filter((p) => p.category === c.key).length })),
      tags: tagCounts,
      timeUnknown: profiles.filter((p) => p.birth?.timeUnknown).length,
    },
    recent: [...profiles].sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 6).map(lite),
    distributions: {
      lagnaSigns: rows(casts.map((e) => (e.c.meta.timeUnknown ? null : bySign(e.c.vedic.ascendant.signName)))),
      moonSigns: rows(casts.map((e) => bySign(moonOf(e).signName))),
      sunSigns: rows(casts.map((e) => bySign(sunOf(e).signName))),
      // a nakshatra carries the sign(s) its holders' Moons actually sit in
      moonNakshatras: rows(casts.map((e) => ({ key: e.c.nakshatras.moon.name, sign: moonOf(e).signName }))),
      ketuNakshatras: rows(casts.map((e) => ({ key: e.c.nakshatras.ketu.name, sign: e.c.vedic.nodes.ketu.signName }))),
      moonElements: rows(casts.map((e) => {
        const s = moonOf(e).signName;
        return { key: cap1(ELEMENT_OF[SIGN_INDEX[s] % 4]), sign: s };
      })),
      hdTypes: rows(casts.map((e) => ({ key: e.c.hd?.type }))),
      hdProfiles: rows(casts.map((e) => ({ key: e.c.hd?.profile?.label }))),
      runningMD: rows(casts.map((e) => {
        const now = new Date();
        const md = e.c.vedic.dashas?.find((m) => now >= new Date(m.start) && now < new Date(m.end));
        return { key: md?.lord };
      })),
      charaSigns: rows(casts.map((e) => bySign(e.c.jaimini?.charaDasha?.current?.major?.signName))),
      vargottama: rows(casts.flatMap((e) =>
        (e.c.jaimini?.strength?.bodies ?? []).filter((b) => b.vargottama).map((b) => ({ key: cap1(b.body), sign: b.signName })))),
      dignities: rows(casts.flatMap((e) =>
        (e.c.jaimini?.strength?.bodies ?? [])
          .filter((b) => ['exalted', 'debilitated'].includes(b.dignity?.state))
          .map((b) => ({ key: `${cap1(b.body)} ${b.dignity.state}`, sign: b.signName })))),
      moonPurushartha: rows(casts.map((e) => ({ key: e.c.nakshatras.moon.purushartha, sign: moonOf(e).signName }))),
    },
    upcomingTransitions: transitions.slice(0, 12),
    birthdays,
  };
}

const server = createServer(async (req, res) => {
  // Inside the try: a malformed Host or request line makes new URL() throw, and
  // out here that was an uncaught exception — which under launchd KeepAlive is a
  // respawn, not an error page. One bad request could take the desk down.
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    return send(res, 400, { error: 'bad request line or Host header' });
  }
  const path = url.pathname;
  const q = url.searchParams;

  try {
    // A bare 204 with no CORS headers: the browser then refuses the cross-origin
    // request it was asking permission for. Previously this said yes to DELETE
    // and PATCH from anywhere, so a visited page could wipe or silently edit
    // every profile — and a four-minute birth-time edit moves the ascendant.
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      return res.end();
    }

    // Defence in depth behind the two rules above, and the only thing that stops
    // DNS rebinding (which does not use CORS at all): a request that carries a
    // foreign Origin, or claims a Host that is not this server, never reaches a
    // handler. Same-origin fetches from the app send no Origin header; curl and
    // the Mac app send neither, so both are unaffected.
    if (!originAllowed(req)) {
      return send(res, 403, { error: 'cross-origin request refused' });
    }

    // ————— agent-facing docs —————
    if (path === '/llms.txt' || path === '/api' || path === '/api/') {
      const doc = readFileSync(join(ROOT, 'llms.txt'), 'utf8');
      return send(res, 200, doc, 'text/plain; charset=utf-8');
    }

    if (path === '/api/health') {
      return send(res, 200, { ok: true, app: 'chart-desk', version: VERSION, profiles: listProfiles().length });
    }

    // ————— cities (smart: city + state + country, any order) —————
    if (path === '/api/cities') {
      const hits = await searchPlaces(q.get('q') ?? '', cityFetcher, Number(q.get('limit') ?? 12));
      return send(res, 200, hits);
    }

    // ————— categories —————
    if (path === '/api/categories') {
      if (req.method === 'PUT') {
        const list = await readBody(req);
        if (!Array.isArray(list)) return send(res, 400, { error: 'want an array of {key,label,order}' });
        saveCategories(list);
        return send(res, 200, list);
      }
      if (req.method === 'POST') {
        const { label } = await readBody(req);
        if (!label?.trim()) return send(res, 400, { error: 'label is required' });
        const list = categories();
        const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
        if (list.some((c) => c.key === key)) return send(res, 400, { error: `section '${key}' already exists` });
        list.push({ key, label: label.trim(), order: Math.max(0, ...list.map((c) => c.order)) + 1 });
        saveCategories(list);
        return send(res, 201, list);
      }
      return send(res, 200, categories());
    }

    // ————— dashboard —————
    if (path === '/api/dashboard') {
      return send(res, 200, dashboardData({ category: q.get('category'), tag: q.get('tag') }));
    }

    // ————— the sky right now: both zodiacs, each body's stay —————
    if (path === '/api/sky') {
      return send(res, 200, skyNow());
    }

    // ————— bulk export: many people at once —————
    // /api/archive.md  — one master file, chosen sections per person
    // /api/research.md — one ROW per person, chosen columns + a distribution
    // /api/research.csv— the same table for a spreadsheet
    // All three take the same cohort filter: category, tag, explicit slugs, and
    // `where` (placement terms), so a nakshatra cohort can be gathered directly.
    if (path === '/api/archive.md' || path === '/api/research.md' || path === '/api/research.csv') {
      const { rows, scope, skipped } = selectCohort(q);
      if (!rows.length) return send(res, 404, { error: `no profiles match: ${scope || 'everyone'}` });
      const list = (k) => q.get(k)?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
      if (path === '/api/archive.md') {
        return sendMd(res, archiveMd(rows, {
          sections: list('sections') ?? ['vedic'],
          vargas: list('vargas'),
          scope, skipped,
        }));
      }
      const table = researchRows(rows, { columns: list('columns') ?? DEFAULT_COLUMNS });
      if (path === '/api/research.csv') {
        return send(res, 200, researchCsv(table), 'text/csv; charset=utf-8');
      }
      return sendMd(res, researchMd(table, { scope, skipped, tally: q.get('tally') !== '0' }));
    }

    // ————— avatar options (for the UI) —————
    if (path === '/api/avatar-options') {
      return send(res, 200, { colors: AVATAR_COLORS, glyphs: AVATAR_GLYPHS });
    }

    // ————— ad-hoc casting —————
    if (path.startsWith('/api/cast')) {
      const birth = birthFromQuery(q);
      const cast = cachedCast(birth, { fresh: q.get('fresh') === '1' });
      const rest = path.slice('/api/cast'.length).replace(/^\//, '');
      if (!rest || rest === 'chart') return send(res, 200, cast);
      if (SVG_VIEWS[rest]) return send(res, 200, SVG_VIEWS[rest](cast, q), 'image/svg+xml');
      if (rest === 'vedic.md') return sendMd(res, vedicMd(cast, { name: q.get('name') ?? undefined }, { vargas: q.get('vargas')?.split(',').filter(Boolean) ?? null }));
      if (MD_VIEWS[rest]) return sendMd(res, MD_VIEWS[rest](cast, { name: q.get('name') ?? undefined }));
      if (JSON_VIEWS[rest]) return send(res, 200, JSON_VIEWS[rest](cast));
      return notFound(res, `unknown cast view '${rest}'`);
    }

    // ————— profiles —————
    if (path === '/api/profiles' && req.method === 'GET') {
      const cats = categories();
      const list = listProfiles().map((p) => ({
        ...p,
        initials: initialsOf(p.name),
        categoryLabel: cats.find((c) => c.key === p.category)?.label ?? p.category,
      }));
      return send(res, 200, list);
    }
    if (path === '/api/profiles' && req.method === 'POST') {
      const body = await readBody(req);
      const p = saveProfile(body, { isNew: true });
      return send(res, 201, p);
    }

    // bulk import — add many people at once from scraped/collected details
    if (path === '/api/profiles/import' && req.method === 'POST') {
      const result = await importPeople(await readBody(req), cityFetcher);
      const wroteNothing = !result.created.length && !result.updated.length;
      return send(res, wroteNothing && result.errors.length ? 422 : 200, result);
    }

    const pm = path.match(/^\/api\/profiles\/([a-z0-9-]+)(?:\/(.*))?$/);
    if (pm) {
      const [, slug, view] = pm;
      const profile = getProfile(slug);
      if (!profile) return notFound(res, `no profile '${slug}'`);

      if (!view) {
        if (req.method === 'GET') return send(res, 200, profile);
        if (req.method === 'PATCH') return send(res, 200, saveProfile({ ...(await readBody(req)), slug }));
        if (req.method === 'DELETE') { deleteProfile(slug); return send(res, 200, { deleted: slug }); }
      }

      const cast = cachedCast(profile.birth, { fresh: q.get('fresh') === '1' });
      if (SVG_VIEWS[view]) return send(res, 200, SVG_VIEWS[view](cast, q), 'image/svg+xml');
      if (view === 'varga') {
        const n = Number(q.get('n') ?? 9);
        const vc = vargaView(cast.vedic, n);
        vc.aspects = aspects(aspectInputsOf(vc));
        return send(res, 200, vc);
      }
      if (view === 'tropical') return send(res, 200, cast.tropical);
      if (view === 'vedic.md') return sendMd(res, vedicMd(cast, profile, { vargas: q.get('vargas')?.split(',').filter(Boolean) ?? null }));
      if (MD_VIEWS[view]) return sendMd(res, MD_VIEWS[view](cast, profile));
      if (JSON_VIEWS[view]) return send(res, 200, JSON_VIEWS[view](cast));
      return notFound(res, `unknown view '${view}'`);
    }

    // ————— static UI —————
    let file = path === '/' ? '/index.html' : path;
    const fp = normalize(join(ROOT, 'ui', file));
    if (fp.startsWith(join(ROOT, 'ui')) && existsSync(fp) && statSync(fp).isFile()) {
      return send(res, 200, readFileSync(fp), MIME[extname(fp)] ?? 'application/octet-stream');
    }

    return notFound(res);
  } catch (e) {
    // "not computed" = an unsupported varga was asked for. That is a bad
    // request, not a server fault — and agents retry 500s, so it has to be 4xx.
    // A bad time zone is user input too — it was 500ing, and agents retry 500s.
    const code = /required|bad |want |out of range|already exists|needs a birth time|not computed|Invalid time zone/i
      .test(e.message) ? 400 : 500;
    return send(res, code, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`chart-desk v${VERSION} listening on http://${HOST}:${PORT}`);
  // find every body's sign edges once (~0.3 s) so the first dashboard doesn't wait
  setTimeout(() => {
    try { skyNow(); } catch (e) { console.error('sky warm-up:', e.message); }
  }, 100);
});
