// Chart Desk UI — vanilla JS, no build step. Talks to the local API.
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
};
const api = async (path, opts) => {
  const r = await fetch(path, opts);
  const ct = r.headers.get('content-type') ?? '';
  const body = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body;
};
const toast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 1900);
};

const PLANET_LABELS = { sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto', rahu: 'Rahu', ketu: 'Ketu', asc: 'Ascendant', mc: 'MC' };
// — the sky's own colors: signs by element, bodies by graha —
const SIGN_LIST = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const SIGN_GLYPHS = ['♈︎', '♉︎', '♊︎', '♋︎', '♌︎', '♍︎', '♎︎', '♏︎', '♐︎', '♑︎', '♒︎', '♓︎'];
const ELEMENTS = ['fire', 'earth', 'air', 'water'];
const ELEMENT_COLOR = { fire: '#C0533F', earth: '#58864A', air: '#C79A3B', water: '#4A7FB5' };
const signIdx = (name) => SIGN_LIST.indexOf(name);
const signGlyph = (name) => SIGN_GLYPHS[signIdx(name)] ?? '';
const signElement = (name) => ELEMENTS[signIdx(name) % 4];
const signColor = (name) => ELEMENT_COLOR[signElement(name)] ?? 'var(--ink-3)';
// the one face that actually carries the astrological codepoints as TEXT
// (verified per-glyph against the installed fonts) — used anywhere a symbol
// is drawn, so nothing silently falls back to a color-emoji face
const SYMBOL_FONT = "'Apple Symbols','Segoe UI Symbol','DejaVu Sans',serif";
const PLANET_GLYPH = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄', rahu: '☊', ketu: '☋' };
const PLANET_COLOR = {
  sun: '#C79A3B', moon: '#8FA6C4', mercury: '#58864A', venus: '#C97FA8', mars: '#C0533F',
  jupiter: '#C9793B', saturn: '#4A5568', rahu: '#6B5B95', ketu: '#8B6F47',
};

// place display — the API enriches hits with adminName/countryName
const placeRegion = (c) => [c.adminName, c.countryName ?? c.country].filter(Boolean).join(' · ');
const placeLabel = (c) => [c.name, c.adminName, c.countryName ?? c.country].filter(Boolean).join(', ');
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const dms = (d) => `${Math.floor(d)}°${String(Math.floor((d % 1) * 60)).padStart(2, '0')}′`;
const dt = (d) => new Date(d).toISOString().slice(0, 10);

// ————— state —————
const S = { profiles: [], cats: [], sel: null, tab: 'vedic', cast: null, castSlug: null, mountedSlug: null, paneEl: null, tabsEl: null, filter: '', avatarOpts: null };
const store = {
  get: (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

// ————— avatar —————
function avatarSVG(p, size = 34) {
  const a = p.avatar ?? {};
  const color = a.color ?? '#8b8894';
  const ink = a.ink ?? '#ffffff';
  const label = a.glyph || p.initials || (p.name ?? '?').split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2);
  const shapes = {
    circle: `<circle cx="17" cy="17" r="16"/>`,
    squircle: `<rect x="1.5" y="1.5" width="31" height="31" rx="9"/>`,
    diamond: `<path d="M17 1 L33 17 L17 33 L1 17 Z"/>`,
    hex: `<path d="M17 1.5 L30.5 9.25 V24.75 L17 32.5 L3.5 24.75 V9.25 Z"/>`,
  };
  const fs = a.glyph ? 16 : 12;
  // Georgia carries NONE of the astro symbols — every glyph fell back to
  // whatever the system picked (color emoji for ♀/♂), and canvas measured
  // a different face than SVG painted, so the centering drifted too.
  // One symbol stack for both the measurement and the render.
  const family = a.glyph ? SYMBOL_FONT : 'ui-monospace,Menlo,monospace';
  // Center with SVG's own dominant-baseline rather than a canvas measurement.
  // The old inkCenter() measured the glyph's ink box with measureText, cached
  // the offset — and at boot the symbol font often had not loaded yet, so the
  // glyph avatars (☉ ♂ ✶) were measured against a fallback face and cached
  // mis-centered for the whole session. The initials (a monospace font, always
  // ready) looked fine, which is why only the glyph people drifted. This is
  // font-timing-proof: the renderer does the centering, no JS measurement.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Dead-centre on (17,17); no stroke (the old outline made the glyphs look heavy
  // and slightly off). Glyphs read fine at their natural weight; initials keep a
  // little weight so two letters stay legible at 12px.
  const weight = a.glyph ? 400 : 650;
  const el = h('span');
  el.innerHTML = `<svg viewBox="0 0 34 34" style="display:block;flex:none;width:${size}px;height:${size}px">
    <g fill="${esc(color)}">${shapes[a.shape ?? 'circle'] ?? shapes.circle}</g>
    <text x="17" y="17" text-anchor="middle" dominant-baseline="central"
      font-family="${family}" font-size="${fs}" fill="${esc(ink)}"
      font-weight="${weight}">${esc(label)}</text></svg>`;
  return el.firstChild;
}
// (avatarSVG now centers via SVG dominant-baseline; the old canvas ink-metric
// helper was removed — it cached wrong offsets when the symbol font loaded late.)

// ————— PNG export (client-side svg → canvas) —————
async function downloadPNG(svgEl, filename, { transparent = false, scale = 2 } = {}) {
  const clone = svgEl.cloneNode(true);
  const ink = transparent ? getComputedStyle(svgEl).color : '#1c1b22';
  clone.style.color = ink;
  // resolve var(--panel) fills for canvas rendering
  const panel = transparent ? 'rgba(0,0,0,0)' : '#ffffff';
  clone.querySelectorAll('[fill^="var("]').forEach((n) => n.setAttribute('fill', panel));
  // resolve var(--bg) text halos the same way (SVG-as-image sees no app CSS)
  clone.querySelectorAll('text').forEach((n) => {
    if ((n.getAttribute('style') || '').includes('var(--bg')) n.setAttribute('style', n.getAttribute('style').replace(/var\(--bg[^)]*\)/g, panel === 'rgba(0,0,0,0)' ? 'rgba(0,0,0,0)' : '#ffffff'));
  });
  const vb = clone.viewBox.baseVal;
  // iOS Safari refuses canvases past ~16.7M pixels — clamp so the big
  // plates still export on the phone instead of failing silently
  const s = Math.min(scale, Math.sqrt(15.5e6 / ((vb?.width || 460) * (vb?.height || 460))));
  const w = Math.round((vb?.width || 460) * s), hgt = Math.round((vb?.height || 460) * s);
  clone.setAttribute('width', w); clone.setAttribute('height', hgt);
  const blobUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  const img = new Image();
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = blobUrl; });
  const canvas = h('canvas', { width: w, height: hgt });
  const ctx = canvas.getContext('2d');
  if (!transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, hgt); }
  ctx.drawImage(img, 0, 0, w, hgt);
  URL.revokeObjectURL(blobUrl);
  const a = h('a', { href: canvas.toDataURL('image/png'), download: filename });
  a.click();
}
// ————— lightbox (click any chart → full-screen) —————
function openLightbox(svgEl) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.removeAttribute('width');
  clone.removeAttribute('height');
  clone.style.width = '100%';
  clone.style.height = '100%';
  const box = h('div', {
    class: 'lightbox',
    onclick: () => { box.remove(); document.removeEventListener('keydown', onEsc); },
  }, h('div', { class: 'lightbox-inner' }, clone));
  const onEsc = (e) => { if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);
  $('#modal-root').append(box);
}
function zoomable(holder) {
  holder.classList.add('zoomable');
  holder.title = 'Click to enlarge';
  holder.addEventListener('click', () => openLightbox(holder.querySelector('svg')));
  return holder;
}

function pngButtons(getSvgEl, base) {
  return h('span', { style: 'display:inline-flex;gap:6px' },
    h('button', { class: 'btn sm', title: 'White background', onclick: () => { const s = getSvgEl(); if (s) downloadPNG(s, `${base}.png`, { scale: 3 }); } }, 'PNG ⤓'),
    h('button', { class: 'btn sm', title: 'Transparent, current theme ink', onclick: () => { const s = getSvgEl(); if (s) downloadPNG(s, `${base}-transparent.png`, { transparent: true, scale: 3 }); } }, 'PNG ⌀'),
  );
}
async function svgElFromUrl(url) {
  const text = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  return doc.documentElement;
}
async function downloadPNGFromUrl(url, filename) {
  try {
    // 3× (pixel-clamped in downloadPNG) — the plates carry 8–11px labels,
    // and 2× left them soft once zoomed
    await downloadPNG(await svgElFromUrl(url), filename, { scale: 3 });
    toast('Saved ' + filename);
  } catch (e) { toast('PNG failed: ' + e.message); }
}
function downloadText(text, filename, mime = 'text/markdown') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
// PDF: title page header + optional chart image + the markdown text, paginated
// The PDF's built-in fonts stop at the Western character set, and one character
// past it makes jsPDF print the WHOLE line as spaced-out garbage that runs off the
// page. So those become plain stand-ins first; accented letters keep their base.
const PDF_OFF_FONT = /[^\x00-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/gu;
const PDF_SWAP = { '′': "'", '→': '->', '←': '<-', '↔': '<->', '−': '-', '●': '*', '○': 'o', '★': '*', '♥': 'love', '≈': '~', '≠': 'is not', '⚠': '!' };
const pdfText = (s) => String(s)
  .replace(PDF_OFF_FONT, (c) => PDF_SWAP[c] ?? c.normalize('NFD').replace(/\p{M}/gu, ''))
  .replace(PDF_OFF_FONT, '?');

async function exportPDF(mdUrl, imgUrl, filename, headerLines, mdText = null) {
  if (!window.jspdf?.jsPDF) { toast('PDF library still loading — try again'); return; }
  toast('Building PDF…');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }); // 595 × 842
  const W = 595, M = 46;
  let y = M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(pdfText(headerLines[0]), M, y); y += 20;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
  for (const l of headerLines.slice(1)) { doc.text(pdfText(l), M, y); y += 13; }
  doc.setTextColor(0);
  if (imgUrl) {
    try {
      const svgEl = await svgElFromUrl(imgUrl);
      const vb = svgEl.viewBox.baseVal;
      const scale = 2;
      svgEl.style.color = '#1c1b22';
      svgEl.querySelectorAll('[fill^="var("]').forEach((n) => n.setAttribute('fill', '#ffffff'));
      svgEl.setAttribute('width', vb.width * scale); svgEl.setAttribute('height', vb.height * scale);
      const blobUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = blobUrl; });
      const canvas = h('canvas', { width: vb.width * scale, height: vb.height * scale });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(blobUrl);
      const iw = W - 2 * M;
      const ih = iw * (vb.height / vb.width);
      const maxH = 842 - y - M;
      const fh = Math.min(ih, maxH), fw = fh * (vb.width / vb.height);
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', (W - fw) / 2, y + 8, fw, fh);
      doc.addPage(); y = M;
    } catch { /* image is optional — the text still exports */ }
  }
  const md = mdText ?? await (await fetch(mdUrl)).text();
  doc.setFont('courier', 'normal'); doc.setFontSize(7.6);
  for (const rawLine of md.split('\n')) {
    const isH = /^#{1,3} /.test(rawLine);
    doc.setFont('courier', isH ? 'bold' : 'normal');
    const wrapped = doc.splitTextToSize(pdfText(rawLine.replace(/^#+ /, '').replace(/\*\*/g, '')) || ' ', W - 2 * M);
    for (const l of wrapped) {
      if (y > 842 - M) { doc.addPage(); y = M; }
      doc.text(l, M, y);
      y += isH ? 12 : 9.5;
    }
  }
  doc.save(filename);
}

// ————— sidebar —————
async function loadProfiles() {
  [S.profiles, S.cats] = await Promise.all([api('/api/profiles'), api('/api/categories')]);
  renderSidebar();
}
function collapsedSet() { return new Set(store.get('cd-collapsed', [])); }

// A small download icon (inline SVG, currentColor — no emoji codepoints, same
// reasoning as the chrome icons: a typed glyph would fall back to a color emoji).
function downloadIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M12 3v11M12 14l-4-4M12 14l4-4M5 19h14"/>';
  return svg;
}

/**
 * Per-category export popup. The same three shapes as the dashboard card
 * (archive · research .md · research .csv) but scoped to one section, opened
 * straight from its sidebar header so she never has to leave the list. Shares
 * the section-pick with the dashboard card via the same localStorage key.
 */
function categoryExportModal(catKey, catLabel, count) {
  const SECTION_OPTS = [
    ['vedic', 'Vedic'], ['dashas', 'Dasha timeline'], ['human-design', 'Human Design'],
    ['matrix', 'Matrix'], ['atlas', 'Everything'],
  ];
  const picked = new Set(store.get('cd-bulk-sections', ['vedic']));
  const secWrap = h('div', { class: 'varga-pick' });
  const drawSecs = () => secWrap.replaceChildren(...SECTION_OPTS.map(([k, label]) => h('button', {
    class: 'pill' + (picked.has(k) ? ' on' : ''),
    onclick: () => {
      if (k === 'atlas') { picked.clear(); picked.add('atlas'); }
      else { picked.delete('atlas'); picked.has(k) && picked.size > 1 ? picked.delete(k) : picked.add(k); }
      store.set('cd-bulk-sections', [...picked]); drawSecs();
    },
  }, label)));
  drawSecs();

  const whereI = h('input', { type: 'text', placeholder: 'e.g. moon.nakshatra=Magha', autocomplete: 'off' });

  const qs = (extra) => {
    const q = new URLSearchParams();
    if (catKey !== '_other') q.set('category', catKey);
    if (whereI.value.trim()) q.set('where', whereI.value.trim());
    for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
    return q.toString();
  };
  const base = () => `chart-desk-${catKey}-${new Date().toISOString().slice(0, 10)}`;
  const save = async (path, ext, extra) => {
    try {
      const r = await fetch(`${path}?${qs(extra)}`);
      if (!r.ok) { toast((await r.json().catch(() => ({}))).error ?? `export failed (${r.status})`); return; }
      downloadText(await r.text(), `${base()}.${ext}`, ext === 'csv' ? 'text/csv' : 'text/markdown');
      toast('Saved'); close();
    } catch (e) { toast(`Export failed: ${e.message}`); }
  };
  const open = (path, extra) => window.open(`${path}?${qs(extra)}`, '_blank');
  const secList = () => [...picked].join(',');

  const modal = h('div', { class: 'overlay', onclick: (e) => { if (e.target === modal) close(); } },
    h('div', { class: 'modal', style: 'max-width:440px' },
      h('h3', {}, `Export — ${catLabel} `, h('span', { class: 'glance-varga' }, `${count} ${count === 1 ? 'person' : 'people'}`)),
      h('p', { class: 'md-note', style: 'margin:-4px 0 14px' }, 'Everything computes here; nothing leaves the Mac.'),

      h('div', { class: 'field' },
        h('label', {}, 'Archive — full charts, one file'),
        secWrap,
        h('div', { class: 'bulk-acts', style: 'margin-top:10px' },
          h('button', { class: 'btn sm', onclick: () => open('/api/archive.md', { sections: secList() }) }, 'Open'),
          h('button', { class: 'btn sm primary', onclick: () => save('/api/archive.md', 'md', { sections: secList() }) }, 'Save archive .md'))),

      h('hr', { style: 'border:none;border-top:1px solid var(--line);margin:16px 0' }),

      h('div', { class: 'field' },
        h('label', {}, 'Research table — one row per person + counts'),
        h('div', { class: 'bulk-acts', style: 'margin-top:2px' },
          h('button', { class: 'btn sm', onclick: () => open('/api/research.md') }, 'Open table'),
          h('button', { class: 'btn sm', onclick: () => save('/api/research.md', 'md') }, 'Save .md'),
          h('button', { class: 'btn sm', onclick: () => save('/api/research.csv', 'csv') }, 'Save .csv'))),

      h('div', { class: 'field', style: 'margin-top:6px' },
        h('label', {}, 'Narrow by placement (optional)'), whereI,
        h('p', { class: 'hint', style: 'margin-top:4px' }, 'field=value — moon.nakshatra=Magha · moon.lord=Ketu · d9.venus.sign=Pisces. Applies to both.')),

      h('div', { class: 'modal-foot' },
        h('div', { class: 'right' }, h('button', { class: 'btn', onclick: () => close() }, 'Close'))),
    ));
  const close = () => modal.remove();
  $('#modal-root').append(modal);
}

/**
 * Parse a pasted people-list (the Markdown table from import-template.md) into
 * the shape /api/profiles/import wants. Lenient: columns in any order, optional
 * ones may be blank; a Place cell that is "lat, lon, tz" is read as coordinates.
 */
function parsePeopleTable(text, cats = []) {
  const catBy = new Map();
  for (const c of cats) { catBy.set(c.label.toLowerCase(), c.key); catBy.set(c.key.toLowerCase(), c.key); }
  const lines = String(text).split('\n');
  const cells = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((s) => s.trim());
  const isSep = (l) => /-/.test(l) && /^[\s|:-]+$/.test(l);

  let cols = null, hi = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('|')) continue;
    const c = cells(lines[i]).map((x) => x.toLowerCase());
    if (c.includes('name') && c.includes('date')) { cols = c; hi = i; break; }
  }
  if (hi < 0) return { people: [], warnings: ['No table found — keep the header row: | Name | Date | Time | Place | Category | Tags | Notes |'] };

  const at = (name) => cols.indexOf(name);
  const [iName, iDate, iTime, iPlace, iCat, iTags, iNotes, iLat, iLon, iTz] =
    ['name', 'date', 'time', 'place', 'category', 'tags', 'notes', 'lat', 'lon', 'tz'].map(at);
  const people = [];
  for (let i = hi + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.includes('|') || isSep(l)) continue;
    const c = cells(l);
    const name = (c[iName] ?? '').trim();
    if (!name) continue;
    const p = { name, date: (c[iDate] ?? '').trim() };
    const t = iTime >= 0 ? (c[iTime] ?? '').trim() : '';
    if (t) p.time = t; else p.timeUnknown = true;
    if (iLat >= 0 && iLon >= 0 && c[iLat]?.trim() && c[iLon]?.trim()) {
      p.lat = c[iLat].trim(); p.lon = c[iLon].trim(); p.tz = (c[iTz] ?? '').trim();
    } else if (iPlace >= 0 && c[iPlace]?.trim()) {
      const pv = c[iPlace].trim();
      const parts = pv.split(',').map((s) => s.trim());
      if (parts.length >= 3 && !Number.isNaN(parseFloat(parts[0])) && !Number.isNaN(parseFloat(parts[1])) && parts[2].includes('/')) {
        p.lat = parts[0]; p.lon = parts[1]; p.tz = parts.slice(2).join(', ');
      } else p.place = pv;
    }
    if (iCat >= 0 && c[iCat]?.trim()) { const r = c[iCat].trim(); p.category = catBy.get(r.toLowerCase()) ?? r; }
    if (iTags >= 0 && c[iTags]?.trim()) p.tags = c[iTags].split(',').map((x) => x.trim()).filter(Boolean);
    if (iNotes >= 0 && c[iNotes]?.trim()) p.notes = c[iNotes].trim();
    people.push(p);
  }
  return { people, warnings: people.length ? [] : ['Found the header but no data rows below the |---| line.'] };
}

