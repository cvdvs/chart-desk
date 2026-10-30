// ============================================================
// Geographic display names + the smart place search. The
// GeoNames shards carry ISO country codes and admin1 codes;
// these maps give them readable names, and searchPlaces() lets
// a query mix city + state + country in any order
// ("berlin vermont", "vermont berlin", "paris texas",
// "cluj romania") — the city index itself stays the vendored
// engine's, untouched).
// ============================================================
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchCities, fold } from './engine/geo.js';

// Hand-added places — the bundled GeoNames set is cities15000, so
// small towns (Berlin VT, ~2.8k) simply are not in it. This file
// survives `sync-engines.mjs`, which only refreshes the vendored
// shards. Same record shape as a search hit.
const CUSTOM_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), 'data/places-custom.json');
let customCache = null;
function customPlaces() {
  if (customCache) return customCache;
  try {
    customCache = existsSync(CUSTOM_PATH) ? JSON.parse(readFileSync(CUSTOM_PATH, 'utf8')) : [];
  } catch {
    customCache = [];
  }
  return customCache;
}

export const COUNTRY = {
  AD: 'Andorra', AE: 'United Arab Emirates', AF: 'Afghanistan', AG: 'Antigua and Barbuda', AI: 'Anguilla', AL: 'Albania', AM: 'Armenia', AO: 'Angola', AR: 'Argentina', AS: 'American Samoa', AT: 'Austria', AU: 'Australia', AW: 'Aruba', AX: 'Åland', AZ: 'Azerbaijan',
  BA: 'Bosnia and Herzegovina', BB: 'Barbados', BD: 'Bangladesh', BE: 'Belgium', BF: 'Burkina Faso', BG: 'Bulgaria', BH: 'Bahrain', BI: 'Burundi', BJ: 'Benin', BM: 'Bermuda', BN: 'Brunei', BO: 'Bolivia', BQ: 'Caribbean Netherlands', BR: 'Brazil', BS: 'Bahamas', BT: 'Bhutan', BW: 'Botswana', BY: 'Belarus', BZ: 'Belize',
  CA: 'Canada', CC: 'Cocos Islands', CD: 'DR Congo', CF: 'Central African Republic', CG: 'Congo', CH: 'Switzerland', CI: "Côte d'Ivoire", CK: 'Cook Islands', CL: 'Chile', CM: 'Cameroon', CN: 'China', CO: 'Colombia', CR: 'Costa Rica', CU: 'Cuba', CV: 'Cabo Verde', CW: 'Curaçao', CY: 'Cyprus', CZ: 'Czechia',
  DE: 'Germany', DJ: 'Djibouti', DK: 'Denmark', DM: 'Dominica', DO: 'Dominican Republic', DZ: 'Algeria',
  EC: 'Ecuador', EE: 'Estonia', EG: 'Egypt', EH: 'Western Sahara', ER: 'Eritrea', ES: 'Spain', ET: 'Ethiopia',
  FI: 'Finland', FJ: 'Fiji', FK: 'Falkland Islands', FM: 'Micronesia', FO: 'Faroe Islands', FR: 'France',
  GA: 'Gabon', GB: 'United Kingdom', GD: 'Grenada', GE: 'Georgia', GF: 'French Guiana', GG: 'Guernsey', GH: 'Ghana', GI: 'Gibraltar', GL: 'Greenland', GM: 'Gambia', GN: 'Guinea', GP: 'Guadeloupe', GQ: 'Equatorial Guinea', GR: 'Greece', GT: 'Guatemala', GU: 'Guam', GW: 'Guinea-Bissau', GY: 'Guyana',
  HK: 'Hong Kong', HN: 'Honduras', HR: 'Croatia', HT: 'Haiti', HU: 'Hungary',
  ID: 'Indonesia', IE: 'Ireland', IL: 'Israel', IM: 'Isle of Man', IN: 'India', IQ: 'Iraq', IR: 'Iran', IS: 'Iceland', IT: 'Italy',
  JE: 'Jersey', JM: 'Jamaica', JO: 'Jordan', JP: 'Japan',
  KE: 'Kenya', KG: 'Kyrgyzstan', KH: 'Cambodia', KI: 'Kiribati', KM: 'Comoros', KN: 'Saint Kitts and Nevis', KP: 'North Korea', KR: 'South Korea', KW: 'Kuwait', KY: 'Cayman Islands', KZ: 'Kazakhstan',
  LA: 'Laos', LB: 'Lebanon', LC: 'Saint Lucia', LI: 'Liechtenstein', LK: 'Sri Lanka', LR: 'Liberia', LS: 'Lesotho', LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', LY: 'Libya',
  MA: 'Morocco', MC: 'Monaco', MD: 'Moldova', ME: 'Montenegro', MF: 'Saint Martin', MG: 'Madagascar', MH: 'Marshall Islands', MK: 'North Macedonia', ML: 'Mali', MM: 'Myanmar', MN: 'Mongolia', MO: 'Macao', MP: 'Northern Mariana Islands', MQ: 'Martinique', MR: 'Mauritania', MS: 'Montserrat', MT: 'Malta', MU: 'Mauritius', MV: 'Maldives', MW: 'Malawi', MX: 'Mexico', MY: 'Malaysia', MZ: 'Mozambique',
  NA: 'Namibia', NC: 'New Caledonia', NE: 'Niger', NF: 'Norfolk Island', NG: 'Nigeria', NI: 'Nicaragua', NL: 'Netherlands', NO: 'Norway', NP: 'Nepal', NR: 'Nauru', NU: 'Niue', NZ: 'New Zealand',
  OM: 'Oman',
  PA: 'Panama', PE: 'Peru', PF: 'French Polynesia', PG: 'Papua New Guinea', PH: 'Philippines', PK: 'Pakistan', PL: 'Poland', PM: 'Saint Pierre and Miquelon', PR: 'Puerto Rico', PS: 'Palestine', PT: 'Portugal', PW: 'Palau', PY: 'Paraguay',
  QA: 'Qatar',
  RE: 'Réunion', RO: 'Romania', RS: 'Serbia', RU: 'Russia', RW: 'Rwanda',
  SA: 'Saudi Arabia', SB: 'Solomon Islands', SC: 'Seychelles', SD: 'Sudan', SE: 'Sweden', SG: 'Singapore', SH: 'Saint Helena', SI: 'Slovenia', SJ: 'Svalbard', SK: 'Slovakia', SL: 'Sierra Leone', SM: 'San Marino', SN: 'Senegal', SO: 'Somalia', SR: 'Suriname', SS: 'South Sudan', ST: 'São Tomé and Príncipe', SV: 'El Salvador', SX: 'Sint Maarten', SY: 'Syria', SZ: 'Eswatini',
  TC: 'Turks and Caicos', TD: 'Chad', TG: 'Togo', TH: 'Thailand', TJ: 'Tajikistan', TK: 'Tokelau', TL: 'Timor-Leste', TM: 'Turkmenistan', TN: 'Tunisia', TO: 'Tonga', TR: 'Türkiye', TT: 'Trinidad and Tobago', TV: 'Tuvalu', TW: 'Taiwan', TZ: 'Tanzania',
  UA: 'Ukraine', UG: 'Uganda', US: 'United States', UY: 'Uruguay', UZ: 'Uzbekistan',
  VA: 'Vatican City', VC: 'Saint Vincent and the Grenadines', VE: 'Venezuela', VG: 'British Virgin Islands', VI: 'U.S. Virgin Islands', VN: 'Vietnam', VU: 'Vanuatu',
  WF: 'Wallis and Futuna', WS: 'Samoa',
  XK: 'Kosovo',
  YE: 'Yemen', YT: 'Mayotte',
  ZA: 'South Africa', ZM: 'Zambia', ZW: 'Zimbabwe',
};

