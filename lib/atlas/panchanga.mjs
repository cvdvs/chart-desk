// ============================================================
// Panchanga — the five limbs of the birth moment (vara, tithi,
// nakshatra, yoga, karana) plus the hora, matching the reference
// tables (astro-seek's panchanga block).
//
// Conventions, verified against the reference chart
// (1 Jan 1970 00:00 EET Bucharest → Wednesday vara, Krishna
// Ashtami / Rahu, Balava / Brahma, Shobhana / Sun, Jupiter hora
// as the 18th hour from the 07:51 sunrise):
// · vara day-boundary = local sunrise, not midnight
// · tithi = ⌊(Moon − Sun)/12°⌋; planetary lord cycles
//   Sun…Rahu (8) restarting each paksha
// · yoga = ⌊(sid.Sun + sid.Moon)/13°20′⌋; planetary lord = the
//   vimshottari cycle starting from Saturn at Vishkambha
// · karana = half-tithi; 7 movable (weekday-order lords) + 4 fixed
// · hora: 12 day-twelfths sunrise→sunset + 12 night-twelfths,
//   lord 1 = vara lord, then the Chaldean descent
// ============================================================
import { Observer, SearchRiseSet, Body } from 'astronomy-engine';
import { norm360, positions, ayanamsa, sidereal } from '../engine/ephemeris.js';
import { offsetAt } from '../engine/geo.js';

export const TITHI_NAMES = [
  'Pratipada', 'Dvitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashti',
  'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dvadashi',
  'Trayodashi', 'Chaturdashi',
];
const TITHI_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu'];

export const YOGA_NAMES = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda',
  'Sukarma', 'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata',
  'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyan', 'Parigha', 'Shiva',
  'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
];
// the vimshottari planet cycle, entered at Saturn for Vishkambha
const VIM_CYCLE = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const YOGA_LORDS = Array.from({ length: 27 }, (_, i) => VIM_CYCLE[(7 + i) % 9]);

const KARANA_MOVABLE = [
  { name: 'Bava', lord: 'Sun', deity: 'Indra' },
  { name: 'Balava', lord: 'Moon', deity: 'Brahma' },
  { name: 'Kaulava', lord: 'Mars', deity: 'Mitra' },
  { name: 'Taitila', lord: 'Mercury', deity: 'Aryama' },
  { name: 'Gara', lord: 'Jupiter', deity: 'Prithvi' },
  { name: 'Vanija', lord: 'Venus', deity: 'Lakshmi' },
  { name: 'Vishti', lord: 'Saturn', deity: 'Yama' },
];
const KARANA_FIXED = {
  0: { name: 'Kimstughna', lord: null, deity: 'Marut' },
  57: { name: 'Shakuni', lord: null, deity: 'Kali' },
  58: { name: 'Chatushpada', lord: null, deity: 'Rudra' },
  59: { name: 'Naga', lord: null, deity: 'the Nagas' },
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const VARA_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
// Chaldean descent, cycled for the horas
const CHALDEAN = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];

/** Local wall-clock pieces of a UT instant in an IANA zone. */
function localParts(utDate, tz) {
  const off = offsetAt(tz, utDate); // minutes
  const l = new Date(utDate.getTime() + off * 60000);
  return {
    y: l.getUTCFullYear(), mo: l.getUTCMonth() + 1, d: l.getUTCDate(),
    dow: l.getUTCDay(), hh: l.getUTCHours(), mm: l.getUTCMinutes(),
  };
}

function fmtLocal(utDate, tz) {
  if (!utDate) return null;
  const p = localParts(utDate, tz);
  return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}

/**
 * Sunrise/sunset bracketing a UT instant at a place: the sunrise
 * at or before the instant, the following sunset and sunrise.
 */