// Import people from a pasted list. Previews (dry-run) before writing.
async function importModal() {
  const cats = S.cats ?? [];
  let parsed = null;

  const catSel = h('select', {},
    h('option', { value: '' }, 'if a row leaves it blank → Other'),
    ...cats.map((c) => h('option', { value: c.key }, c.label)));
  const tagsI = h('input', { type: 'text', placeholder: 'e.g. scraped (optional)' });
  const updateChk = h('input', { type: 'checkbox' });
  const ta = h('textarea', { rows: '9', placeholder: 'Paste your list here…\n| Name | Date | Time | Place | Category | Tags |\n|---|---|---|---|---|---|\n| … | 1990-06-15 | 14:30 | Bucharest, Romania | Research | scraped |', style: 'width:100%;font-family:var(--mono);font-size:12px;line-height:1.5' });
  const result = h('div', { class: 'import-result' });

  const bodyFor = (dryRun) => JSON.stringify({
    dryRun, category: catSel.value || undefined,
    tags: tagsI.value.split(',').map((t) => t.trim()).filter(Boolean),
    onExisting: updateChk.checked ? 'update' : 'skip',
    people: parsed?.people ?? [],
  });
  const post = (dryRun) => fetch('/api/profiles/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(dryRun) }).then((r) => r.json());

  const importBtn = h('button', { class: 'btn primary', onclick: commit }, 'Import');
  importBtn.disabled = true;

  function summary(d) {
    const line = (label, arr, cls) => (arr.length
      ? h('p', { class: `imp-line ${cls}` }, h('span', { class: 'lbl' }, `${arr.length} ${label}: `),
          arr.map((x) => `${x.name}${x.reason ? ` — ${x.reason}` : ''}`).join(' · '))
      : null);
    result.replaceChildren(...[
      line(d.dryRun ? 'ready to add' : 'added', d.created, 'imp-add'),
      line('to update', d.updated, 'imp-upd'),
      line('already here (skipped)', d.skipped, 'imp-skip'),
      line('couldn’t read', d.errors, 'imp-err'),
    ].filter(Boolean));
    const n = d.created.length + d.updated.length;
    importBtn.disabled = n === 0;
    importBtn.textContent = n ? `Import ${n} ${n === 1 ? 'person' : 'people'}` : 'Import';
  }
  async function preview() {
    parsed = parsePeopleTable(ta.value, cats);
    if (!parsed.people.length) { result.replaceChildren(h('p', { class: 'warnnote' }, parsed.warnings[0])); importBtn.disabled = true; return; }
    result.replaceChildren(h('p', { class: 'md-note' }, `Checking ${parsed.people.length}…`));
    try { summary(await post(true)); } catch (e) { result.replaceChildren(h('p', { class: 'warnnote' }, `Preview failed: ${e.message}`)); }
  }
  async function commit() {
    try {
      const d = await post(false);
      const n = d.created.length + d.updated.length;
      await loadProfiles(); renderSidebar();
      toast(`Imported ${n} ${n === 1 ? 'person' : 'people'}`);
      close();
    } catch (e) { toast(`Import failed: ${e.message}`); }
  }
  const downloadTemplate = async () => {
    try { downloadText(await (await fetch('/import-template.md')).text(), 'chart-desk-import-template.md', 'text/markdown'); toast('Template saved to Downloads'); }
    catch { window.open('/import-template.md', '_blank'); }
  };
  // re-preview when the list changes so the count stays honest
  ta.addEventListener('input', () => { importBtn.disabled = true; });

  const modal = h('div', { class: 'overlay', onclick: (e) => { if (e.target === modal) close(); } },
    h('div', { class: 'modal', style: 'max-width:580px' },
      h('h3', {}, 'Import people'),
      h('p', { class: 'md-note', style: 'margin:-4px 0 12px' },
        'Paste a list of names and birth details. A city name is enough — the app finds the coordinates and timezone. It previews before adding anything; nothing leaves the Mac.'),
      h('div', { class: 'bulk-acts', style: 'margin:0 0 14px' },
        h('button', { class: 'btn sm', onclick: downloadTemplate }, 'Download the blank template'),
        h('a', { href: '/import-template.md', target: '_blank', rel: 'noopener', class: 'btn sm', style: 'text-decoration:none' }, 'See the format')),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', {}, 'Default category'), catSel),
        h('div', { class: 'field' }, h('label', {}, 'Default tags for all'), tagsI)),
      h('label', { class: 'check', style: 'margin:2px 0 12px' }, updateChk, ' Update people who already exist (otherwise they’re skipped)'),
      h('div', { class: 'field' }, h('label', {}, 'Your list'), ta),
      result,
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn', onclick: () => close() }, 'Cancel'),
        h('div', { class: 'right' },
          h('button', { class: 'btn', onclick: preview }, 'Preview'),
          importBtn)),
    ));
  const close = () => modal.remove();
  $('#modal-root').append(modal);
}

function renderSidebar() {
  const list = $('#plist');
  list.innerHTML = '';
  const q = S.filter.toLowerCase();
  const match = (p) => !q || p.name.toLowerCase().includes(q) || (p.tags ?? []).some((t) => t.toLowerCase().includes(q));
  const cats = [...S.cats].sort((a, b) => a.order - b.order);
  const collapsed = collapsedSet();
  const known = new Set(cats.map((c) => c.key));
  const groups = [...cats.map((c) => ({ ...c, people: S.profiles.filter((p) => p.category === c.key) })),
    { key: '_other', label: 'Uncategorized', people: S.profiles.filter((p) => !known.has(p.category)) }];

  for (const g of groups) {
    const people = g.people.filter(match);
    if (!people.length && g.key === '_other') continue;
    const isCol = collapsed.has(g.key) && !q;
    const head = h('button', {
      class: 'cat-label cat-toggle', 'data-cat': g.key,
      onclick: () => {
        const c = collapsedSet();
        c.has(g.key) ? c.delete(g.key) : c.add(g.key);
        store.set('cd-collapsed', [...c]);
        renderSidebar();
      },
    }, h('span', { class: 'chev' }, isCol ? '▸' : '▾'), `${g.label}`, h('span', { class: 'cat-n' }, String(g.people.length)));
    wireDropTarget(head, g.key, null);
    // a light export shortcut on the header row — opens the per-category popup
    const exportBtn = g.people.length
      ? h('button', {
        class: 'cat-export', title: `Export ${g.label}`, 'aria-label': `Export ${g.label}`,
        onclick: (e) => { e.stopPropagation(); categoryExportModal(g.key, g.label, g.people.length); },
      }, downloadIcon())
      : null;
    list.append(h('div', { class: 'cat-head' }, head, exportBtn));
    if (isCol) continue;
    people.forEach((p) => list.append(personRow(p, g.key)));
    if (!people.length) list.append(h('div', { class: 'cat-empty', 'data-cat': g.key }, 'drop people here'));
  }
  if (!list.children.length) list.append(h('div', { class: 'cat-label' }, 'No matches'));

  // "+ section" affordance
  const addWrap = h('div', { class: 'add-section' });
  const openInput = () => {
    const inp = h('input', { type: 'text', placeholder: 'Section name…' });
    const okB = h('button', { class: 'btn sm primary', onclick: submit }, 'Add');
    async function submit() {
      const label = inp.value.trim();
      if (!label) return;
      try {
        S.cats = await api('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) });
        renderSidebar();
        toast(`Section “${label}” added`);
      } catch (e) { toast(e.message); }
    }
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') renderSidebar(); });
    addWrap.replaceChildren(inp, okB);
    inp.focus();
  };
  addWrap.append(h('button', { class: 'btn sm ghost', onclick: openInput }, '+ section'));
  list.append(addWrap);
}

function personRow(p, catKey) {
  const row = h('button', {
    class: 'person' + (S.sel === p.slug ? ' on' : ''),
    draggable: 'true',
    'data-slug': p.slug, 'data-cat': catKey,
    onclick: () => { location.hash = `#/p/${p.slug}/${S.tab}`; $('#side').classList.remove('open'); },
  },
    avatarSVG(p),
    h('span', { class: 'nm' }, p.name),
    h('span', { class: 'tagrow' },
      (p.tags ?? []).slice(0, 2).map((t) => h('span', { class: 'tagchip' }, t))),
  );
  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', p.slug);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => row.classList.remove('dragging'));
  wireDropTarget(row, catKey, p.slug);
  return row;
}

function wireDropTarget(el, catKey, beforeSlug) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dropover'); });
  el.addEventListener('dragleave', () => el.classList.remove('dropover'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('dropover');
    const slug = e.dataTransfer.getData('text/plain');
    if (!slug || slug === beforeSlug) return;
    await reorderProfile(slug, catKey, beforeSlug);
  });
}

