// ============================================================
// Nakshatra metadata — the classical attribute layer on top of
// ephemeris.js's NAKSHATRAS (which carries index/name/lord).
// Deities per the classical canonical table; padas,
// pada lords (navamsa sign lords), and purushartha per the
// standard tables astro-seek prints (verified against the
// reference charts).
// ============================================================
import { norm360, nakshatraOf } from '../engine/ephemeris.js';
import { varga, SIGN_LORDS, SIGNS } from '../engine/jyotish.js';

const SPAN = 360 / 27; // 13°20′
const PADA = SPAN / 4; // 3°20′

/** Devatās — the classical canonical 27. */
export const DEITIES = [
  'Ashvins', 'Yama', 'Agni', 'Brahma / Prajapati', 'Soma', 'Rudra', 'Aditi',
  'Brihaspati', 'the Nagas', 'the Pitris', 'Bhaga', 'Aryaman', 'Savitr',
  'Tvashtar', 'Vayu', 'Indragni', 'Mitra', 'Indra', 'Nirriti', 'Apas',
  'Vishvedevas', 'Vishnu', 'the Ashta Vasus', 'Varuna', 'Aja Ekapada',
  'Ahir Budhnya', 'Pushan',
];

/** Traditional symbols (compressed). */
export const SYMBOLS = [
  "the horse's head", 'the yoni', 'the razor, the flame', 'the ox-cart',
  "the deer's head", 'the teardrop', 'the quiver of arrows', 'the lotus, the udder',
  'the coiled serpent', 'the royal throne', 'the front legs of the bed',
  'the back legs of the bed', 'the hand', 'the bright jewel', 'the young shoot in wind',
  'the triumphal arch', 'the lotus offered', 'the earring, the umbrella',
  'the tied bunch of roots', 'the winnowing fan', "the elephant's tusk",
  'the ear, the three footprints', 'the drum', 'the empty circle',
  'the sword, the two-faced man', 'the serpent of the deep', 'the pair of fish',
];

/**
 * Purushartha per nakshatra — the repeating [D A K M M K A D]
 * palindrome (matches the reference tables: Hasta → Moksha,
 * Swati → Artha, Mula → Kama, P.Ashadha → Moksha, Shatabhisha →
 * Dharma …).
 */
const P_CYCLE = ['Dharma', 'Artha', 'Kama', 'Moksha', 'Moksha', 'Kama', 'Artha', 'Dharma'];
export const PURUSHARTHA = Array.from({ length: 27 }, (_, i) => P_CYCLE[i % 8]);

/** Gana — deva / manushya / rakshasa (standard table). */
const GANA_DEVA = new Set([0, 4, 6, 7, 12, 14, 16, 21, 26]);
const GANA_MANUSHYA = new Set([1, 3, 5, 10, 11, 19, 20, 24, 25]);
export const GANA = Array.from({ length: 27 }, (_, i) =>
  GANA_DEVA.has(i) ? 'Deva' : GANA_MANUSHYA.has(i) ? 'Manushya' : 'Rakshasa',
);

/**
 * The full nakshatra story for a sidereal longitude: name, lord,
 * deity, symbol, pada 1–4, the pada's navamsa sign + lord, the
 * purushartha, gana, and position within the mansion.
 */
export function nakshatraDetail(siderealLon) {
  const lon = norm360(siderealLon);
  const { index, name, pada, lord } = nakshatraOf(lon);
  const inNak = lon - index * SPAN;
  const d9 = varga(lon, 9);
  return {
    index,
    num: index + 1,
    name,
    lord,
    deity: DEITIES[index],
    symbol: SYMBOLS[index],
    pada,
    padaSign: SIGNS[d9.sign],
    padaLord: cap(SIGN_LORDS[d9.sign]),
    purushartha: PURUSHARTHA[index],
    gana: GANA[index],
    degInNakshatra: inNak,
    fractionTraversed: inNak / SPAN,
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
