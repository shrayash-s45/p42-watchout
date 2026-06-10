// legal-dd/util.js — shared date / string helpers for the builders.

export function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  // ISO first
  let d = new Date(str);
  if (!isNaN(d)) return d;
  // "8 May 2024" / "30 Sep 2025" style
  const m = str.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (m) {
    d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
    if (!isNaN(d)) return d;
  }
  return null;
}

export function daysSince(dateStr, asOf) {
  const d = parseDate(dateStr);
  if (!d) return null;
  const ref = asOf ? new Date(asOf) : new Date();
  return Math.max(0, Math.round((ref - d) / 86_400_000));
}

// Normalize an entity name for loose matching (LIMITED→LTD, drop punctuation).
export function normName(s = "") {
  return String(s)
    .toUpperCase()
    .replace(/\bPRIVATE\b/g, "PVT")
    .replace(/\bLIMITED\b/g, "LTD")
    .replace(/\bCOMPANY\b/g, "CO")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

// True if the company name appears within a party string (loose contains).
export function nameMatches(party, companyName) {
  if (!party || !companyName) return false;
  const p = normName(party);
  const c = normName(companyName);
  if (!c) return false;
  // Match on the distinctive leading tokens of the company name.
  const lead = c.split(" ").slice(0, 3).join(" ");
  return p.includes(lead) || p.includes(c);
}

// Extract a 4-digit filing year from a case number (JUDG · regex).
export function filingYear(caseNumber = "") {
  const m = String(caseNumber).match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

export function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