// move `slug` into catKey, placed before `beforeSlug` (or at the end),
// then renumber the category's order fields
async function reorderProfile(slug, catKey, beforeSlug) {
  const moving = S.profiles.find((p) => p.slug === slug);
  if (!moving) return;
  const siblings = S.profiles.filter((p) => p.category === catKey && p.slug !== slug);
  const idx = beforeSlug ? siblings.findIndex((p) => p.slug === beforeSlug) : siblings.length;
  siblings.splice(idx < 0 ? siblings.length : idx, 0, moving);
  try {
    await Promise.all(siblings.map((p, i) => {
      const needsCat = p.slug === slug && moving.category !== catKey;
      if (!needsCat && p.order === i * 10) return null;
      return api(`/api/profiles/${p.slug}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: p.name, order: i * 10, ...(p.slug === slug ? { category: catKey } : {}) }),
      });
    }).filter(Boolean));
    await loadProfiles();
  } catch (e) { toast(e.message); }
}

// ————— router —————
window.addEventListener('hashchange', route);
async function route() {
  const m = location.hash.match(/^#\/p\/([a-z0-9-]+)(?:\/([a-z-]+))?/);
  if (m) {
    S.sel = m[1];
    S.tab = m[2] ?? 'vedic';
    renderSidebar();
    await showProfile(m[1]);
  } else {
    S.sel = null;
    renderSidebar();
    showHome();
  }
}

// ————— the sky right now (dashboard) —————
// Where every body is, in both zodiacs, and how long it stays: the bar runs
// from the moment it entered its sign to the moment it leaves, filled up to
// now. Re-read every minute while the dashboard is up; tap a row for the
// exact times. Vedic = the nine grahas (Lahiri); tropical adds the outers.
const SKY_GLYPH = { ...PLANET_GLYPH, uranus: '♅', neptune: '♆', pluto: '♇' };
const SKY_COLOR = { ...PLANET_COLOR, uranus: '#4A8E92', neptune: '#5A78A8', pluto: '#7D4E5E' };
const skyDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const skyMonth = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
const skyClock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const skyFull = (ms) => `${skyDay.format(ms)}, ${new Date(ms).getFullYear()} · ${skyClock.format(ms)}`;
// a moment near now, as briefly as stays exact enough (past or future)
const skyWhen = (ms, now) => {
  const away = Math.abs(ms - now);
  if (away < 2 * 86400e3) return `${skyDay.format(ms)} ${skyClock.format(ms)}`;
  if (new Date(ms).getFullYear() === new Date(now).getFullYear()) return skyDay.format(ms);
  if (away < 730 * 86400e3) return `${skyDay.format(ms)}, ${new Date(ms).getFullYear()}`;
  return skyMonth.format(ms);
};
// a length of time, in the one unit that reads at a glance
const skySpan = (ms) => {
  const hrs = ms / 3600e3, days = hrs / 24;
  if (hrs < 1) return `${Math.max(1, Math.round(ms / 60e3))}m`;
  if (hrs < 24) return `${Math.floor(hrs)}h`;
  if (days < 3) return `${Math.floor(days)}d ${Math.floor(hrs % 24)}h`;
  if (days < 60) return `${Math.round(days)}d`;
  if (days < 730) return `${Math.round(days / 30.44)}mo`;
  const y = days / 365.25;
  return y < 10 ? `${y.toFixed(1)}y` : `${Math.round(y)}y`;
};
// the same, spelled out for the tap-open detail ("64 days", "1.4 years")
const skyLong = (ms) => {
  const days = ms / 86400e3;
  if (days < 3) return skySpan(ms);
  if (days < 365) return `${Math.round(days)} days`;
  const y = days / 365.25;
  return `${y < 10 ? y.toFixed(1) : Math.round(y)} years`;
};
const skySign = (name) => h('span', { class: 'sky-sym', style: `color:${signColor(name)}`, title: name }, signGlyph(name));

function skyRow(r, zodiac, sky, open, redraw) {
  const id = `${zodiac}:${r.key}`;
  const isOpen = open.has(id);
  const now = Date.parse(sky.at);
  const since = r.stay.since ? Date.parse(r.stay.since) : null;
  const until = r.stay.until ? Date.parse(r.stay.until) : null;
  const share = since && until ? Math.min(1, Math.max(0, (now - since) / (until - since))) : null;
  // leaving into the sign BEHIND it = a retrograde exit
  const back = r.stay.to && (signIdx(r.stay.to) - signIdx(r.sign) + 12) % 12 === 11;
  const nk = r.nakshatra;
  const label = zodiac === 't' && r.key === 'rahu' ? 'North Node' : PLANET_LABELS[r.key];
  const toggle = () => { isOpen ? open.delete(id) : open.add(id); redraw(); };

  const detail = [];
  if (isOpen) {
    detail.push(h('div', {}, since
      ? `In ${r.sign} since ${skyFull(since)}${r.stay.from ? `, from ${r.stay.from}` : ''}`
      : `In ${r.sign} for longer than the search window`));
    detail.push(h('div', {}, until
      ? `Leaves ${skyFull(until)} ${back ? 'back into' : 'for'} ${r.stay.to}${since ? ` — ${skyLong(until - since)} in the sign` : ''}`
      : 'Stays past the search window'));
    if (nk) {
      const padaAt = nk.padaUntil ? Date.parse(nk.padaUntil) : null;
      const nakAt = nk.until ? Date.parse(nk.until) : null;
      detail.push(h('div', {}, `${nk.name} (lord ${nk.lord}), pada ${nk.pada}`
        + (padaAt && nakAt && padaAt < nakAt - 60e3 ? ` · pada ${nk.padaNext} from ${skyFull(padaAt)}` : '')
        + (nakAt ? ` · ${nk.next} from ${skyFull(nakAt)}` : '')));
    }
    if (r.retro && (r.retroSince || r.directOn)) {
      detail.push(h('div', {}, `Retrograde${r.retroSince ? ` since ${skyFull(Date.parse(r.retroSince))}` : ''}`
        + (r.directOn ? ` · turns direct ${skyFull(Date.parse(r.directOn))}` : '')));
    } else if (r.nextRetro) {
      detail.push(h('div', {}, `Next retrograde ${skyFull(Date.parse(r.nextRetro))}`));
    } else if (r.key === 'rahu' || r.key === 'ketu') {
      detail.push(h('div', {}, 'Mean node — always retrograde'));
    }
    detail.push(h('div', { class: 'dim' }, `Moving ${Math.abs(r.speed).toFixed(r.key === 'moon' ? 1 : 2)}°/day${r.retro ? ', backward' : ''}`));
  }

  return h('div', {
    class: 'sky-row' + (isOpen ? ' open' : ''), role: 'button', tabindex: '0', 'aria-expanded': String(isOpen),
    onclick: toggle,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } },
  },
    h('span', { class: 'sky-sym sky-mark', style: `color:${SKY_COLOR[r.key] ?? 'var(--ink-3)'}` }, SKY_GLYPH[r.key] ?? '·'),
    h('span', { class: 'sky-name' }, label,
      r.retro ? h('span', { class: 'sky-retro', title: 'retrograde' }, '℞') : null,
      r.directOn ? h('span', { class: 'sky-note' }, `until ${skyWhen(Date.parse(r.directOn), now)}`) : null),
    h('span', { class: 'sky-pos' }, skySign(r.sign), ` ${r.sign} `, h('span', { class: 'sky-deg' }, dms(r.degInSign))),
    h('div', { class: 'sky-sub' },
      h('span', { class: 'sky-left' }, nk ? `${nk.name} p${nk.pada}` : since ? `since ${skyWhen(since, now)}` : ''),
      h('span', { class: 'bar-track', title: since && until ? `${Math.round(share * 100)}% of its time in ${r.sign}` : '' },
        share === null ? null : h('span', { class: 'bar-fill', style: `width:${share * 100}%;background:${signColor(r.sign)}` })),
      until ? h('span', { class: 'sky-until' }, `${skySpan(until - now)} ${back ? '←' : '→'} `, skySign(r.stay.to),
        h('span', { class: 'sky-date' }, ` ${skyWhen(until, now)}`)) : null),
    isOpen ? h('div', { class: 'sky-detail' }, detail) : null,
  );
}

function skyCards() {
  const vedic = h('div', { class: 'card sky-card' });
  const tropical = h('div', { class: 'card sky-card' });
  const open = (S.skyOpen ??= new Set());
  const head = (title, meta) => h('div', { class: 'sky-head' }, h('h3', {}, title), h('span', { class: 'sky-meta', title: 'refreshed every minute' }, meta));
  const draw = () => {
    const sky = S.sky;
    if (!sky) {
      vedic.replaceChildren(head('Vedic sky — now', ''), h('p', { class: 'md-note' }, 'Reading the sky…'));
      tropical.replaceChildren(head('Tropical sky — now', ''), h('p', { class: 'md-note' }, 'Reading the sky…'));
      return;
    }
    const at = skyClock.format(Date.parse(sky.at));
    // spread, not an array: native replaceChildren stringifies an array arg
    vedic.replaceChildren(head('Vedic sky — now', `Lahiri ${dms(sky.ayanamsa.deg)} · ${at}`),
      ...sky.vedic.map((r) => skyRow(r, 'v', sky, open, draw)));
    tropical.replaceChildren(head('Tropical sky — now', at),
      ...sky.tropical.map((r) => skyRow(r, 't', sky, open, draw)));
  };
  const load = async () => {
    try { S.sky = await api('/api/sky'); draw(); } catch { /* keep the last reading on screen */ }
  };
  draw();      // the last reading paints at once; the fresh one replaces it
  load();
  clearInterval(S.skyTimer);
  S.skyTimer = setInterval(() => {
    if (!vedic.isConnected) { clearInterval(S.skyTimer); S.skyLoad = null; return; }
    load();
  }, 60e3);
  S.skyLoad = () => { if (vedic.isConnected) load(); };
  return [vedic, tropical];
}
// back from another app or a sleeping phone: re-read at once, not up to a minute later
document.addEventListener('visibilitychange', () => { if (!document.hidden) S.skyLoad?.(); });

// ————— home dashboard —————
async function showHome() {
  const main = $('#main');
  // keep the old dashboard up during the /api/dashboard fetch (a Section/Tag
  // filter change re-enters here with #main already full) — placeholder only on
  // a genuinely empty first load, so a scope change never collapses to one line.
  if (!main.firstChild) main.replaceChildren(h('p', { class: 'md-note' }, 'Loading the desk…'));
  let d;
  try { d = await api('/api/dashboard' + (S.dashScope ? `?${S.dashScope}` : '')); } catch (e) {
    main.replaceChildren(h('p', { class: 'warnnote' }, e.message));
    return;
  }
  const tile = (n, label) => h('div', { class: 'tile' }, h('div', { class: 'tile-n' }, String(n)), h('div', { class: 'tile-l' }, label));
  // a row leads with its own mark — sign, graha, type or star — and the
  // bar takes that mark's color, so the column reads as one language
  const bar = (r, max, icon) => {
    const marks = icon ? [icon] : (r.signs ?? []).slice(0, 2).map((s) => ({ glyph: signGlyph(s), color: signColor(s), title: `${s} · ${signElement(s)}` }));
    const tint = marks.length === 1 ? marks[0].color : null;
    return h('div', { class: 'bar-row', title: r.signs?.length ? r.signs.map((s) => `${s} · ${signElement(s)}`).join(' · ') : '' },
      h('span', { class: 'bar-signs' }, marks.map((m) =>
        h('span', { style: `color:${m.color}`, title: m.title ?? '' }, m.glyph))),
      h('span', { class: 'bar-label' }, r.key),
      h('span', { class: 'bar-track' },
        h('span', { class: 'bar-fill', style: `width:${(r.count / max) * 100}%${tint ? `;background:${tint}` : ''}` })),
      h('span', { class: 'bar-n' }, String(r.count)));
  };
  const dist = (title, list, { top = 6, icon = null } = {}) => {
    const rows = (list ?? []).slice(0, top);
    if (!rows.length) return null;
    const max = Math.max(1, ...rows.map((r) => r.count));
    return h('div', { class: 'card' }, h('h3', {}, title), rows.map((r) => bar(r, max, icon?.(r))));
  };
  // — the marks —
  const iconSign = (r) => (r.signs?.[0]
    ? { glyph: signGlyph(r.signs[0]), color: signColor(r.signs[0]), title: `${r.signs[0]} · ${signElement(r.signs[0])}` }
    : null);
  const iconPlanet = (r) => {
    const b = r.key.toLowerCase().split(' ')[0];
    return PLANET_GLYPH[b] ? { glyph: PLANET_GLYPH[b], color: PLANET_COLOR[b], title: cap(b) } : null;
  };
  const HD_MARK = {
    Manifestor: ['▲', '#C0533F'], Generator: ['■', '#58864A'],
    'Manifesting Generator': ['◆', '#C9793B'], Projector: ['▽', '#4A7FB5'], Reflector: ['◇', '#8B6FC9'],
  };
  const iconHDType = (r) => (HD_MARK[r.key] ? { glyph: HD_MARK[r.key][0], color: HD_MARK[r.key][1], title: r.key } : null);
  const iconProfile = (r) => ({ glyph: '◐', color: 'var(--ink-3)', title: `profile ${r.key}` });
  const iconSignal = (r) => {
    const n = parseInt(r.key, 10) || 0;
    const shade = ['#B9B6AE', '#B6A98F', '#C79A3B', '#C9793B', '#C0533F', '#A8443B', '#8047BF'][Math.min(6, n)];
    return { glyph: n >= 5 ? '★' : n >= 3 ? '✦' : '✧', color: shade, title: `${n} of the six late-arc signals compute` };
  };

/**
 * Bulk export for whatever the dashboard filter currently has in view.
 * Two shapes, because archiving and pattern-hunting want opposite things:
 * an archive is every section per person, a research table is one ROW per
 * person — sixteen full atlases is ten thousand lines and buries the pattern.
 */
function bulkCard(scope, inView) {
  const qs = () => {
    const q = new URLSearchParams();
    if (scope.category) q.set('category', scope.category);
    if (scope.tag) q.set('tag', scope.tag);
    if (whereI.value.trim()) q.set('where', whereI.value.trim());
    return q;
  };
  const SECTION_OPTS = [
    ['vedic', 'Vedic'], ['dashas', 'Dasha timeline'], ['human-design', 'Human Design'],
    ['matrix', 'Matrix'], ['atlas', 'Everything'],
  ];
  const picked = new Set(store.get('cd-bulk-sections', ['vedic']));
  const secWrap = h('div', { class: 'varga-pick' });
  const drawSecs = () => secWrap.replaceChildren(...SECTION_OPTS.map(([k, label]) => h('button', {
    class: 'pill' + (picked.has(k) ? ' on' : ''),
    onclick: () => {
      // "Everything" is the whole intake pack — it subsumes the rest
      if (k === 'atlas') { picked.clear(); picked.add('atlas'); }
      else { picked.delete('atlas'); picked.has(k) && picked.size > 1 ? picked.delete(k) : picked.add(k); }
      store.set('cd-bulk-sections', [...picked]); drawSecs();
    },
  }, label)));
  drawSecs();

  const whereI = h('input', {
    type: 'text', placeholder: 'e.g. moon.nakshatra=Magha', autocomplete: 'off',
    value: store.get('cd-bulk-where', ''),
  });
  whereI.addEventListener('input', () => store.set('cd-bulk-where', whereI.value));

  const colsI = h('input', {
    type: 'text', autocomplete: 'off',
    placeholder: 'lagna.sign, moon.nakshatra, moon.pada, ak',
    value: store.get('cd-bulk-cols', ''),
  });
  colsI.addEventListener('input', () => store.set('cd-bulk-cols', colsI.value));

  const go = async (path, ext, extra) => {
    const q = qs();
    for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
    try {
      const r = await fetch(`${path}?${q}`);
      if (!r.ok) { toast((await r.json().catch(() => ({}))).error ?? `export failed (${r.status})`); return; }
      const base = ['chart-desk', scope.category, scope.tag].filter(Boolean).join('-');
      downloadText(await r.text(), `${base}-${new Date().toISOString().slice(0, 10)}.${ext}`,
        ext === 'csv' ? 'text/csv' : 'text/markdown');
      toast('Saved');
    } catch (e) { toast(`Export failed: ${e.message}`); }
  };
  const openUrl = (path, extra) => {
    const q = qs();
    for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
    window.open(`${path}?${q}`, '_blank');
  };
  const secList = () => [...picked].join(',');
  const colList = () => colsI.value.split(',').map((c) => c.trim()).filter(Boolean).join(',');

  // Two pages, one shown at a time — keeps the card compact enough for the
  // dashboard column. Segmented toggle switches between them; last pick sticks.
  const body = h('div');
  let mode = store.get('cd-bulk-mode', 'archive');
  const archivePage = () => h('div', {},
    h('p', { class: 'hint', style: 'margin:2px 0 8px' }, 'Full charts, one master file. Pick the layers:'),
    secWrap,
    h('div', { class: 'bulk-acts', style: 'margin-top:12px' },
      h('button', { class: 'btn sm', onclick: () => openUrl('/api/archive.md', { sections: secList() }) }, 'Open'),
      h('button', { class: 'btn sm primary', onclick: () => go('/api/archive.md', 'md', { sections: secList() }) }, 'Save .md')));
  const researchPage = () => h('div', {},
    h('p', { class: 'hint', style: 'margin:2px 0 8px' }, 'One row per person + a count of each value. Columns (blank = lagna, Moon, Sun, AK, Karakamsa):'),
    colsI,
    h('div', { class: 'bulk-acts', style: 'margin-top:12px' },
      h('button', { class: 'btn sm', onclick: () => openUrl('/api/research.md') }, 'Open table'),
      h('button', { class: 'btn sm', onclick: () => go('/api/research.md', 'md') }, 'Save .md'),
      h('button', { class: 'btn sm', onclick: () => go('/api/research.csv', 'csv') }, 'Save .csv')));
  const paint = () => body.replaceChildren(mode === 'research' ? researchPage() : archivePage());
  const seg = h('div', { class: 'seg' },
    ...[['archive', 'Archive'], ['research', 'Research']].map(([k, label]) => {
      const b = h('button', { class: mode === k ? 'on' : '', onclick: () => { mode = k; store.set('cd-bulk-mode', k); [...seg.children].forEach((c) => c.classList.toggle('on', c === b)); paint(); } }, label);
      return b;
    }));
  paint();

  return h('div', { class: 'card bulk-compact' },
    h('div', { class: 'bulk-head' },
      h('h3', { style: 'margin:0' }, 'Export this group'),
      h('span', { class: 'scope-count' }, `${inView} in view`)),
    h('div', { style: 'margin:8px 0 12px' }, seg),
    h('label', { class: 'bulk-lbl', style: 'display:block;margin-bottom:4px' }, 'Narrow by placement (optional)'),
    whereI,
    h('p', { class: 'hint', style: 'margin:4px 0 12px' }, 'field=value — moon.nakshatra=Magha · moon.lord=Ketu · d9.venus.sign=Pisces. Applies to both.'),
    body,
  );
}

// scope filter — two compact selects that compose (section AND tag),
  // so a growing tag list never turns into a wall of chips
  const sc = d.scope;
  const setScope = (category, tag) => {
    const q = new URLSearchParams();
    if (category) q.set('category', category);
    if (tag) q.set('tag', tag);
    S.dashScope = q.toString() || null;
    showHome();
  };
  const secSel = h('select', {},
    h('option', { value: '', ...(sc.category ? {} : { selected: '' }) }, `All sections · ${sc.of}`),
    ...d.totals.byCategory.filter((c) => c.count).map((c) =>
      h('option', { value: c.key, ...(sc.category === c.key ? { selected: '' } : {}) }, `${c.label} · ${c.count}`)));
  secSel.addEventListener('change', () => setScope(secSel.value, sc.tag));
  const tagSel = h('select', {},
    h('option', { value: '', ...(sc.tag ? {} : { selected: '' }) }, 'All tags'),
    ...(d.totals.tags ?? []).map((t) =>
      h('option', { value: t.key, ...(sc.tag === t.key ? { selected: '' } : {}) }, `${t.key} · ${t.count}`)));
  tagSel.addEventListener('change', () => setScope(sc.category, tagSel.value));
  const filterRow = h('div', { class: 'scope-bar' },
    h('label', { class: 'scope-field' }, h('span', {}, 'Section'), secSel),
    h('label', { class: 'scope-field' }, h('span', {}, 'Tag'), tagSel),
    (sc.category || sc.tag) ? h('button', { class: 'btn sm', onclick: () => setScope(null, null) }, 'Clear') : null,
    h('span', { class: 'scope-count' },
      sc.category || sc.tag ? `${d.totals.profiles} of ${sc.of} in view` : `${sc.of} people`),
  );

  const D = d.distributions;
  main.replaceChildren(
    h('div', { class: 'dash-head' },
      h('div', {},
        h('h2', { style: 'margin:0' }, 'Chart Desk'),
        h('p', { class: 'md-note', style: 'margin:4px 0 0' }, 'The local chart engine — everything computes on this Mac.')),
      h('div', { style: 'display:flex;gap:10px' },
        h('button', { class: 'btn primary', onclick: () => personModal() }, '+ New person'),
        h('button', { class: 'btn', onclick: () => castModal() }, 'Quick cast')),
    ),
    filterRow,
    h('div', { class: 'tiles' },
      tile(d.totals.profiles, sc.category || sc.tag ? 'in view' : 'people'),
      ...(sc.category || sc.tag ? [] : d.totals.byCategory.filter((c) => c.count).map((c) => tile(c.count, c.label.toLowerCase()))),
      d.totals.timeUnknown ? tile(d.totals.timeUnknown, 'noon casts') : null,
    ),
    h('div', { class: 'grid2 grid-even dash-cols' },
      h('div', {},
        h('div', { class: 'card' }, h('h3', {}, 'Recently added'),
          h('div', { class: 'recent-row' }, d.recent.map((p) => h('button', {
            class: 'recent-chip', onclick: () => { location.hash = `#/p/${p.slug}/vedic`; },
          }, avatarSVG(p, 30), h('span', {}, p.name)))),
        ),
        d.birthdays?.length ? h('div', { class: 'card' }, h('h3', {}, 'Next birthdays'),
          h('table', { class: 'data' },
            d.birthdays.map((b) => h('tr', {},
              h('td', { class: 'num' }, dt(b.date)),
              h('td', {}, h('a', { href: `#/p/${b.slug}/vedic` }, b.name)),
              h('td', { class: 'num dim' }, `turns ${b.turns}`),
              h('td', { class: 'num dim' }, b.inDays === 0 ? 'today' : `in ${b.inDays}d`)))),
        ) : null,
        h('div', { class: 'card' }, h('h3', {}, 'Upcoming period changes (12 months)'),
          d.upcomingTransitions.length
            ? h('table', { class: 'data' },
                d.upcomingTransitions.map((t) => h('tr', {},
                  h('td', { class: 'num' }, dt(t.date)),
                  h('td', {}, h('a', { href: `#/p/${t.slug}/dashas` }, t.name)),
                  h('td', { class: 'num' }, t.kind),
                  h('td', {}, `→ ${t.to}`))))
            : h('p', { class: 'md-note' }, 'nothing shifts in the next year'),
        ),
        // export lives here, filling the left column below the tables
        bulkCard(sc, d.totals.profiles),
      ),
      // the live sky heads this column (and the whole page on a phone),
      // then every distribution stacked below it
      h('div', {},
        ...skyCards(),
        dist('Lagna signs', D.lagnaSigns, { icon: iconSign }),
        dist('Moon signs', D.moonSigns, { icon: iconSign }),
        dist('Moon nakshatras', D.moonNakshatras, { icon: iconSign }),
        dist('Element balance (by Moon)', D.moonElements, { top: 4 }),
        dist('Moon purushartha — the life-aim register', D.moonPurushartha, { top: 4, icon: iconSign }),
        dist('Ketu nakshatras — the south node', D.ketuNakshatras, { icon: iconSign }),
        dist('Chara dasha — the sign running now', D.charaSigns, { icon: iconSign }),
        dist('Running mahadashas', D.runningMD, { top: 9, icon: iconPlanet }),
        dist('Human Design types', D.hdTypes, { top: 5, icon: iconHDType }),
        dist('Human Design profiles', D.hdProfiles, { icon: iconProfile }),
        dist('Vargottama planets (D1 = D9)', D.vargottama, { icon: iconPlanet }),
        dist('Exalted · debilitated', D.dignities, { icon: iconPlanet }),
        dist('Late-arc signals firing', D.lateArcSignals, { top: 7, icon: iconSignal }),
      ),
    ),
    h('p', { style: 'margin-top:8px' },
      h('a', { href: '/llms.txt', target: '_blank', rel: 'noopener', class: 'mono', style: 'font-size:12px' }, '/llms.txt — the API, for agents'),
      h('span', { class: 'md-note', style: 'font-size:12px' }, ' · opens in your browser')),
  );
}

