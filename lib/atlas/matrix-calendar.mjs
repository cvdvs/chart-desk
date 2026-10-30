// ============================================================
// The Matrix age ring on the calendar: which arcanum runs when,
// as dates counted from the birth date.
//
// A period opens at the first age of its printed label and holds
// until the next period opens. The printed labels skip a stretch
// (3.5–4 then 5, 8.5–9 then 10), but the ring is a clock with no
// stretch of a life left off it, and this reading keeps its beat:
// spans of 18 and 12 months in turn, 15 on average, the ring's
// own step. A decade corner holds its whole year, 30y running
// from the 30th birthday to the 31st.
//
// The engine's ring is left as it is. This adds `start` and `end`
// (YYYY-MM-DD) beside it, plus a `corner` entry per sector,
// because the corners are periods too.
// ============================================================

/** The civil date `age` years after birth; a month too short keeps its last day. */
export function dateAtAge({ year, month, day }, age) {
  const months = month - 1 + Math.round(age * 12);
  const y = year + Math.floor(months / 12);
  const m = months % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(m + 1)}-${pad(Math.min(day, lastDay))}`;
}

/** The age ring with every period dated, from birth to the 80th birthday. */
export function ringCalendar(ring, birth) {
  const dated = ring.map((sec) => ({
    ...sec,
    corner: { value: sec.from, label: String(sec.fromAge) },
    points: sec.points.map((p) => ({ ...p })),
  }));
  const periods = dated.flatMap((sec) => [sec.corner, ...sec.points]);
  const opens = (p) => parseFloat(p.label);
  periods.forEach((p, i) => {
    p.start = dateAtAge(birth, opens(p));
    p.end = dateAtAge(birth, i + 1 < periods.length ? opens(periods[i + 1]) : dated.at(-1).toAge);
  });
  return dated;
}
