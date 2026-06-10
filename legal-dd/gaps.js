// legal-dd/gaps.js
// Single source of truth for every GAP the tester can render. Each entry names
// the closing source so the gap is auditable. Deliberately NO MCA_DIN gap:
// DIN status, disqualification (Sec 164(2)) and DIR-3 KYC come straight from
// Probe42 `din_status` (verbatim MCA reason); an MCA-portal lookup is optional
// corroboration/freshness, not a gap.

export const GAPS = {
  // ── Submodule 1 ──
  IM_LITIGATION: {
    sub: 1,
    label: "IM-disclosed material litigation schedule",
    closes: "Information Memorandum (post-IM)",
    badge: "IM",
  },
  ECOURTS_PDF: {
    sub: 1,
    label: "Court order PDFs (disposed cases)",
    closes: "eCourts (deferred)",
    badge: "ECOURTS",
  },
  CLAIM_AMOUNTS: {
    sub: 1,
    label: "Per-case claim amounts (₹)",
    closes: "none available (non-financial-dispute matters)",
    badge: "GAP",
  },

  // ── Submodule 2 ──
  WATCHOUT_FEED: {
    sub: 2,
    label: "Per-director regulatory feed (reg actions / criminal / defaulter)",
    closes: "Watchout Investors",
    badge: "WATCHOUT",
  },
  MCA_STRIKEOFF: {
    sub: 2,
    label: "Strike-off date + section invoked (entity particulars)",
    closes: "MCA portal",
    badge: "MCA",
  },
  CRIMINAL_GENERAL: {
    sub: 2,
    label: "General/personal criminal records",
    closes: "criminal-records source",
    badge: "GAP",
  },
  CIBIL_SUIT: {
    sub: 2,
    label: "CIBIL suit-filed",
    closes: "credit bureau",
    badge: "BUREAU",
  },
  PROMOTER_HIST: {
    sub: 2,
    label: "Promoter personal / foreign-entity legal history",
    closes: "out of v1 scope",
    badge: "GAP",
  },
};

// Helper to build a uniform GAP cell descriptor for the adapter/renderer.
export function gap(id, extra = {}) {
  const def = GAPS[id];
  if (!def) throw new Error(`Unknown GAP id: ${id}`);
  return { gap: true, id, label: def.label, closes: def.closes, badge: def.badge, ...extra };
}

// Build the per-submodule gap summary the UI panel renders.
export function gapSummary({ watchoutAvailable }) {
  const sub1 = ["IM_LITIGATION", "ECOURTS_PDF", "CLAIM_AMOUNTS"].map((id) => ({
    id,
    ...GAPS[id],
  }));

  const sub2Ids = ["MCA_STRIKEOFF", "CRIMINAL_GENERAL", "CIBIL_SUIT", "PROMOTER_HIST"];
  // The Watchout feed is only an *active* gap when Watchout is unavailable/off.
  if (!watchoutAvailable) sub2Ids.unshift("WATCHOUT_FEED");
  const sub2 = sub2Ids.map((id) => ({ id, ...GAPS[id] }));

  return {
    submodule1: { count: sub1.length, gaps: sub1 },
    submodule2: {
      count: sub2.length,
      gaps: sub2,
      watchoutNote: watchoutAvailable
        ? "Watchout enrichment active — per-director regulatory feed populated."
        : "Watchout off/unavailable — 4 of 8 Submodule-2 KPIs degrade to GAP·Watchout.",
    },
  };
}