// ————— profile view —————
async function showProfile(slug) {
  const main = $('#main');
  const p = S.profiles.find((x) => x.slug === slug) ?? await api(`/api/profiles/${slug}`).catch(() => null);
  if (!p) { showHome(); return; }
  const fresh = S.forceFresh === slug;

  // FAST PATH — a tab switch on the profile already on screen. Re-render ONLY the
  // pane and re-flag the active tab; leave head + tabs mounted. This is what kills
  // the flash for good: the whole #main is no longer torn down and rebuilt every
  // tab click (a full-subtree replace the WKWebView repainted black), and there is
  // no await and no placeholder — just the pane's own content swapping in place.
  if (!fresh && S.mountedSlug === slug && S.cast && S.castSlug === slug
      && S.paneEl && S.paneEl.isConnected && S.tabsEl && S.tabsEl.isConnected) {
    S.forceFresh = null;
    [...S.tabsEl.children].forEach((btn) => btn.classList.toggle('on', btn.dataset.tab === S.tab));
    scrollTabIntoView(S.tabsEl);
    renderTab(S.paneEl, p, S.cast);
    return;
  }
  S.forceFresh = null;
  // A tab switch re-enters showProfile with the same slug and the chart already
  // in hand (S.cast). Reuse it: no refetch, and — crucially — no 'Casting…'
  // teardown, so the tall profile view is never collapsed to one line (which let
  // the WKWebView's black backing flash through). Only cast for a new profile or
  // a forced ↻ recast, and keep whatever is on screen while we do (show the
  // placeholder only when there is nothing to keep).
  let cast = S.cast;
  if (!(cast && S.castSlug === slug && !fresh)) {
    if (!main.firstChild) main.replaceChildren(h('p', { class: 'md-note' }, 'Casting…'));
    try { cast = await api(`/api/profiles/${slug}/chart${fresh ? '?fresh=1' : ''}`); } catch (e) {
      main.replaceChildren(h('p', { class: 'warnnote' }, `Cast failed: ${e.message}`));
      return;
    }
    S.cast = cast;
    S.castSlug = slug;
    if (fresh) toast(`Recast · ${new Date().toTimeString().slice(0, 5)} — running periods updated`);
  }

  const b = p.birth;
  const head = h('div', {},
    h('div', { class: 'profile-head' },
      avatarSVG(p, 46),
      h('div', { style: 'flex:1;min-width:200px' },
        h('h2', {}, p.name),
        h('p', { class: 'birthline' },
          `${b.date}${b.timeUnknown ? ' · time unknown (noon cast)' : ' · ' + b.time} · ${b.place ?? b.lat + ', ' + b.lon} · ${b.tz}`),
      ),
      h('span', { class: 'chip' }, p.categoryLabel ?? p.category),
      ...(p.tags ?? []).map((t) => h('span', { class: 'chip tag' }, t)),
      h('button', {
        class: 'btn sm', title: 'Recast now — updates the running dasha pointers in every view and export',
        onclick: () => { S.forceFresh = p.slug; showProfile(p.slug); },
      }, '↻'),
      h('button', { class: 'btn sm', onclick: () => personModal(p) }, 'Edit'),
    ),
    cast.meta.caveats.length ? h('p', { class: 'warnnote' }, '⚠ ' + cast.meta.caveats.join(' · ')) : null,
  );

  const TABS = [
    ['vedic', 'Vedic'], ['vargas', 'Vargas'], ['dashas', 'Dashas'],
    ['hd', 'Human Design'], ['matrix', 'Matrix'], ['export', 'Export'],
  ];
  const tabs = h('div', { class: 'tabs' },
    TABS.map(([k, label]) => h('button', {
      class: S.tab === k ? 'on' : '', 'data-tab': k,
      onclick: () => { S.tab = k; location.hash = `#/p/${slug}/${k}`; },
    }, label)),
  );
  const pane = h('div', { class: 'pane' });
  main.replaceChildren(head, tabs, pane);
  S.mountedSlug = slug; S.paneEl = pane; S.tabsEl = tabs;   // so a tab switch can swap the pane only
  scrollTabIntoView(tabs);
  renderTab(pane, p, cast);
}

// Keep the active tab in view — the strip scrolls sideways on a phone. Measured
// from rects, not offsetLeft (.tabs is statically positioned, so offsetLeft is
// relative to the page, not the scroll box).
function scrollTabIntoView(tabs) {
  requestAnimationFrame(() => {
    const on = tabs.querySelector('button.on');
    if (!on || tabs.scrollWidth <= tabs.clientWidth) return;
    const a = on.getBoundingClientRect(); const b = tabs.getBoundingClientRect();
    tabs.scrollLeft += (a.left - b.left) - (b.width - a.width) / 2;
  });
}

function renderTab(pane, p, cast) {
  const t = S.tab;
  if (t === 'vedic') return tabVedic(pane, p, cast);
  if (t === 'vargas') return tabVargas(pane, p, cast);
  if (t === 'dashas') return tabDashas(pane, cast);
  if (t === 'hd') return tabHD(pane, p, cast);
  if (t === 'matrix') return tabMatrix(pane, p, cast);
  if (t === 'export') return tabExport(pane, p);
}

// ————— VEDIC (varga-driven) —————
const VARGA_NOTES = {
  D1: 'rasi — the birth sky', D2: 'hora — wealth', D3: 'drekkana — siblings, courage',
  D4: 'chaturthamsha — home, property, fortune', D5: 'panchamsha — authority, power',
  D6: 'shashthamsha — health, debts', D7: 'saptamsha — children',
  D8: 'ashtamsha — longevity, obstacles', D9: 'navamsha — the soul chart, marriage',
  D10: 'dashamsha — career', D11: 'rudramsha — gains, dissolution',
  D12: 'dwadashamsha — parents, ancestry', D16: 'shodashamsha — vehicles, comforts',
  D20: 'vimshamsha — worship, practice', D24: 'siddhamsha — learning, knowledge',
  D27: 'bhamsha — strengths, the body subtle', D30: 'trimshamsha — challenges',
  D40: 'khavedamsha — maternal line', D45: 'akshavedamsha — paternal line',
  D60: 'shashtiamsha — the karmic root', D81: 'nav-navamsha — the fine grain of the D9',
  D108: 'ashtottaramsha — the fine grain of destiny', D144: 'dwadash-dwadashamsha — the ancestral deep line',
};

