// US state abbreviations → full names
const US_STATES = {
  AL: 'Alabama',        AK: 'Alaska',         AZ: 'Arizona',        AR: 'Arkansas',
  CA: 'California',     CO: 'Colorado',       CT: 'Connecticut',    DE: 'Delaware',
  FL: 'Florida',        GA: 'Georgia',        HI: 'Hawaii',         ID: 'Idaho',
  IL: 'Illinois',       IN: 'Indiana',        IA: 'Iowa',           KS: 'Kansas',
  KY: 'Kentucky',       LA: 'Louisiana',      ME: 'Maine',          MD: 'Maryland',
  MA: 'Massachusetts',  MI: 'Michigan',       MN: 'Minnesota',      MS: 'Mississippi',
  MO: 'Missouri',       MT: 'Montana',        NE: 'Nebraska',       NV: 'Nevada',
  NH: 'New Hampshire',  NJ: 'New Jersey',     NM: 'New Mexico',     NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota',   OH: 'Ohio',           OK: 'Oklahoma',
  OR: 'Oregon',         PA: 'Pennsylvania',   RI: 'Rhode Island',   SC: 'South Carolina',
  SD: 'South Dakota',   TN: 'Tennessee',      TX: 'Texas',          UT: 'Utah',
  VT: 'Vermont',        VA: 'Virginia',       WA: 'Washington',     WV: 'West Virginia',
  WI: 'Wisconsin',      WY: 'Wyoming',        DC: 'District of Columbia',
};

// Canadian province abbreviations → full names
const CA_PROVINCES = {
  AB: 'Alberta',                    BC: 'British Columbia',
  MB: 'Manitoba',                   NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',  NS: 'Nova Scotia',
  NT: 'Northwest Territories',      NU: 'Nunavut',
  ON: 'Ontario',                    PE: 'Prince Edward Island',
  QC: 'Quebec',                     SK: 'Saskatchewan',
  YT: 'Yukon',
};

// Country abbreviations → full names
const COUNTRIES = {
  US: 'United States',  USA: 'United States',
  UK: 'United Kingdom', GB:  'Great Britain',
  CAN: 'Canada',
  AUS: 'Australia',
  NZ:  'New Zealand',
  ENG: 'England',
  SCO: 'Scotland',      SCOT: 'Scotland',
  WAL: 'Wales',
  IRE: 'Ireland',
  GER: 'Germany',       DEU: 'Germany',
  FRA: 'France',
  ITA: 'Italy',
  ESP: 'Spain',
  NLD: 'Netherlands',
  NOR: 'Norway',
  SWE: 'Sweden',
  DNK: 'Denmark',
  POL: 'Poland',
  RUS: 'Russia',
  MEX: 'Mexico',
};

// Set of full US state names for quick membership tests
const US_STATE_NAMES = new Set(Object.values(US_STATES));

// Prepositions/articles kept lowercase inside a place name
const LOWER_WORDS = new Set([
  'of', 'the', 'and', 'de', 'la', 'le', 'van', 'von', 'der', 'den', 'du', 'del', 'los', 'las',
]);

function titleCase(str) {
  return str.toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i > 0 && LOWER_WORDS.has(word)) return word;
      // Capitalize each hyphen-separated component (Winston-Salem, Stratford-upon-Avon)
      return word.split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('-');
    })
    .join(' ');
}

// Only re-case if the input is uniformly all-lowercase or all-uppercase.
// Mixed-case input (e.g. "McCullough", "Île-de-France") is left alone.
function normalizeCasing(str) {
  const letters = str.replace(/[^a-zA-Z]/g, '');
  if (!letters) return str;
  if (letters === letters.toUpperCase() || letters === letters.toLowerCase()) return titleCase(str);
  return str;
}

// Look up an abbreviation key across all tables. Returns the full name or null.
function lookupAbbrev(key) {
  return COUNTRIES[key] ?? US_STATES[key] ?? CA_PROVINCES[key] ?? null;
}

// Expand one place token: abbreviation → full name, then normalize casing.
// Returns null for blank input.
function expandPart(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Strip internal periods for lookup (U.S.A. → USA, D.C. → DC)
  const key = trimmed.toUpperCase().replace(/\./g, '');
  return lookupAbbrev(key) ?? normalizeCasing(trimmed);
}

// If a chunk ends with a space-separated known abbreviation, split it off.
// e.g. "Michigan USA" → ["Michigan", "USA"]
//      "Detroit MI"   → ["Detroit", "MI"]
// Returns null if no trailing abbreviation is found.
function splitAbbrevSuffix(str) {
  const words = str.split(/\s+/);
  if (words.length < 2) return null;
  const last = words[words.length - 1];
  const key  = last.toUpperCase().replace(/\./g, '');
  if (lookupAbbrev(key)) return [words.slice(0, -1).join(' '), last];
  return null;
}