export const US_STATE = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

// Canadian provinces share the two-letter-admin1 convention in GeoNames
export const CA_PROV = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};

const lc = (s) => String(s ?? '').toLowerCase();

export function adminName(c) {
  if (c.country === 'US') return US_STATE[c.admin1] ?? c.admin1;
  if (c.country === 'CA') return CA_PROV[c.admin1] ?? c.admin1;
  return /^[A-Z]{2}$/.test(c.admin1 ?? '') ? c.admin1 : null; // numeric admin codes stay hidden
}
export const countryName = (code) => COUNTRY[code] ?? code;

function regionMatches(c, token) {
  const t = lc(token);
  if (!t) return true;
  if (lc(c.country) === t) return true;
  if (lc(countryName(c.country)).includes(t)) return true;
  if (lc(c.admin1) === t) return true;
  const an = adminName(c);
  if (an && lc(an).includes(t)) return true;
  return false;
}

function enrich(c) {
  return { ...c, adminName: adminName(c), countryName: countryName(c.country) };
}

/**
 * Place search over the bundled index, tokens in any order:
 * try progressively shorter city phrases from the front AND the
 * back of the query; leftover tokens must match state/country.
 */
export async function searchPlaces(query, fetcher, limit = 12) {
  const tokens = lc(query).trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) return [];
  const splits = [];
  for (let k = tokens.length; k >= 1; k--) {
    splits.push([tokens.slice(0, k).join(' '), tokens.slice(k)]);           // city first
    if (k < tokens.length) splits.push([tokens.slice(-k).join(' '), tokens.slice(0, -k)]); // city last
  }
  for (const [cityQ, regionT] of splits) {
    const folded = fold(cityQ);
    let hits = [
      ...await searchCities(cityQ, fetcher),
      ...customPlaces().filter((c) => fold(c.name).startsWith(folded)),
    ].sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
    if (!hits.length) continue;
    if (regionT.length) {
      hits = hits.filter((c) => regionT.every((t) => regionMatches(c, t)));
      if (!hits.length) continue;
    }
    return hits.slice(0, limit).map(enrich);
  }
  return [];
}