function tabVedic(pane, p, cast) {
  const timeUnknown = cast.meta.timeUnknown;
  // the view sticks: D-chart, zodiac and North/South all survive a switch
  // to another person or another tab, so charts stay comparable
  const available = Object.keys(cast.vedic.vargas);
  let zodiac = store.get('cd-zodiac', 'sidereal');
  let vargaN = Number(store.get('cd-varga', 1));
  if (!available.includes(`D${vargaN}`)) vargaN = 1;

  const pillsWrap = h('div', { class: 'pills' });
  const zodiacSeg = h('div', { class: 'seg' },
    ['sidereal', 'tropical'].map((z) => h('button', {
      class: z === zodiac ? 'on' : '',
      onclick: (e) => {
        zodiac = z;
        store.set('cd-zodiac', z);
        [...zodiacSeg.children].forEach((b) => b.classList.toggle('on', b === e.target));
        draw();
      },
    }, cap(z))));
  const noteEl = h('p', { class: 'varga-note' });
  const chartBody = h('div');
  const chartHead = h('div', { class: 'card-toolbar' });
  const glance = h('div', { class: 'card' });
  const tablesWrap = h('div');

  const pills = () => {
    pillsWrap.replaceChildren(...available.map((dn) => h('button', {
      class: 'pill' + (Number(dn.slice(1)) === vargaN ? ' on' : ''),
      onclick: () => { vargaN = Number(dn.slice(1)); store.set('cd-varga', vargaN); pills(); draw(); },
    }, dn)));
  };

  async function draw() {
    const isTrop = zodiac === 'tropical';
    pillsWrap.style.display = isTrop ? 'none' : '';
    noteEl.textContent = isTrop
      ? 'tropical — same instant, no ayanamsa; whole-sign houses from the tropical ascendant'
      : `D${vargaN} · ${VARGA_NOTES[`D${vargaN}`] ?? ''}`;

    // — chart card —
    let svgUrl, base;
    if (isTrop) {
      svgUrl = timeUnknown ? null : `/api/profiles/${p.slug}/wheel.svg`;
      base = `${p.slug}-tropical-wheel`;
    } else {
      const style = store.get('cd-chart-style', 'north');
      svgUrl = `/api/profiles/${p.slug}/chart.svg?style=${style}&varga=${vargaN}`;
      base = `${p.slug}-d${vargaN}-${style}`;
    }
    const styleSeg = isTrop ? null : h('div', { class: 'seg' },
      ['north', 'south'].map((s) => h('button', {
        class: s === store.get('cd-chart-style', 'north') ? 'on' : '',
        onclick: () => { store.set('cd-chart-style', s); draw(); },
      }, s === 'north' ? 'North ◇' : 'South ▦')));
    chartHead.replaceChildren(
      h('h3', { style: 'margin:0' }, isTrop ? 'Tropical wheel' : `Chart · D${vargaN}`),
      h('span', { style: 'display:inline-flex;gap:8px;align-items:center' },
        styleSeg, pngButtons(() => chartBody.querySelector('svg'), base)));
    if (svgUrl) { chartBody.innerHTML = await api(svgUrl); zoomable(chartBody); }
    else chartBody.replaceChildren(h('p', { class: 'warnnote' }, 'The wheel needs a birth time — the ascendant anchors it.'));
    const legend = isTrop ? 'AC on the left horizon · dashed line = MC · whole-sign cusps'
      : (store.get('cd-chart-style', 'north') === 'south'
        ? 'fixed signs · the corner diagonal + “La” marks the lagna (ascendant) of this chart'
        : 'fixed houses · the small numbers are the signs (1 = Aries … 12 = Pisces)');
    chartBody.append(h('p', { class: 'legend' }, legend));

    // — tables —
    if (isTrop) {
      const tr = cast.tropical;
      tablesWrap.replaceChildren(
        h('div', { class: 'card scroll-x' }, h('h3', {}, 'Positions · tropical'),
          h('table', { class: 'data' },
            h('tr', {}, ['Body', 'Sign', 'Degree', 'House', 'Motion'].map((c) => h('th', {}, c))),
            tr.ascendant ? h('tr', {},
              h('td', {}, 'Ascendant'), h('td', {}, tr.ascendant.signName),
              h('td', { class: 'num' }, dms(tr.ascendant.degInSign)), h('td', { class: 'num' }, '1'), h('td', {}, '')) : null,
            tr.bodies.map((x) => h('tr', {},
              h('td', {}, PLANET_LABELS[x.key]),
              h('td', {}, x.signName),
              h('td', { class: 'num' }, dms(x.degInSign)),
              h('td', { class: 'num' }, x.house ?? '—'),
              h('td', {}, x.retro ? '℞' : ''))),
          ),
        ),
        aspectsCard(cast.vedic.aspects, 'Aspects (zodiac-independent)'),
      );
      return;
    }

    const vc = vargaN === 1 ? null : await api(`/api/profiles/${p.slug}/varga?n=${vargaN}`);
    const rows = [];
    if (vargaN === 1) {
      const nk = cast.nakshatras;
      rows.push(['Ascendant', cast.vedic.ascendant.signName, dms(cast.vedic.ascendant.degInSign), nk.asc.name, nk.asc.pada, timeUnknown ? '—' : 1, '']);
      const order = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu', 'uranus', 'neptune', 'pluto'];
      for (const k of order) {
        const x = k === 'rahu' ? cast.vedic.nodes.rahu : k === 'ketu' ? cast.vedic.nodes.ketu : cast.vedic.planets.find((b) => b.body === k);
        rows.push([PLANET_LABELS[k], x.signName, dms(x.degInSign), nk[k].name, nk[k].pada, timeUnknown ? '—' : x.house, x.retro ? '℞' : '']);
      }
    } else {
      rows.push(['Ascendant', vc.ascendant.signName, dms(vc.ascendant.degInSign), vc.ascendant.nakshatra?.name ?? '—', vc.ascendant.nakshatra?.pada ?? '—', 1, '']);
      for (const x of vc.bodies) {
        rows.push([PLANET_LABELS[x.body], x.signName, dms(x.degInSign), x.nakshatra.name, x.nakshatra.pada, x.house, x.retro ? '℞' : '']);
      }
    }
    const asp = vargaN === 1 ? cast.vedic.aspects : vc.aspects;
    // Native replaceChildren() stringifies a null argument into a "null" text
    // node (unlike h(), which filters them). The trailing D1-only card is null on
    // every other varga — that was the stray "null" under the aspects table.
    tablesWrap.replaceChildren(...[
      h('div', { class: 'card scroll-x' }, h('h3', {}, `Positions · D${vargaN}`),
        h('table', { class: 'data' },
          h('tr', {}, ['Body', 'Sign', 'Degree', 'Nakshatra', 'P', 'House', 'R'].map((c) => h('th', {}, c))),
          rows.map((r) => h('tr', {}, r.map((cell, i) => h('td', { class: i === 2 || i === 4 || i === 5 ? 'num' : '' }, String(cell))))),
        ),
        vargaN !== 1 ? h('p', { class: 'legend' }, 'In a divisional chart the degree is the position within the varga’s own sign; mansions read from the varga longitude. Retrograde flags are natal.') : null,
        timeUnknown && vargaN !== 1 ? h('p', { class: 'warnnote' }, '⚠ Noon cast — hour-sensitive.') : null,
      ),
      aspectsCard(asp, `Aspects · D${vargaN}`),
      vargaN === 1 ? h('div', { class: 'grid2' }, panchangaCard(cast), karakasCard(cast)) : null,
    ].filter(Boolean));
  }

  pills();
  pane.replaceChildren(
    h('div', { class: 'vedic-top' }, pillsWrap, zodiacSeg),
    noteEl,
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, chartHead, chartBody),
      glanceCard(glance, cast, timeUnknown),
    ),
    tablesWrap,
  );
  draw();
}

function aspectsCard(asp, title) {
  if (!asp) return null;
  const row = (a) => h('tr', {},
    h('td', {}, PLANET_LABELS[a.a] ?? cap(a.a)),
    h('td', { class: 'mono asp-type' }, a.type),
    h('td', {}, PLANET_LABELS[a.b] ?? cap(a.b)),
    h('td', { class: 'num' + (a.orb < 1 ? ' tight' : '') }, dms(a.orb)),
    h('td', { class: 'mono dim' }, a.applying ? 'applying' : 'separating'));
  return h('div', { class: 'card scroll-x' }, h('h3', {}, title),
    h('table', { class: 'data' },
      h('tr', {}, ['', 'Main', '', 'Orb', 'Phase'].map((c) => h('th', {}, c))),
      (asp.main ?? []).map(row),
      (asp.other ?? []).length ? h('tr', {}, h('td', { colspan: '5', class: 'mono dim', style: 'padding-top:10px' }, 'OTHER — ANGLES + NODES')) : null,
      (asp.other ?? []).map(row),
    ));
}

function glanceCard(el, cast, timeUnknown) {
  const vc = cast.vedic, nk = cast.nakshatras;
  const moon = vc.planets.find((x) => x.body === 'moon');
  const yg = vc.yogi;
  const arudhaLine = timeUnknown ? null :
    Array.from({ length: 12 }, (_, i) => vc.arudhas[`A${i + 1}`])
      .map((a, i) => `${i === 0 ? 'AL' : i === 11 ? 'UL' : 'A' + (i + 1)} ${a.signName.slice(0, 3)}`).join(' · ');
  const now = new Date();
  const curMD = vc.dashas.find((m) => now >= new Date(m.start) && now < new Date(m.end));
  const curAD = curMD?.antardashas.find((a) => now >= new Date(a.start) && now < new Date(a.end));
  const strip = h('div', { class: 'dasha-strip' }, vc.dashas.map((m) => {
    const cur = m === curMD;
    return h('span', { class: 'ds-cell' + (cur ? ' on' : ''), style: `flex:${m.years}` }, `${m.lord.slice(0, 2)}${cur ? '·' + Math.round(m.years) : ''}`);
  }));
  el.replaceChildren(
    // Always say which chart this describes. It is built once from the RASI and
    // never redrawn when the varga pills change, so with D9 selected it sat
    // directly under a "Chart · D9" heading showing a D1 lagna — and on a phone
    // the two stack. An unlabelled card that disagrees with the table beside it
    // is how you say a wrong thing out loud.
    h('h3', {}, 'At a glance ', h('span', { class: 'glance-varga' }, 'D1 · rasi')),
    h('dl', { class: 'kv' },
      timeUnknown ? null : [h('dt', {}, 'Lagna'), h('dd', {}, `${vc.ascendant.signName} ${dms(vc.ascendant.degInSign)} · ${nk.asc.name} p${nk.asc.pada}`)],
      [h('dt', {}, 'Moon'), h('dd', {}, `${moon.signName} ${dms(moon.degInSign)} · ${nk.moon.name} p${nk.moon.pada}`)],
      [h('dt', {}, 'Ayanamsa'), h('dd', {}, `${cast.meta.ayanamsa.name} · ${dms(cast.meta.ayanamsa.deg)}`)],
      [h('dt', {}, 'Houses'), h('dd', {}, 'Whole-sign')],
      [h('dt', {}, 'Yogi'), h('dd', {}, `${yg.point.signName} ${dms(yg.point.degInSign)} (${yg.point.nakshatra.name}) · ${yg.planet} · sahayogi ${yg.duplicate}`)],
      [h('dt', {}, 'Avayogi'), h('dd', {}, `${yg.avayogi.point.signName} ${dms(yg.avayogi.point.degInSign)} (${yg.avayogi.point.nakshatra.name}) · ${yg.avayogi.planet}`)],
      arudhaLine ? [h('dt', {}, 'Arudhas'), h('dd', { class: 'small' }, arudhaLine)] : null,
      (() => {
        const st = cast.jaimini?.strength;
        if (!st) return null;
        const vg = st.bodies.filter((b) => b.vargottama).map((b) => cap(b.body));
        if (st.ascVargottama) vg.unshift('Lagna');
        const notable = st.bodies
          .filter((b) => ['exalted', 'debilitated', 'mulatrikona'].includes(b.dignity.state) || b.combust?.is)
          .map((b) => `${cap(b.body)} ${b.dignity.state !== 'node' && b.dignity.state !== 'friend' && b.dignity.state !== 'neutral' && b.dignity.state !== 'enemy' && b.dignity.state !== 'own' ? b.dignity.state : ''}${b.combust?.is ? ' combust' : ''}`.trim());
        return [
          [h('dt', {}, 'Vargottama'), h('dd', {}, vg.join(', ') || 'none')],
          notable.length ? [h('dt', {}, 'Notable'), h('dd', {}, notable.join(' · '))] : null,
        ];
      })(),
    ),
    h('h3', { style: 'margin-top:14px' }, 'Vimshottari'),
    strip,
    h('p', { class: 'md-note', style: 'margin:8px 0 0' },
      curMD ? `Current · ${curMD.lord} mahadasha${curAD ? ` · ${curAD.lord} antardasha · until ${dt(curAD.end)}` : ''}` : '—'),
  );
  return el;
}

