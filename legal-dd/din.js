// legal-dd/din.js
// Tolerant parser for the verbatim MCA DIN-status reason that Probe42 relays
// through `din_status`. MCA wording varies, so we match on substrings (not
// exact equality) and surface unrecognised text with a JUDG chip rather than
// dropping it. Order matters — most specific / most severe first.

export function parseDinStatus(raw = "") {
  const s = String(raw || "").toLowerCase();
  if (!s.trim()) {
    return { state: "UNKNOWN", critical: false, reason: "", chip: "GAP" };
  }
  if (s.includes("disqualif")) {
    return { state: "DISQUALIFIED", critical: true, reason: raw, chip: "P42" };
  }
  if (s.includes("deactivat") && s.includes("kyc")) {
    return { state: "KYC_DEACTIVATED", critical: false, reason: raw, chip: "P42" };
  }
  if (s.includes("deactivat")) {
    return { state: "DEACTIVATED", critical: false, reason: raw, chip: "P42" };
  }
  if (s.includes("approv") || s.includes("active")) {
    return { state: "ACTIVE", critical: false, reason: raw, chip: "P42" };
  }
  // Unrecognised phrasing → keep the raw string, flag for engineer review.
  return { state: "UNKNOWN", critical: false, reason: raw, chip: "JUDG" };
}

// Convenience flags used by Submodule 2 KPI counters.
export function isDisqualified(raw) {
  return parseDinStatus(raw).state === "DISQUALIFIED";
}

export function isKycLapsed(raw) {
  return parseDinStatus(raw).state === "KYC_DEACTIVATED";
}

// Human-readable DIN-status badge label + tone for the matrix.
export function dinStatusBadge(raw) {
  const { state, reason } = parseDinStatus(raw);
  switch (state) {
    case "DISQUALIFIED":
      return { label: "Disqualified", tone: "crit", title: reason };
    case "KYC_DEACTIVATED":
      return { label: "KYC Deactivated", tone: "amber", title: reason };
    case "DEACTIVATED":
      return { label: "Deactivated", tone: "amber", title: reason };
    case "ACTIVE":
      return { label: "Active", tone: "ok", title: reason };
    default:
      return { label: reason || "Unknown", tone: "info", title: reason };
  }
}