// Repeatedly strip abbreviation suffixes from a space-separated chunk.
// e.g. "Detroit MI USA" → ["Detroit", "MI", "USA"]
//      "Lenawee MI"     → ["Lenawee", "MI"]
//      "Michigan"       → ["Michigan"]
function splitAllAbbrevs(str) {
  const result = [];
  let remaining = str.trim();
  while (remaining) {
    const split = splitAbbrevSuffix(remaining);
    if (split) {
      result.unshift(split[1]);
      remaining = split[0].trim();
    } else {
      result.unshift(remaining);
      break;
    }
  }
  return result;
}

// Parse a place string into an array of normalized, expanded parts.
//
// Handles:
//   "Tecumseh, Lenawee, Michigan, United States"  standard comma form
//   "Lenawee, Michigan USA"                        country appended without comma
//   "Detroit MI"                                   city + state abbrev, no comma
//   "Detroit MI USA"                               city + state + country, no commas
//   "new york, ny, usa"                            all-lowercase
//   "DETROIT, MICHIGAN, USA"                       all-uppercase
//   "Springfield, IL 62701"                        with zip code
//   "Paris; France"  or  "Paris / France"          alternate separators
//   "D.C." / "U.S.A."                              dotted abbreviations
//   "Winston-Salem, NC"                            hyphenated city
//
// Returns null for empty/whitespace-only input.
export function parsePlace(str) {
  if (!str || !str.trim()) return null;

  const parts = [];
  for (const raw of str.split(/,|;|\s*\/\s*/)) {
    // Strip trailing US zip codes ("IL 62701" → "IL", "OH 44101-1234" → "OH")
    const cleaned = raw.trim().replace(/\s+\d{5}(-\d{4})?$/, '').trim();
    if (!cleaned) continue;

    for (const token of splitAllAbbrevs(cleaned)) {
      const expanded = expandPart(token);
      if (expanded) parts.push(expanded);
    }
  }

  return parts.length > 0 ? parts : null;
}

// Format a parsed place array into a canonical comma-separated string.
export function formatPlace(parts) {
  if (!parts || parts.length === 0) return '';
  return parts.join(', ');
}

// Normalize a raw place string: parse then reformat.
// Returns the original string unchanged if parsing produces nothing.
export function normalizePlace(str) {
  if (!str || !str.trim()) return str || '';
  const parsed = parsePlace(str);
  if (!parsed) return str;
  return formatPlace(parsed);
}

// ── County geocoding (Nominatim / OpenStreetMap) ──────────────────────────────

// Strip administrative suffixes so "Lenawee County" → "Lenawee", "County Cork" → "Cork"
function cleanCountyName(raw) {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s+County$/i,      '')
    .replace(/^County\s+/i,      '')
    .replace(/\s+Parish$/i,      '')
    .replace(/\s+Borough$/i,     '')
    .replace(/\s+Census\s+Area$/i, '')
    .trim();
  return cleaned || null;
}

const geocodeCache = new Map();

// Look up the county for a parsed US place and return the cleaned county name.
// Only fires for US places (requires a recognized state in parts).
// Returns null if the county cannot be determined or is already present.
export async function geocodeCounty(parts) {
  if (!parts || parts.length < 2 || parts.length >= 4) return null;
  if (!parts.some((p) => US_STATE_NAMES.has(p))) return null;

  const query = parts.join(', ');
  if (geocodeCache.has(query)) return geocodeCache.get(query);

  try {
    const params = new URLSearchParams({
      q: query, format: 'json', addressdetails: '1', limit: '1', 'accept-language': 'en',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'Rootwise/1.0 Genealogy Extension' },
    });
    if (!res.ok) { geocodeCache.set(query, null); return null; }

    const json = await res.json();
    if (!json?.length) { geocodeCache.set(query, null); return null; }

    const addr  = json[0].address;
    const county = cleanCountyName(addr.county ?? addr.state_district ?? null);
    geocodeCache.set(query, county);
    return county;
  } catch {
    geocodeCache.set(query, null);
    return null;
  }
}

// Return only the last n parts of a place for abbreviated display.
// e.g. shortPlace("Tecumseh, Lenawee, Michigan, United States", 2) → "Michigan, United States"
export function shortPlace(str, n) {
  const parsed = parsePlace(str);
  if (!parsed) return str || '';
  return formatPlace(parsed.slice(-n));
}