function panchangaCard(cast) {
  const pan = cast.panchanga, nk = cast.nakshatras;
  const rows = [];
  if (pan.vara) rows.push(['Vara', `${pan.vara.name} (${pan.vara.lord})`]);
  rows.push(['Tithi', `${pan.tithi.label} — ${pan.tithi.lord}, ${pan.tithi.percentLeft.toFixed(1)}% left`]);
  rows.push(['Nakshatra', `${nk.moon.name} p${nk.moon.pada} — ${nk.moon.lord}`]);
  rows.push(['Yoga', `${pan.yoga.name} — ${pan.yoga.lord}`]);
  rows.push(['Karana', `${pan.karana.name} — ${pan.karana.deity}`]);
  if (pan.hora) rows.push(['Hora', `${pan.hora.lord} (hour ${pan.hora.index}; ☀ ${pan.hora.sunrise}–${pan.hora.sunset})`]);
  return h('div', { class: 'card' }, h('h3', {}, 'Panchanga'),
    h('dl', { class: 'kv' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
}

function karakasCard(cast) {
  const vc = cast.vedic;
  if (cast.meta.timeUnknown) return h('div', { class: 'card' }, h('h3', {}, 'Karakas'), h('p', { class: 'md-note' }, 'Chara karakas need degrees only — but arudhas need the hour.'));
  return h('div', { class: 'card' }, h('h3', {}, 'Karakas · Arudhas'),
    h('dl', { class: 'kv' },
      [h('dt', {}, 'Chara karakas'), h('dd', { class: 'small' }, vc.karakas.ranked.map((r) => `${r.karaka} ${cap(r.body)} ${dms(r.degInSign)}`).join(' · '))],
      [h('dt', {}, 'Karakamsa'), h('dd', {}, vc.karakamsa.signName)],
      [h('dt', {}, 'AL'), h('dd', {}, `${vc.arudhas.AL.signName} (H${vc.arudhas.AL.houseFromLagna})`)],
      [h('dt', {}, 'UL'), h('dd', {}, `${vc.arudhas.UL.signName} (H${vc.arudhas.UL.houseFromLagna}) · 2nd: ${vc.upapada.second.signName}`)],
    ));
}

// ————— VARGAS (the overview grid) —————
function tabVargas(pane, p, cast) {
  const vc = cast.vedic;
  const names = Object.keys(vc.vargas);
  const KEYS = ['asc', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu'];
  pane.replaceChildren(h('div', {},
    h('div', { class: 'card scroll-x' }, h('h3', {}, 'All vargas — signs'),
      h('table', { class: 'data' },
        h('tr', {}, ['Chart', ...KEYS.map((k) => k === 'asc' ? 'AS' : PLANET_LABELS[k].slice(0, 2).toUpperCase())].map((c) => h('th', {}, c))),
        names.map((dn) => h('tr', {},
          h('td', { class: 'mono' }, dn),
          KEYS.map((k) => h('td', {}, vc.vargas[dn][k].signName.slice(0, 3))),
        )),
      ),
      h('p', { class: 'legend' }, 'The divisional charts the engine implements with validated classical rules. Pick any of them in the Vedic tab for the full chart, positions, and aspects.'),
    ),
    cast.meta.timeUnknown ? h('p', { class: 'warnnote' }, '⚠ Noon cast — every varga is hour-sensitive; treat as unreliable.') : null,
  ));
}

// ————— DASHAS (MD → AD → PD, current period unrolled) —————
const DASHA_SEQ = [['Ketu', 7], ['Venus', 20], ['Sun', 6], ['Moon', 10], ['Mars', 7], ['Rahu', 18], ['Jupiter', 16], ['Saturn', 19], ['Mercury', 17]];
// sub-periods at every level share one rule: the 120-year cycle scaled
// into the parent span, entered at the parent's lord — see children()
// inside tabDashas.

function tabDashas(pane, cast) {
  const vc = cast.vedic;
  const now = Date.now();
  // — the explorable vimshottari tree: MD → AD → PD → sookshma, any
  // period expandable (past and future alike), the running chain open —
  const LEVEL_NAME = ['mahadasha', 'antardasha', 'pratyantardasha', 'sookshma'];
  const children = (node, depth) => {
    if (depth === 1 && node.antardashas) { // engine-authoritative AD dates
      return node.antardashas.map((a) => ({ lord: a.lord, start: +new Date(a.start), end: +new Date(a.end) }));
    }
    const i0 = DASHA_SEQ.findIndex(([l]) => l === node.lord);
    const span = node.end - node.start;
    let t = node.start;
    return DASHA_SEQ.map((_, j) => {
      const [l, years] = DASHA_SEQ[(i0 + j) % 9];
      const w = span * (years / 120);
      const c = { lord: l, start: t, end: t + w };
      t += w;
      return c;
    });
  };
  const fmtSpan = (ms) => {
    const d = ms / 86400e3;
    if (d >= 365) return (d / 365.25).toFixed(1) + 'y';
    if (d >= 45) return Math.round(d / 30.44) + 'mo';
    return Math.round(d) + 'd';
  };
  // the native's age when a period BEGINS — turns the clock into a life story.
  // Vimshottari's first mahadasha nominally starts before birth (the balance is
  // its remaining portion), so anything at or before birth reads "birth".
  const birthMs = +new Date(cast.meta.utc);
  const fmtAge = (ts) => {
    const ms = ts - birthMs;
    if (ms <= 0) return 'birth';
    const days = ms / 86400e3;
    const y = Math.floor(days / 365.25);
    const mo = Math.floor((days - y * 365.25) / 30.4375);
    if (y === 0) return mo === 0 ? '0' : `${mo}mo`;
    return mo === 0 ? `${y}y` : `${y}y ${mo}mo`;
  };
  const open = new Set(store.get('cd-dasha-open', []));
  // the running chain starts open
  {
    let level = vc.dashas.map((m) => ({ lord: m.lord, start: +new Date(m.start), end: +new Date(m.end), antardashas: m.antardashas }));
    let key = '';
    for (let depth = 1; depth <= 3; depth++) {
      const cur = level.find((n) => now >= n.start && now < n.end);
      if (!cur) break;
      key = key ? `${key}/${cur.lord}` : cur.lord;
      open.add(key);
      level = children(cur, depth);
    }
  }
  const table = h('table', { class: 'data' });
  const redraw = () => {
    store.set('cd-dasha-open', [...open]);
    const rows = [h('tr', {}, ['Period', 'Age', 'Span', 'Start', 'End'].map((c) => h('th', {}, c)))];
    const walk = (node, depth, key, chain) => {
      // Vimshottari's first mahadasha (and its early sub-periods) nominally begin
      // BEFORE birth — you only live the balance. Never show a date before the
      // native existed: drop anything that ends before birth, and clamp a
      // straddling period's start to the birth instant.
      if (node.end <= birthMs) return;
      const start = Math.max(node.start, birthMs);
      const cur = now >= start && now < node.end;
      const isOpen = open.has(key);
      const expandable = depth < 4;
      rows.push(h('tr', {
        class: cur ? 'hl' : '',
        style: expandable ? 'cursor:pointer' : '',
        onclick: expandable ? () => { isOpen ? open.delete(key) : open.add(key); redraw(); } : null,
      },
        h('td', { style: `padding-left:${8 + (depth - 1) * 18}px` },
          expandable ? h('span', { class: 'chev', style: 'display:inline-block;width:12px;color:var(--ink-3);font-size:9px' }, isOpen ? '▾' : '▸') : h('span', { style: 'display:inline-block;width:12px' }),
          `${chain}${cur ? ' ●' : ''}`,
          depth > 1 ? h('span', { class: 'dim', style: 'margin-left:7px;font-size:10px' }, LEVEL_NAME[depth - 1]) : null),
        h('td', { class: 'num' + (cur ? '' : ' dim') }, fmtAge(start)),
        h('td', { class: 'num' }, fmtSpan(node.end - start)),
        h('td', { class: 'num' }, dt(start)),
        h('td', { class: 'num' }, dt(node.end)),
      ));
      if (isOpen && expandable) {
        for (const c of children(node, depth)) walk(c, depth + 1, `${key}/${c.lord}`, `${chain} / ${c.lord}`.split(' / ').slice(-2).join(' / '));
      }
    };
    for (const m of vc.dashas) {
      walk({ lord: m.lord, start: +new Date(m.start), end: +new Date(m.end), antardashas: m.antardashas }, 1, m.lord, m.lord);
    }
    table.replaceChildren(...rows);
  };
  redraw();
  // — Chara Dasha (K.N. Rao) beside the vimshottari —
  const cd = cast.jaimini?.charaDasha;
  let charaCard = null;
  if (cd && !cd.note) {
    const curM = cd.current ? cd.majors.find((m) => m.signName === cd.current.major.signName) : null;
    charaCard = h('div', { class: 'card', style: 'max-width:760px' },
      h('h3', {}, `Chara Dasha (K.N. Rao standard) — ${cd.direction}`),
      h('p', { class: 'md-note', style: 'margin:0 0 8px' }, 'Sign periods, integer years from birth, −1 deductions, no exalt/debil adjustment (K.N. Rao standard).'),
      h('table', { class: 'data' },
        h('tr', {}, ['Sign', 'Years', 'Start', 'End', ''].map((c) => h('th', {}, c))),
        cd.majors.map((m) => {
          const cur = cd.current && m.signName === cd.current.major.signName;
          return h('tr', { class: cur ? 'hl' : '' },
            h('td', {}, `${m.signName}${cur ? ' ●' : ''}`),
            h('td', { class: 'num' }, String(m.years)),
            h('td', { class: 'num' }, dt(m.start)),
            h('td', { class: 'num' }, dt(m.end)),
            h('td', { class: 'dim' }, m.alternative ? `dual-lord · alt ${m.alternative.years}y` : ''));
        })),
      curM ? h('div', { style: 'margin-top:10px' },
        h('p', { class: 'md-note', style: 'margin:0 0 5px' }, `Sub-periods of the running ${curM.signName} major${cd.current.sub ? ` — now in ${cd.current.sub.signName}` : ''}:`),
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:5px' },
          curM.subs.map((s) => {
            const curS = cd.current.sub && s.signName === cd.current.sub.signName && dt(s.start) === dt(cd.current.sub.start);
            return h('span', { class: 'chip', style: curS ? 'background:var(--accent);color:#fff' : '' },
              `${s.signName} ${dt(s.start)}`);
          }))) : null,
      cd.majors.some((m) => m.alternative)
        ? h('p', { class: 'legend' }, 'Dual-lord signs (Scorpio, Aquarius): the higher-degree lord decides; the association convention stays an open question, so the alternative length is shown.')
        : null,
    );
  }
  // Standalone dasha export — the full mahadasha + antardasha timeline with ages.
  // One source of truth: the server's /dashas.md (also on the Export tab and in the
  // group archive), so every route produces exactly the same file.
  const prof = S.profiles.find((p) => p.slug === S.castSlug) ?? {};
  const b = cast.meta.input;
  const dashaUrl = `/api/profiles/${prof.slug}/dashas.md`;
  const dashaFile = () => `${prof.slug ?? 'chart'}-vimshottari-${new Date().toISOString().slice(0, 10)}`;
  const headerLines = [
    `Vimshottari Dasha — ${prof.name ?? ''}`.trim(),
    `${b.date}${b.time ? ` ${b.time}` : ' (time unknown)'}${b.place ? ` · ${b.place}` : ''}`,
    `Balance ${vc.dashaBalance.lord} ${vc.dashaBalance.years.toFixed(2)}y — Moon in ${vc.dashaBalance.nakshatra.name}`,
  ];
  const exportBar = h('div', { style: 'display:flex;gap:6px' },
    h('button', { class: 'btn sm', title: 'Save the full mahadasha + antardasha timeline as Markdown',
      onclick: async () => {
        try { downloadText(await (await fetch(dashaUrl)).text(), `${dashaFile()}.md`); toast('Saved'); }
        catch (e) { toast(`Export failed: ${e.message}`); }
      } }, 'Save .md'),
    h('button', { class: 'btn sm', title: 'Save as PDF',
      onclick: () => exportPDF(dashaUrl, null, `${dashaFile()}.pdf`, headerLines) }, 'PDF'),
  );

  pane.replaceChildren(
    h('div', { class: 'card', style: 'max-width:760px' },
      h('div', { class: 'bulk-head' },
        h('h3', { style: 'margin:0' }, `Vimshottari — balance ${vc.dashaBalance.lord} ${vc.dashaBalance.years.toFixed(2)}y (Moon in ${vc.dashaBalance.nakshatra.name})`),
        exportBar),
      h('p', { class: 'md-note', style: 'margin:8px 0 8px' },
        h('strong', {}, 'Age'), ' is how old the native is when the period begins; ',
        h('strong', {}, 'Span'), ' is how long it lasts. Click any period to unfold its sub-periods — mahadasha → antardasha → pratyantardasha → sookshma, past or future. The running chain is open and marked ●. 365.25-day years.'),
      table,
    ),
    charaCard,
  );
}

// ————— HUMAN DESIGN —————
async function tabHD(pane, p, cast) {
  const hd = cast.hd;
  if (!hd) {
    pane.replaceChildren(h('p', { class: 'warnnote' }, 'No Human Design chart — the design instant (Sun −88°) needs a birth time.'));
    return;
  }
  const graphHolder = h('div');
  api(`/api/profiles/${p.slug}/hd.svg`).then((svg) => { graphHolder.innerHTML = svg; zoomable(graphHolder); });
  const P = hd.personality, D = hd.design;
  pane.replaceChildren(
    h('div', { class: 'card' },
      h('div', { class: 'card-toolbar' }, h('h3', { style: 'margin:0' }, 'Bodygraph (computed)'),
        pngButtons(() => graphHolder.querySelector('svg'), `${p.slug}-bodygraph`)),
      graphHolder,
      h('p', { class: 'legend' }, 'Click the plate to enlarge. Gate numbers sit inside their center — the rim shows how it activates (black personality · red design · split when both).')),
    h('div', { class: 'grid2' },
    h('div', {},
      h('div', { class: 'card' }, h('h3', {}, 'Design'),
        h('dl', { class: 'kv' },
          [h('dt', {}, 'Type'), h('dd', {}, hd.type)],
          [h('dt', {}, 'Strategy'), h('dd', {}, hd.strategy)],
          [h('dt', {}, 'Authority'), h('dd', {}, hd.authority)],
          [h('dt', {}, 'Profile'), h('dd', {}, `${hd.profile.label} — ${hd.profile.names} (${hd.profile.angle})`)],
          [h('dt', {}, 'Definition'), h('dd', {}, hd.definition)],
          [h('dt', {}, 'Cross'), h('dd', {}, hd.incarnationCross.label)],
          [h('dt', {}, 'Signature'), h('dd', {}, hd.signature)],
          [h('dt', {}, 'Not-self'), h('dd', {}, hd.notSelfTheme)],
        ),
        h('h3', { style: 'margin-top:14px' }, 'Channels'),
        h('div', {}, hd.channels.length
          ? hd.channels.map((c) => h('p', { style: 'margin:3px 0', class: 'md-note' }, `${c.gates[0]}–${c.gates[1]} ${c.name}`))
          : h('p', { class: 'md-note' }, 'none')),
      ),
      h('div', { class: 'card scroll-x' }, h('h3', {}, 'Activations — gate.line, color, tone'),
        h('table', { class: 'data' },
          h('tr', {}, ['Body', 'Personality', 'c/t', 'Design', 'c/t'].map((c) => h('th', {}, c))),
          P.map((a, i) => h('tr', {},
            h('td', {}, a.label),
            h('td', { class: 'num' }, `${a.gate}.${a.line}`),
            h('td', { class: 'num dim' }, `${a.color}/${a.tone}`),
            h('td', { class: 'num' }, `${D[i].gate}.${D[i].line}`),
            h('td', { class: 'num dim' }, `${D[i].color}/${D[i].tone}`),
          )),
        ),
        h('p', { class: 'legend' }, 'Color and tone are the finer subdivisions of each line — the four Variable arrows on the plate read from the colors of the Design/Personality Sun and Nodes (1–3 point left · 4–6 right).'),
      ),
    ),
  ));
}

// ————— MATRIX —————
async function tabMatrix(pane, p, cast) {
  const mx = cast.matrix;
  const graphHolder = h('div');
  api(`/api/profiles/${p.slug}/matrix.svg`).then((svg) => { graphHolder.innerHTML = svg; zoomable(graphHolder); });
  const today = dt(new Date());
  const ringRow = (pt, big) => {
    const cur = pt.start <= today && today < pt.end;
    return h('tr', { class: `ring-row${cur ? ' hl' : ''}`, style: big ? 'font-weight:600' : '' },
      h('td', { class: 'num', style: 'white-space:nowrap' }, `${pt.label}y${cur ? ' ●' : ''}`),
      h('td', { class: 'num', style: 'white-space:nowrap' }, `${ringMonth(pt.start)} – ${ringMonth(pt.end)}`),
      h('td', { class: 'num' }, String(pt.value)),
      h('td', {}, arcName(pt.value)));
  };
  pane.replaceChildren(
    h('div', { class: 'grid2 ring-grid' },
      h('div', { class: 'card' },
        h('div', { class: 'card-toolbar' }, h('h3', { style: 'margin:0' }, 'The octagram'),
          pngButtons(() => graphHolder.querySelector('svg'), `${p.slug}-matrix`)),
        graphHolder,
        h('p', { class: 'legend' }, 'vertices A/B/C/D + corners · center E = the comfort zone · $ marks the money chain · ♥ the love line · dots on the ring are the age points')),
      h('div', {},
        h('div', { class: 'card' }, h('h3', {}, 'Lines'),
          h('dl', { class: 'kv' },
            [h('dt', {}, 'Money'), h('dd', {}, `k1 ${mx.money.k1} · k2 ${mx.money.k2} ($)`)],
            [h('dt', {}, 'Love'), h('dd', {}, `${mx.loveMoneyLine.a} — ♥ ${mx.loveMoneyLine.mid} — ${mx.loveMoneyLine.b}`)],
            [h('dt', {}, 'Paternal'), h('dd', {}, mx.generation.male.triad.join(' · '))],
            [h('dt', {}, 'Maternal'), h('dd', {}, mx.generation.female.triad.join(' · '))],
            [h('dt', {}, 'Soul'), h('dd', {}, `sky ${mx.synthesis.soul.sky} + earth ${mx.synthesis.soul.earth} → ${mx.synthesis.soul.result}`)],
            [h('dt', {}, 'Social'), h('dd', {}, `${mx.synthesis.socialization.m}/${mx.synthesis.socialization.f} → ${mx.synthesis.socialization.result}`)],
            [h('dt', {}, 'Spiritual'), h('dd', {}, mx.synthesis.spiritual)],
          )),
        h('div', { class: 'card scroll-x ring-card' }, h('h3', {}, 'Age ring — which arcanum runs when'),
        h('table', { class: 'data ring-table' },
          h('tr', {}, ['Ages', 'Years', 'Arc.', 'Name'].map((c) => h('th', {}, c))),
          mx.ageRing.flatMap((sec) => [
            h('tr', {}, h('td', { colspan: '4', class: 'mono dim', style: 'padding-top:8px' },
              `${sec.fromAge}–${sec.toAge} · ${sec.from} → ${sec.to}`)),
            ringRow(sec.corner, true),
            ...sec.points.map((pt) => ringRow(pt, pt.bold)),
          ])),
        h('p', { class: 'legend' }, 'Each card runs until the next one starts, so every date from birth to 80 has one, even where the printed ages skip a stretch. Bold rows are the big marks on the ring, the decade corners and the 5-year points. ● is running now. Hover any ring dot for the same reading.')),
      h('div', { class: 'card scroll-x' }, h('h3', {}, 'Chakras (physics / energy / emotions)'),
          h('table', { class: 'data' },
            h('tr', {}, ['Chakra', 'Sphere', 'P', 'E', 'Em'].map((c) => h('th', {}, c))),
            mx.chakras.map((c) => h('tr', {},
              h('td', {}, c.name), h('td', {}, c.label),
              h('td', { class: 'num' }, c.physics), h('td', { class: 'num' }, c.energy), h('td', { class: 'num' }, c.emotions))),
            h('tr', { class: 'hl' },
              h('td', {}, 'Result'), h('td', {}, 'Common zone'),
              h('td', { class: 'num' }, mx.result.physics), h('td', { class: 'num' }, mx.result.energy), h('td', { class: 'num' }, mx.result.emotions)),
          )),
      ),
    ),
  );
}

const ARC_NAMES = { 1: 'The Magician', 2: 'The High Priestess', 3: 'The Empress', 4: 'The Emperor', 5: 'The Hierophant', 6: 'The Lovers', 7: 'The Chariot', 8: 'Strength', 9: 'The Hermit', 10: 'The Wheel', 11: 'Justice', 12: 'The Hanged Man', 13: 'Death', 14: 'Temperance', 15: 'The Devil', 16: 'The Tower', 17: 'The Star', 18: 'The Moon', 19: 'The Sun', 20: 'Judgement', 21: 'The World', 22: 'The Fool' };
const arcName = (n) => ARC_NAMES[n] ?? '';
// a YYYY-MM-DD as "May 2027" — UTC, or a date on the 1st slips a month in any western timezone
const ringMonthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const ringMonth = (iso) => ringMonthFmt.format(Date.parse(iso));
const mdSpan = (text) => {
  const span = h('span');
  span.innerHTML = String(text)
    .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return span;
};

// ————— EXPORT —————
function tabExport(pane, p) {
  const base = location.origin;
  const cast = S.cast;
  const allVargas = Object.keys(cast?.vedic?.vargas ?? {});
  let sel = new Set(store.get('cd-export-vargas', allVargas).filter((v) => allVargas.includes(v)));
  if (!sel.size) sel = new Set(allVargas);

  const birthLine = `${p.birth.date}${p.birth.timeUnknown ? ' · noon cast' : ' · ' + p.birth.time} · ${p.birth.place ?? ''} · ${p.birth.tz}`;
  const vargaParam = () => (sel.size === allVargas.length ? '' : `?vargas=${[...sel].join(',')}`);

  const IMG_FOR = {
    'atlas.md': `/api/profiles/${p.slug}/chart.svg?style=north&standalone=1`,
    'vedic.md': `/api/profiles/${p.slug}/chart.svg?style=north&standalone=1`,
    'human-design.md': `/api/profiles/${p.slug}/hd.svg?standalone=1`,
    'matrix.md': `/api/profiles/${p.slug}/matrix.svg?standalone=1`,
  };
  const views = [
    ['atlas.md', 'Everything — the full intake pack'],
    ['vedic.md', 'Vedic: positions, vargas, dashas, strength, chara'],
    ['dashas.md', 'Vimshottari dasha timeline (with ages)'],
    ['human-design.md', 'Human Design'],
    ['matrix.md', 'Matrix of Destiny'],
    ['chart', 'Full JSON'],
  ];

  const exportRow = ([v, label]) => {
    const isVedic = v === 'vedic.md';
    const urlOf = () => `${base}/api/profiles/${p.slug}/${v}${isVedic ? vargaParam() : ''}`;
    const fnameBase = `${p.slug}-${v.replace('.md', '')}`;
    const row = h('div', { class: 'export-row' },
      h('span', { class: 'export-label' }, label),
      h('span', { class: 'path' }, `/api/profiles/${p.slug}/${v}`),
      h('button', { class: 'btn sm', onclick: () => window.open(urlOf(), '_blank') }, 'Open'),
      h('button', {
        class: 'btn sm', onclick: async () => {
          await navigator.clipboard.writeText(await (await fetch(urlOf())).text());
          toast('Copied');
        },
      }, 'Copy'),
      h('button', {
        class: 'btn sm', title: 'Download the .md file', onclick: async () => {
          downloadText(await (await fetch(urlOf())).text(), v === 'chart' ? `${fnameBase}.json` : `${fnameBase}.md`, v === 'chart' ? 'application/json' : 'text/markdown');
          toast('Saved');
        },
      }, 'Save'),
      v === 'chart' ? null : h('button', {
        class: 'btn sm', title: 'Download as PDF', onclick: () =>
          exportPDF(urlOf(), IMG_FOR[v] ?? null, `${fnameBase}.pdf`, [`${p.name} — ${label}`, birthLine, `Chart Desk · ${new Date().toISOString().slice(0, 10)}`]),
      }, 'PDF'),
    );
    if (!isVedic) return row;
    // the varga picker sits right under the Vedic row
    const chips = h('div', { class: 'varga-pick' });
    const redraw = () => {
      chips.replaceChildren(
        h('button', { class: 'btn sm ghost', onclick: () => { sel = new Set(allVargas); persist(); } }, 'All'),
        h('button', { class: 'btn sm ghost', onclick: () => { sel = new Set(['D1']); persist(); } }, 'None'),
        ...allVargas.map((dn) => h('button', {
          class: 'pill' + (sel.has(dn) ? ' on' : ''),
          onclick: () => { sel.has(dn) && sel.size > 1 ? sel.delete(dn) : sel.add(dn); persist(); },
        }, dn)));
    };
    const persist = () => { store.set('cd-export-vargas', [...sel]); redraw(); };
    redraw();
    return h('div', {}, row, h('div', { class: 'export-sub' },
      h('span', { class: 'legend', style: 'margin:0 8px 0 0' }, 'charts in the export:'), chips));
  };

  const IMGS = [
    ['North D1', `/api/profiles/${p.slug}/chart.svg?style=north&standalone=1`, `${p.slug}-d1-north.png`],
    ['South D1', `/api/profiles/${p.slug}/chart.svg?style=south&standalone=1`, `${p.slug}-d1-south.png`],
    ['North D9', `/api/profiles/${p.slug}/chart.svg?style=north&varga=9&standalone=1`, `${p.slug}-d9-north.png`],
    ['Tropical wheel', `/api/profiles/${p.slug}/wheel.svg?standalone=1`, `${p.slug}-wheel.png`],
    ['Bodygraph', `/api/profiles/${p.slug}/hd.svg?standalone=1`, `${p.slug}-bodygraph.png`],
    ['Octagram', `/api/profiles/${p.slug}/matrix.svg?standalone=1`, `${p.slug}-matrix.png`],
  ];
  pane.replaceChildren(
    h('div', { style: 'max-width:860px' },
      h('div', { class: 'export-list' }, views.map(exportRow)),
      h('div', { class: 'card', style: 'margin-top:16px' },
        h('h3', {}, 'Chart images — click to save as PNG'),
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' },
          IMGS.map(([label, url, fn]) => h('button', {
            class: 'btn sm', onclick: () => downloadPNGFromUrl(url, fn),
          }, `${label} ⤓`))),
      ),
      h('div', { class: 'card' },
        h('h3', {}, 'For agents'),
        h('p', { class: 'md-note' }, 'Point any Claude / Codex / agent session at:'),
        h('pre', { class: 'codeblock' },
          `curl -s ${base}/api/profiles/${p.slug}/atlas.md\n` +
          `curl -s ${base}/llms.txt   # the full API`)),
      h('div', { style: 'margin-top:14px;display:flex;gap:10px' },
        h('button', {
          class: 'btn danger', onclick: async () => {
            if (!confirm(`Delete ${p.name}? The profile file is removed (charts are recomputable).`)) return;
            await api(`/api/profiles/${p.slug}`, { method: 'DELETE' });
            toast('Deleted');
            location.hash = '';
            loadProfiles();
          },
        }, 'Delete profile')),
    ),
  );
}

// ————— settings —————
async function settingsModal() {
  const health = await api('/api/health').catch(() => ({}));
  const cats = [...S.cats].sort((a, b) => a.order - b.order);
  const rowsWrap = h('div', { style: 'display:grid;gap:6px' });
  const drawCats = () => {
    rowsWrap.replaceChildren(...cats.map((c, i) => {
      const inp = h('input', { type: 'text', value: c.label, style: 'flex:1;min-width:0' });
      inp.addEventListener('input', () => { c.label = inp.value; });
      return h('div', { style: 'display:flex;gap:6px;align-items:center' },
        h('span', { class: 'mono', style: 'font-size:10px;color:var(--ink-3);width:14px' }, String(i + 1)),
        inp,
        h('button', { class: 'btn sm', title: 'Move up', onclick: () => { if (i > 0) { [cats[i - 1], cats[i]] = [cats[i], cats[i - 1]]; drawCats(); } } }, '↑'),
        h('button', { class: 'btn sm', title: 'Move down', onclick: () => { if (i < cats.length - 1) { [cats[i + 1], cats[i]] = [cats[i], cats[i + 1]]; drawCats(); } } }, '↓'),
        h('button', {
          class: 'btn sm danger', title: 'Remove section (people fall back to Uncategorized)',
          onclick: () => {
            const n = S.profiles.filter((p) => p.category === c.key).length;
            if (n && !confirm(`"${c.label}" holds ${n} ${n === 1 ? 'person' : 'people'} — they'll show under Uncategorized. Remove the section?`)) return;
            cats.splice(i, 1);
            drawCats();
          },
        }, '✕'),
      );
    }));
  };
  drawCats();
  const themeSel = h('select', {},
    ['light', 'dark'].map((t) => h('option', { value: t, ...(document.documentElement.dataset.theme === t ? { selected: '' } : {}) }, cap(t))));
  const styleSel = h('select', {},
    [['north', 'North ◇ (diamond)'], ['south', 'South ▦ (square)']].map(([v, l]) =>
      h('option', { value: v, ...(store.get('cd-chart-style', 'north') === v ? { selected: '' } : {}) }, l)));
  const modal = h('div', { class: 'overlay', onclick: (e) => { if (e.target === modal) modal.remove(); } },
    h('div', { class: 'modal' },
      h('h3', {}, 'Settings'),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', {}, 'Theme'), themeSel),
        h('div', { class: 'field' }, h('label', {}, 'Default chart style'), styleSel)),
      h('div', { class: 'field' }, h('label', {}, 'Sections (rename · reorder · remove)'), rowsWrap,
        h('div', { class: 'hint' }, 'New sections: the “+ section” button at the bottom of the sidebar.')),
      h('div', { class: 'field' }, h('label', {}, 'About'),
        h('p', { class: 'md-note', style: 'margin:0' },
          `Chart Desk v${health.version ?? '?'} · ${health.profiles ?? '?'} profiles · astronomy-engine (MIT)`, h('br'),
          'Reach it from another device over your own network (e.g. a Tailscale tailnet) — the server listens on port 4700.', h('br'),
          h('a', { href: '/llms.txt', target: '_blank', class: 'mono', style: 'font-size:11px' }, '/llms.txt — the API, for agents'))),
      h('div', { class: 'modal-foot' },
        h('div', { class: 'right' },
          h('button', { class: 'btn', onclick: () => modal.remove() }, 'Cancel'),
          h('button', {
            class: 'btn primary', onclick: async () => {
              document.documentElement.dataset.theme = themeSel.value;
              localStorage.setItem('cd-theme', themeSel.value);
              store.set('cd-chart-style', styleSel.value);
              try {
                S.cats = await api('/api/categories', {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(cats.map((c, i) => ({ key: c.key, label: c.label.trim() || c.key, order: i + 1 }))),
                });
                renderSidebar();
                modal.remove();
                toast('Saved');
              } catch (e) { toast(e.message); }
            },
          }, 'Save'))),
    ));
  $('#modal-root').append(modal);
}

// ————— person modal (new/edit) —————
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Day / month / year, as three plain fields.
 *
 * `<input type="date">` is the wrong control for this app. Its picker steps one
 * month at a time, so reaching a 1990 birthday is ~430 clicks with no way to
 * jump to a year, and its segmented typing fights you on the way. Naming the
 * month also retires the DD/MM vs MM/DD ambiguity, which on birth data is worth
 * removing on its own.
 *
 * Returns { el, value } — `value` reads/writes ISO `YYYY-MM-DD`, so callers and
 * the API see exactly what the native input used to give them.
 */
function dateField(initial = '') {
  const [y0 = '', m0 = '', d0 = ''] = (initial || '').split('-');
  const num = (cls, ph, len, val) => h('input', {
    type: 'text', inputmode: 'numeric', maxlength: String(len),
    class: cls, placeholder: ph, value: val, autocomplete: 'off',
  });
  const day = num('dnum', 'DD', 2, d0);
  const year = num('dnum', 'YYYY', 4, y0);
  const mon = h('select', {},
    h('option', { value: '' }, 'Month'),
    MONTH_NAMES.map((n, i) => {
      const v = String(i + 1).padStart(2, '0');
      return h('option', { value: v, ...(m0 === v ? { selected: '' } : {}) }, n);
    }));
  const el = h('div', { class: 'dfield' }, day, mon, year);

  for (const inp of [day, year]) {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, inp.maxLength);
    });
  }
  const iso = () => {
    const y = year.value; const m = mon.value;
    const d = day.value.padStart(2, '0');
    if (y.length !== 4 || !m || !+d) return '';
    if (+d > new Date(+y, +m, 0).getDate()) return '';   // 31 Feb, 31 Apr, …
    return `${y}-${m}-${d}`;
  };

  // Flag an impossible day rather than rewriting it. Clamping looks tidy and is
  // a trap: it silently rounds 29 Feb 1992 — a real birthday — down to the 28th,
  // and it fires while the year is still half-typed, so it cannot even know the
  // month's length yet. Never quietly edit someone's birth date.
  const note = h('p', { class: 'hint dfield-bad', style: 'display:none' });
  const check = () => {
    const partYear = year.value.length > 0 && year.value.length < 4;
    const filled = day.value && mon.value && year.value.length === 4;
    const bad = partYear || (filled && !iso());
    day.classList.toggle('bad', !!(filled && !iso()));
    year.classList.toggle('bad', partYear);
    note.style.display = bad ? '' : 'none';
    if (partYear) {
      // previously silent: the box read "199", iso() returned '', and Save
      // reported "Date of birth is required" with a year plainly on screen.
      note.textContent = 'Year needs all four digits.';
    } else if (bad) {
      note.textContent = `${MONTH_NAMES[+mon.value - 1]} ${year.value} only has `
        + `${new Date(+year.value, +mon.value, 0).getDate()} days.`;
    }
  };
  // Paste a whole date into any of the three boxes and it distributes.
  // Without this the field corrupts data silently: WebKit truncates a paste to
  // maxlength BEFORE the input event fires, so pasting "1990-05-12" into the day
  // box left "19" — and the two-character auto-advance below then moved focus off
  // the box that had just lost the rest. You got 1990-05-19: a real date, wrong
  // day, nothing to flag. Order is day-first (DD.MM.YYYY, the Romanian form)
  // except for the unambiguous ISO YYYY-MM-DD.
  let pasting = false;
  const WHOLE_DATE = [
    { re: /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/, order: ['y', 'm', 'd'] },
    { re: /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/, order: ['d', 'm', 'y'] },
  ];
  el.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData)?.getData('text')?.trim();
    if (!text) return;
    for (const { re, order } of WHOLE_DATE) {
      const m = re.exec(text);
      if (!m) continue;
      const got = {};
      order.forEach((k, i) => { got[k] = m[i + 1]; });
      if (+got.m < 1 || +got.m > 12) return;          // not a date we understand
      e.preventDefault();
      day.value = got.d.padStart(2, '0');
      mon.value = got.m.padStart(2, '0');
      year.value = got.y;
      check();
      return;
    }
    // A fragment rather than a whole date: let it land, but the truncation trap
    // is the auto-advance, so suppress that for this one input event.
    pasting = true;
    setTimeout(() => { pasting = false; }, 0);
  });

  day.addEventListener('input', () => {
    if (!pasting && day.value.length === 2) mon.focus();
  });
  day.addEventListener('blur', () => {
    if (day.value) day.value = day.value.padStart(2, '0');
    check();
  });
  mon.addEventListener('change', () => { check(); if (!year.value) year.focus(); });
  year.addEventListener('input', check);
  year.addEventListener('blur', check);

  return {
    el: h('div', {}, el, note),
    get value() { return iso(); },
    focus: () => day.focus(),
  };
}

