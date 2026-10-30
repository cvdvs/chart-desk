// ============================================================
// Profiles — the people layer. One JSON file per person under
// data/profiles/, grouped by category, each with a small
// customizable avatar. Plain files on purpose: any agent (or
// an operator) can read and write them directly; the server reads
// fresh from disk on every request, so out-of-band edits are
// picked up immediately.
// ============================================================
import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIR = join(ROOT, 'data/profiles');
const CATS = join(ROOT, 'data/categories.json');
const TRASH = join(ROOT, 'data/trash');
const HISTORY = join(ROOT, 'data/history');

// ————— nothing here is ever unrecoverable —————
// These files are the only copy of ~17 real people's birth data: no git, no
// .bak, and a delete used to be unlinkSync — gone, not even in the Trash. What
// is lost is never the chart (recomputable) but the date, time, coordinates,
// timezone and the provenance note, which for a client or a rectified time
// cannot be reconstructed. So: a delete moves the file aside, and every save
// keeps the version it replaced. Both are plain JSON on disk — recovery is a
// `mv` away, and neither needs anything running.
// Deliberately never pruned. A profile is ~1KB, so even hundreds of edits stay
// under a megabyte — and expiring the history would reintroduce exactly the
// unrecoverable delete this exists to prevent.
let backupSeq = 0;
function keepCopy(dir, slug, body) {
  try {
    mkdirSync(dir, { recursive: true });
    // The timestamp is millisecond-resolution, so a double-click on Save or two
    // agent edits in the same millisecond would collide and the second copy
    // would overwrite the first — losing the exact version this exists to keep.
    // A short monotonic suffix makes every backup filename unique.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const seq = String((backupSeq = (backupSeq + 1) % 1000)).padStart(3, '0');
    writeFileSync(join(dir, `${slug}--${stamp}-${seq}.json`), body);
  } catch { /* a failed backup must never block the write itself */ }
}

const DEFAULT_CATEGORIES = [
  { key: 'circle', label: 'Personal Circle', order: 1 },
  { key: 'clients', label: 'Clients', order: 2 },
  { key: 'research', label: 'Research', order: 3 },
  { key: 'other', label: 'Other', order: 4 },
];

/** Avatar palette + glyph set — the light customization layer. */
export const AVATAR_COLORS = [
  '#5B8DEF', '#E86A5E', '#E8A33D', '#57A773', '#8B6FC9',
  '#D96CA4', '#3FA7A3', '#A38A5F', '#6B7A8F', '#C25B4E',
];
export const AVATAR_GLYPHS = ['☉', '☽', '☿', '♀', '♂', '♃', '♄', '☊', '☋', '✶', '◇', '❋'];

export function slugify(name) {
  return String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'person';
}

function defaultAvatar(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return {
    color: AVATAR_COLORS[h % AVATAR_COLORS.length],
    glyph: null, // null → initials
    shape: ['circle', 'squircle', 'diamond', 'hex'][h % 4],
  };
}

export function initialsOf(name) {
  return String(name)
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('') || '?';
}

export function categories() {
  if (!existsSync(CATS)) return DEFAULT_CATEGORIES;
  try {
    return JSON.parse(readFileSync(CATS, 'utf8'));
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export function saveCategories(list) {
  mkdirSync(dirname(CATS), { recursive: true });
  writeFileSync(CATS, JSON.stringify(list, null, 2));
}

export function listProfiles() {
  mkdirSync(DIR, { recursive: true });
  const out = [];
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(readFileSync(join(DIR, f), 'utf8')));
    } catch {
      /* a malformed file never takes the list down */
    }
  }
  out.sort((a, b) =>
    (a.order ?? Infinity) - (b.order ?? Infinity)
    || String(a.name ?? '').localeCompare(String(b.name ?? '')));   // a nameless record must not 500 the desk
  return out;
}

// Every slug that reaches a filesystem path goes through here. The route's own
// `[a-z0-9-]+` pattern only ever guarded the URL, so `POST /api/profiles` with a
// body slug of `../../…` resolved outside data/profiles/ and wrote a .json file
// anywhere the user could write. Validate at the write, not at the door.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
function assertSlug(slug) {
  if (!SLUG_RE.test(slug)) throw new Error(`bad slug '${slug}': want [a-z0-9-], 1-60 chars`);
  return slug;
}

export function getProfile(slug) {
  if (!SLUG_RE.test(String(slug))) return null;   // never build a path from an unchecked slug
  const p = join(DIR, `${slug}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

/**
 * Create or update. `birth` needs date/lat/lon/tz (time optional →
 * noon-cast). Avatar fields merge over the generated default.
 */
export function saveProfile(input, { isNew = false } = {}) {
  if (!input?.name) throw new Error('name is required');
  const slug = assertSlug(input.slug || slugify(input.name));
  const existing = getProfile(slug);
  if (isNew && existing) throw new Error(`profile '${slug}' already exists`);

  const profile = {
    slug,
    name: input.name,
    category: input.category || existing?.category || 'other',
    tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t).trim()).filter(Boolean) : existing?.tags ?? [],
    order: typeof input.order === 'number' ? input.order : existing?.order ?? null,
    birth: { ...existing?.birth, ...input.birth },
    avatar: { ...defaultAvatar(input.name), ...existing?.avatar, ...input.avatar },
    notes: input.notes ?? existing?.notes ?? '',
    created: existing?.created ?? new Date().toISOString(),
    updated: new Date().toISOString(),
  };
  const b = profile.birth;
  if (!b?.date) throw new Error('birth.date (YYYY-MM-DD) is required');
  if (typeof b.lat !== 'number' || typeof b.lon !== 'number' || !b.tz)
    throw new Error('birth.lat, birth.lon (numbers) and birth.tz (IANA zone) are required');
  b.timeUnknown = !!b.timeUnknown || !b.time;

  mkdirSync(DIR, { recursive: true });
  const path = join(DIR, `${slug}.json`);
  if (existsSync(path)) keepCopy(HISTORY, slug, readFileSync(path));   // the version being replaced
  writeFileSync(path, JSON.stringify(profile, null, 2));
  return profile;
}

export function deleteProfile(slug) {
  assertSlug(String(slug));
  const p = join(DIR, `${slug}.json`);
  if (!existsSync(p)) return false;
  mkdirSync(TRASH, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  renameSync(p, join(TRASH, `${slug}--${stamp}.json`));   // recoverable with a mv
  return true;
}