function sunFrame(utDate, latDeg, lonDeg) {
  const obs = new Observer(latDeg, lonDeg, 0);
  const from = new Date(utDate.getTime() - 36 * 3600e3);
  let rise = SearchRiseSet(Body.Sun, obs, +1, from, 3);
  let prevRise = null;
  while (rise && rise.date <= utDate) {
    prevRise = rise;
    rise = SearchRiseSet(Body.Sun, obs, +1, new Date(rise.date.getTime() + 60e3), 3);
  }
  if (!prevRise) return null; // polar edge — no sunrise found
  const sunrise = prevRise.date;
  const sunset = SearchRiseSet(Body.Sun, obs, -1, sunrise, 3)?.date ?? null;
  const nextSunrise = rise?.date ?? null;
  return { sunrise, sunset, nextSunrise };
}

/**
 * The panchanga of a birth instant.
 * @param {{utDate:Date, latDeg:number, lonDeg:number, tz:string}} input
 */
export function panchanga({ utDate, latDeg, lonDeg, tz }) {
  const trop = positions(utDate);
  const sid = sidereal(trop, ayanamsa(utDate)).bodies;
  const elong = norm360(trop.bodies.moon.lon - trop.bodies.sun.lon); // ayanamsa cancels

  // — tithi —
  const tIdx = Math.floor(elong / 12); // 0–29
  const paksha = tIdx < 15 ? 'Shukla' : 'Krishna';
  const inPaksha = tIdx % 15; // 0–14
  const tithiName =
    inPaksha === 14 ? (paksha === 'Shukla' ? 'Purnima' : 'Amavasya') : TITHI_NAMES[inPaksha];
  const tithi = {
    index: tIdx + 1, paksha, name: tithiName,
    label: `${paksha} ${tithiName}`,
    lord: TITHI_LORDS[inPaksha % 8],
    percentLeft: (1 - (elong % 12) / 12) * 100,
  };

  // — yoga (sidereal sum) —
  const ySum = norm360(sid.sun.lon + sid.moon.lon);
  const yIdx = Math.floor(ySum / (360 / 27));
  const yoga = {
    index: yIdx + 1, name: YOGA_NAMES[yIdx], lord: YOGA_LORDS[yIdx],
    percentLeft: (1 - (ySum % (360 / 27)) / (360 / 27)) * 100,
  };

  // — karana (half-tithi) —
  const kIdx = Math.floor(elong / 6); // 0–59
  const karana = KARANA_FIXED[kIdx] ?? KARANA_MOVABLE[(kIdx - 1) % 7];
  const karanaOut = {
    index: kIdx + 1, ...karana,
    percentLeft: (1 - (elong % 6) / 6) * 100,
  };

  // — vara + hora (need the sun frame) —
  const frame = sunFrame(utDate, latDeg, lonDeg);
  let vara = null;
  let hora = null;
  if (frame) {
    const p = localParts(frame.sunrise, tz);
    const varaDow = p.dow;
    vara = { name: WEEKDAYS[varaDow], lord: VARA_LORDS[varaDow] };

    let horaIndex; // 1–24 from sunrise
    if (frame.sunset && utDate < frame.sunset) {
      const t = (utDate - frame.sunrise) / (frame.sunset - frame.sunrise);
      horaIndex = Math.min(11, Math.floor(t * 12)) + 1;
    } else if (frame.sunset && frame.nextSunrise) {
      const t = (utDate - frame.sunset) / (frame.nextSunrise - frame.sunset);
      horaIndex = 12 + Math.min(11, Math.floor(t * 12)) + 1;
    }
    if (horaIndex) {
      const startIdx = CHALDEAN.indexOf(VARA_LORDS[varaDow]);
      hora = {
        index: horaIndex,
        lord: CHALDEAN[(startIdx + horaIndex - 1) % 7],
        sunrise: fmtLocal(frame.sunrise, tz),
        sunset: fmtLocal(frame.sunset, tz),
      };
    }
  }

  return { vara, tithi, yoga, karana: karanaOut, hora };
}