async function personModal(existing = null) {
  S.avatarOpts ??= await api('/api/avatar-options');
  const isNew = !existing;
  const st = {
    name: existing?.name ?? '', category: existing?.category ?? 'circle',
    date: existing?.birth?.date ?? '', time: existing?.birth?.time ?? '',
    timeUnknown: existing?.birth?.timeUnknown ?? false,
    lat: existing?.birth?.lat, lon: existing?.birth?.lon,
    tz: existing?.birth?.tz, place: existing?.birth?.place ?? '',
    notes: existing?.notes ?? '', tags: existing?.tags ?? [],
    avatar: { ...(existing?.avatar ?? { color: S.avatarOpts.colors[0], glyph: null, shape: 'circle' }) },
  };

  const preview = h('span');
  const redrawPreview = () => {
    preview.replaceChildren(avatarSVG({ name: st.name || '?', avatar: st.avatar }, 44));
  };

  const cityInput = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Type a city… (English name)', value: st.place });
  const cityList = h('div', { class: 'city-list', style: 'display:none' });
  const cityOk = h('div', { class: 'city-ok', style: st.tz ? '' : 'display:none' }, st.tz ? `${st.lat}, ${st.lon} · ${st.tz}` : '');
  let cityT = null;
  cityInput.addEventListener('input', () => {
    st.place = cityInput.value; st.lat = undefined; st.lon = undefined; st.tz = undefined;
    cityOk.style.display = 'none';
    clearTimeout(cityT);
    if (cityInput.value.trim().length < 2) { cityList.style.display = 'none'; return; }
    cityT = setTimeout(async () => {
      const hits = await api(`/api/cities?q=${encodeURIComponent(cityInput.value.trim())}`);
      cityList.replaceChildren(...hits.map((c) => h('button', {
        onclick: () => {
          st.place = placeLabel(c); st.lat = c.lat; st.lon = c.lon; st.tz = c.tz;
          cityInput.value = st.place;
          cityOk.textContent = `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)} · ${c.tz}`;
          cityOk.style.display = '';
          cityList.style.display = 'none';
        },
      }, h('span', {}, c.name), h('span', { class: 'cc' }, placeRegion(c)))));
      cityList.style.display = hits.length ? '' : 'none';
    }, 180);
  });

  // manual coordinates — for places under the index's population cut
  const manLat = h('input', { type: 'text', inputmode: 'decimal', placeholder: '40.7128', style: 'width:90px' });
  const manLon = h('input', { type: 'text', inputmode: 'decimal', placeholder: '-74.0060', style: 'width:90px' });
  const manTz = h('input', { type: 'text', placeholder: 'Europe/Bucharest', style: 'flex:1;min-width:120px' });
  const manRow = h('div', { style: 'display:none;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center' }, manLat, manLon, manTz,
    h('button', {
      class: 'btn sm', onclick: () => {
        const lat = Number(manLat.value), lon = Number(manLon.value), tz = manTz.value.trim();
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { toast('Latitude/longitude out of range'); return; }
        try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { toast('Unknown time zone — use an IANA name like Europe/Bucharest'); return; }
        st.lat = lat; st.lon = lon; st.tz = tz;
        st.place = cityInput.value.trim() || `${lat}, ${lon}`;
        cityOk.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)} · ${tz} (manual)`;
        cityOk.style.display = '';
        toast('Coordinates set');
      },
    }, 'Set'));
  const manToggle = h('button', {
    class: 'btn sm ghost', style: 'margin-top:6px',
    onclick: () => { manRow.style.display = manRow.style.display === 'none' ? 'flex' : 'none'; },
  }, 'enter coordinates manually');

  const timeInput = h('input', { type: 'time', value: st.time ?? '' });
  const unknownChk = h('input', { type: 'checkbox' });
  unknownChk.checked = st.timeUnknown;
  unknownChk.addEventListener('change', () => {
    st.timeUnknown = unknownChk.checked;
    timeInput.disabled = st.timeUnknown;
  });
  timeInput.disabled = st.timeUnknown;

  const nameInput = h('input', { type: 'text', value: st.name, placeholder: 'Full name' });
  nameInput.addEventListener('input', () => { st.name = nameInput.value; redrawPreview(); });

  const catSel = h('select', {}, S.cats.map((c) =>
    h('option', { value: c.key, ...(c.key === st.category ? { selected: '' } : {}) }, c.label)));
  catSel.addEventListener('change', () => { st.category = catSel.value; });

  const dateInput = dateField(st.date);
  const notesInput = h('textarea', { rows: '2' }, st.notes);
  const tagsInput = h('input', { type: 'text', value: st.tags.join(', '), placeholder: 'client, family, priority…' });

  const swatches = h('div', { class: 'swatches' }, S.avatarOpts.colors.map((c) =>
    h('button', {
      class: 'swatch' + (st.avatar.color === c ? ' on' : ''), style: `background:${c}`,
      onclick: (e) => {
        st.avatar.color = c;
        [...swatches.children].forEach((b) => b.classList.toggle('on', b === e.target));
        redrawPreview();
      },
    })));
  const glyphs = h('div', { class: 'glyphs' },
    h('button', {
      class: 'glyphbtn' + (!st.avatar.glyph ? ' on' : ''), title: 'Initials',
      onclick: (e) => { st.avatar.glyph = null; markGlyph(e.target); },
    }, 'Aa'),
    S.avatarOpts.glyphs.map((g) => h('button', {
      class: 'glyphbtn' + (st.avatar.glyph === g ? ' on' : ''),
      onclick: (e) => { st.avatar.glyph = g; markGlyph(e.target); },
    }, g)));
  const markGlyph = (btn) => { [...glyphs.children].forEach((b) => b.classList.toggle('on', b === btn)); redrawPreview(); };
  const shapes = h('div', { class: 'glyphs' }, ['circle', 'squircle', 'diamond', 'hex'].map((s) =>
    h('button', {
      class: 'glyphbtn' + (st.avatar.shape === s ? ' on' : ''), title: s,
      onclick: (e) => {
        st.avatar.shape = s;
        [...shapes.children].forEach((b) => b.classList.toggle('on', b === e.target));
        redrawPreview();
      },
    }, { circle: '●', squircle: '▢', diamond: '◆', hex: '⬡' }[s])));
  const INKS = ['#ffffff', '#1c1b22', '#F5E9D2', '#F1C40F', '#BFD7F2', '#F7C7DA'];
  st.avatar.ink ??= '#ffffff';
  const inks = h('div', { class: 'swatches' }, INKS.map((c) =>
    h('button', {
      class: 'swatch ink' + (st.avatar.ink === c ? ' on' : ''), style: `background:${c}`, title: 'Symbol color',
      onclick: (e) => {
        st.avatar.ink = c;
        [...inks.children].forEach((b) => b.classList.toggle('on', b === e.target));
        redrawPreview();
      },
    })));

  redrawPreview();

  const err = h('p', { class: 'warnnote', style: 'display:none' });
  const modal = h('div', { class: 'overlay', onclick: (e) => { if (e.target === modal) close(); } },
    h('div', { class: 'modal' },
      h('h3', {}, isNew ? 'New person' : `Edit — ${existing.name}`),
      h('div', { class: 'field' }, h('label', {}, 'Name'), nameInput),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', {}, 'Section'), catSel),
        h('div', { class: 'field' }, h('label', {}, 'Date of birth'), dateInput.el),
      ),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', {}, 'Time (24h, local)'), timeInput,
          h('div', { class: 'check', style: 'margin-top:6px' }, unknownChk, 'Time unknown → noon cast')),
        h('div', { class: 'field' }, h('label', {}, 'Place of birth'),
          h('div', { class: 'city-box' }, cityInput, cityList), cityOk, manToggle, manRow),
      ),
      h('div', { class: 'field' }, h('label', {}, 'Tags (comma-separated)'), tagsInput),
      h('div', { class: 'field' }, h('label', {}, 'Avatar'),
        h('div', { class: 'avatar-preview' }, preview,
          h('div', { style: 'flex:1;display:grid;gap:9px' },
            h('div', { class: 'av-group' }, h('span', { class: 'av-label' }, 'Background'), swatches),
            h('div', { class: 'av-group' }, h('span', { class: 'av-label' }, 'Symbol'), glyphs),
            h('div', { class: 'av-group' }, h('span', { class: 'av-label' }, 'Symbol color'), inks),
            h('div', { class: 'av-group' }, h('span', { class: 'av-label' }, 'Shape'), shapes)),
        ),
      ),
      h('div', { class: 'field' }, h('label', {}, 'Notes'), notesInput),
      err,
      h('div', { class: 'modal-foot' },
        h('div', { class: 'right' },
          h('button', { class: 'btn', onclick: () => close() }, 'Cancel'),
          h('button', {
            class: 'btn primary', onclick: async () => {
              try {
                st.notes = notesInput.value;
                st.date = dateInput.value;
                st.time = timeInput.value;
                st.tags = tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);
                if (!st.name.trim()) throw new Error('Name is required.');
                if (!st.date) throw new Error('Date of birth is required.');
                if (st.lat === undefined || !st.tz) throw new Error('Pick the birth place from the list.');
                const body = {
                  name: st.name.trim(), category: st.category, tags: st.tags,
                  birth: {
                    date: st.date, time: st.timeUnknown ? null : (st.time || null),
                    timeUnknown: st.timeUnknown || !st.time,
                    lat: st.lat, lon: st.lon, tz: st.tz, place: st.place,
                  },
                  avatar: st.avatar, notes: st.notes,
                };
                const saved = isNew
                  ? await api('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                  : await api(`/api/profiles/${existing.slug}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                close();
                await loadProfiles();
                S.cast = null;              // birth data may have changed — force a recast (the showProfile cache is keyed on slug only)
                location.hash = `#/p/${saved.slug}/vedic`;
                route();
                toast(isNew ? 'Person added' : 'Saved');
              } catch (ex) {
                err.textContent = ex.message;
                err.style.display = '';
              }
            },
          }, isNew ? 'Add & cast' : 'Save'),
        ),
      ),
    ),
  );
  const close = () => modal.remove();
  $('#modal-root').append(modal);
  nameInput.focus();
}

