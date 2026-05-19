export const DATE_FORMATS = [
  { id: 'D MMMM YYYY', label: '1 January 2000' },
  { id: 'D MMM YYYY',  label: '1 Jan 2000' },
  { id: 'DD/MM/YYYY',  label: 'DD/MM/YYYY' },
  { id: 'MM/DD/YYYY',  label: 'MM/DD/YYYY' },
];

export const DEFAULT_FORMAT = 'D MMMM YYYY';

const MONTHS_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTHS_ABBR = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

// ── Qualifiers ────────────────────────────────────────────────────────────────
// "about 1885", "~ 1885", "bef 1900", "before 1900", etc.
const QUALIFIER_RE = /^(abt|about|bef|before|aft|after|circa|ca\.|c\.|~)\s+(.+)$/i;

const QUALIFIER_NORM = {
  about: 'abt', before: 'bef', after: 'aft', '~': 'abt',
};

function normalizeQualifier(q) {
  return QUALIFIER_NORM[q.toLowerCase()] ?? q.toLowerCase();
}

// ── Date patterns (tried in order) ───────────────────────────────────────────
const ISO_DATE_RE   = /^(\d{4})-(\d{2})-(\d{2})$/;                    // 2000-01-01
const TEXT_DATE_RE  = /^(\d{1,2})\s+([A-Za-z]+\.?),?\s+(\d{4})$/;    // 1 Jan[.] [,]2000
const US_DATE_RE    = /^([A-Za-z]+\.?)\s+(\d{1,2}),?\s+(\d{4})$/;    // Jan[.] 1[,] 2000
const SLASH_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;              // 1/1/2000
const DASH_DATE_RE  = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;               // 1-1-2000
const DOT_DATE_RE   = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;             // 1.1.2000
const MONTH_YEAR_RE = /^([A-Za-z]+\.?)\s+(\d{4})$/;                   // January 2000
const YEAR_ONLY_RE  = /^(\d{4})$/;                                     // 1885