// ————— quick cast (no save) —————
async function castModal() {
  const st = { lat: undefined, lon: undefined, tz: undefined, place: '' };
  const cityInput = h('input', { type: 'text', autocomplete: 'off', placeholder: 'City…' });
  const cityList = h('div', { class: 'city-list', style: 'display:none' });
  const cityOk = h('div', { class: 'city-ok', style: 'display:none' });
  let t = null;
  cityInput.addEventListener('input', () => {
    st.lat = undefined; st.tz = undefined;
    cityOk.style.display = 'none';
    clearTimeout(t);
    if (cityInput.value.trim().length < 2) { cityList.style.display = 'none'; return; }
    t = setTimeout(async () => {
      const hits = await api(`/api/cities?q=${encodeURIComponent(cityInput.value.trim())}`);
      cityList.replaceChildren(...hits.map((c) => h('button', {
        onclick: () => {
          st.place = placeLabel(c); st.lat = c.lat; st.lon = c.lon; st.tz = c.tz;
          cityInput.value = st.place;
          cityOk.textContent = `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)} · ${c.tz}`;
          cityOk.style.display = ''; cityList.style.display = 'none';
        },
      }, h('span', {}, c.name), h('span', { class: 'cc' }, placeRegion(c)))));
      cityList.style.display = hits.length ? '' : 'none';
    }, 180);
  });
  const dateI = dateField();
  const timeI = h('input', { type: 'time' });
  const err = h('p', { class: 'warnnote', style: 'display:none' });
  const modal = h('div', { class: 'overlay', onclick: (e) => { if (e.target === modal) modal.remove(); } },
    h('div', { class: 'modal' },
      h('h3', {}, 'Quick cast — nothing saved'),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', {}, 'Date'), dateI.el),
        h('div', { class: 'field' }, h('label', {}, 'Time (blank = noon)'), timeI),
      ),
      h('div', { class: 'field' }, h('label', {}, 'Place'), h('div', { class: 'city-box' }, cityInput, cityList), cityOk),
      err,
      h('div', { class: 'modal-foot' },
        h('div', { class: 'right' },
          h('button', { class: 'btn', onclick: () => modal.remove() }, 'Cancel'),
          h('button', {
            class: 'btn primary', onclick: () => {
              if (!dateI.value || st.lat === undefined) { err.textContent = 'Date + a picked place are required.'; err.style.display = ''; return; }
              const q = new URLSearchParams({ date: dateI.value, lat: st.lat, lon: st.lon, tz: st.tz, place: st.place });
              if (timeI.value) q.set('time', timeI.value);
              window.open(`/api/cast/atlas.md?${q}`, '_blank');
            },
          }, 'Cast → atlas.md'),
        ),
      ),
    ),
  );
  $('#modal-root').append(modal);
}

// ————— chrome —————
$('#newbtn').addEventListener('click', () => personModal());
$('#castbtn').addEventListener('click', () => castModal());
$('#filter').addEventListener('input', (e) => { S.filter = e.target.value; renderSidebar(); });
$('#themebtn').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = cur;
  localStorage.setItem('cd-theme', cur);
});
$('#menubtn').addEventListener('click', () => $('#side').classList.toggle('open'));
const closeSide = () => $('#side').classList.remove('open');
$('#side-scrim').addEventListener('click', closeSide);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSide(); });
$('#settingsbtn').addEventListener('click', () => settingsModal());
$('#importbtn').addEventListener('click', () => importModal());
$('#dashlink').addEventListener('click', () => {
  location.hash = '';
  $('#side').classList.remove('open');
  route();
});

// boot
await loadProfiles();
route();