// ── Levenshtein distance ──────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
    for (let j = 1; j <= n; j++) {
      dp[i][j] = i === 0 ? j
        : a[i - 1] === b[j - 1] ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ── Fuzzy month resolver ──────────────────────────────────────────────────────
// Returns 0-based month index, or -1 if unrecognizable.
// Threshold: 1 edit for ≤4-char inputs, 2 edits for 5+ char inputs.
// This prevents short strings like "abc" from matching "apr" (dist 2) while
// still catching real typos like "Januay" (dist 1 from "january").
function fuzzyMonthIndex(raw) {
  // Strip trailing period ("Jan." → "Jan") and normalise case
  const n = raw.replace(/\.$/, '').toLowerCase().trim();
  if (!n) return -1;

  // 1. Exact match (full name or abbreviation)
  let i = MONTHS_FULL.findIndex((m) => m.toLowerCase() === n);
  if (i !== -1) return i;
  i = MONTHS_ABBR.findIndex((m) => m.toLowerCase() === n);
  if (i !== -1) return i;

  // 2. Prefix match — "jan" → January, "sept" → September, "octob" → October
  if (n.length >= 3) {
    i = MONTHS_FULL.findIndex((m) => m.toLowerCase().startsWith(n));
    if (i !== -1) return i;
  }

  // 3. Levenshtein fuzzy: pick the closest month within threshold
  if (n.length < 3) return -1;
  const threshold = n.length <= 4 ? 1 : 2;
  let best = { idx: -1, dist: Infinity };
  for (let mi = 0; mi < MONTHS_FULL.length; mi++) {
    const df = levenshtein(n, MONTHS_FULL[mi].toLowerCase());
    if (df < best.dist) best = { idx: mi, dist: df };
    const da = levenshtein(n, MONTHS_ABBR[mi].toLowerCase());
    if (da < best.dist) best = { idx: mi, dist: da };
  }
  return best.dist <= threshold ? best.idx : -1;
}

// ── Basic range check ─────────────────────────────────────────────────────────
function validDayMonth(day, month) {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

// For ambiguous numeric formats (D/M vs M/D), try D/M first;
// if month is out of range but swapped values are valid, swap.
function resolveNumericDayMonth(a, b) {
  if (validDayMonth(a, b)) return { day: a, month: b };
  if (validDayMonth(b, a)) return { day: b, month: a };
  return null;
}

// ── Core parser ───────────────────────────────────────────────────────────────
// Returns { qualifier, day, month, year } (month is 1-based) or null.
export function parseDate(str) {
  if (!str || !str.trim()) return null;
  let s = str.trim();

  // Extract optional qualifier
  let qualifier = null;
  const qm = s.match(QUALIFIER_RE);
  if (qm) {
    qualifier = normalizeQualifier(qm[1]);
    s = qm[2].trim();
  }

  // Strip ordinal suffixes: "1st" → "1", "22nd" → "22", "3rd" → "3"
  s = s.replace(/(\d+)\s*(st|nd|rd|th)\b/gi, '$1');

  let m;

  // ── ISO 8601: 2000-01-01 ──────────────────────────────────────────────────
  m = s.match(ISO_DATE_RE);
  if (m) {
    const year = +m[1], month = +m[2], day = +m[3];
    if (validDayMonth(day, month)) return { qualifier, day, month, year };
    return null; // clearly ISO but invalid — stop here, don't try other patterns
  }

  // ── D Month[.] [,] YYYY — e.g. "1 Jan 2000", "01 January, 2000" ──────────
  m = s.match(TEXT_DATE_RE);
  if (m) {
    const mi = fuzzyMonthIndex(m[2]);
    if (mi !== -1) {
      const day = +m[1], month = mi + 1, year = +m[3];
      if (validDayMonth(day, month)) return { qualifier, day, month, year };
    }
  }

  // ── Month[.] D [,] YYYY — e.g. "January 1 2000", "jan 1, 2000" ──────────
  m = s.match(US_DATE_RE);
  if (m) {
    const mi = fuzzyMonthIndex(m[1]);
    if (mi !== -1) {
      const day = +m[2], month = mi + 1, year = +m[3];
      if (validDayMonth(day, month)) return { qualifier, day, month, year };
    }
  }

  // ── Slash: 1/1/2000 — tries D/M first, falls back to M/D ────────────────
  m = s.match(SLASH_DATE_RE);
  if (m) {
    const dm = resolveNumericDayMonth(+m[1], +m[2]);
    if (dm) return { qualifier, day: dm.day, month: dm.month, year: +m[3] };
  }

  // ── Dash: 1-1-2000 — tries D-M first, falls back to M-D ─────────────────
  m = s.match(DASH_DATE_RE);
  if (m) {
    const dm = resolveNumericDayMonth(+m[1], +m[2]);
    if (dm) return { qualifier, day: dm.day, month: dm.month, year: +m[3] };
  }

  // ── Dot: 1.1.2000 ────────────────────────────────────────────────────────
  m = s.match(DOT_DATE_RE);
  if (m) {
    const dm = resolveNumericDayMonth(+m[1], +m[2]);
    if (dm) return { qualifier, day: dm.day, month: dm.month, year: +m[3] };
  }

  // ── Month[.] YYYY — e.g. "January 1885", "Jan. 1885" ────────────────────
  m = s.match(MONTH_YEAR_RE);
  if (m) {
    const mi = fuzzyMonthIndex(m[1]);
    if (mi !== -1) return { qualifier, day: null, month: mi + 1, year: +m[2] };
  }

  // ── Year only — e.g. "1885", "abt 1840" ─────────────────────────────────
  m = s.match(YEAR_ONLY_RE);
  if (m) return { qualifier, day: null, month: null, year: +m[1] };

  return null;
}

// ── Formatter ─────────────────────────────────────────────────────────────────
export function formatDate(parsed, format) {
  if (!parsed) return '';
  const { qualifier, day, month, year } = parsed;
  if (!year) return '';

  let dateStr;
  if (day && month) {
    switch (format) {
      case 'D MMMM YYYY': dateStr = `${day} ${MONTHS_FULL[month - 1]} ${year}`; break;
      case 'D MMM YYYY':  dateStr = `${day} ${MONTHS_ABBR[month - 1]} ${year}`; break;
      case 'DD/MM/YYYY':  dateStr = `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`; break;
      case 'MM/DD/YYYY':  dateStr = `${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}/${year}`; break;
      default:            dateStr = `${day} ${MONTHS_FULL[month - 1]} ${year}`;
    }
  } else if (month) {
    switch (format) {
      case 'D MMMM YYYY': dateStr = `${MONTHS_FULL[month - 1]} ${year}`; break;
      case 'D MMM YYYY':  dateStr = `${MONTHS_ABBR[month - 1]} ${year}`; break;
      case 'DD/MM/YYYY':  dateStr = `${String(month).padStart(2,'0')}/${year}`; break;
      case 'MM/DD/YYYY':  dateStr = `${String(month).padStart(2,'0')}/${year}`; break;
      default:            dateStr = `${MONTHS_FULL[month - 1]} ${year}`;
    }
  } else {
    dateStr = String(year);
  }

  return qualifier ? `${qualifier} ${dateStr}` : dateStr;
}

// ── Convenience helpers ───────────────────────────────────────────────────────

// Re-emits dateStr in targetFormat. Returns original string if unparseable.
export function reformatDate(dateStr, targetFormat) {
  if (!dateStr || !dateStr.trim()) return dateStr || '';
  const parsed = parseDate(dateStr);
  if (!parsed) return dateStr;
  return formatDate(parsed, targetFormat || DEFAULT_FORMAT) || dateStr;
}

// Returns the 4-digit year string, or '' if not found.
export function extractYear(dateStr) {
  const parsed = parseDate(dateStr);
  if (parsed?.year) return String(parsed.year);
  const m = (dateStr || '').match(/\b(\d{4})\b/);
  return m ? m[1] : '';
}

// Returns the date input placeholder for a given format.
export function formatPlaceholder(format) {
  return {
    'D MMMM YYYY': 'e.g. 1 January 1885',
    'D MMM YYYY':  'e.g. 1 Jan 1885',
    'DD/MM/YYYY':  'e.g. 15/01/1885',
    'MM/DD/YYYY':  'e.g. 01/15/1885',
  }[format] ?? 'Date';
}
