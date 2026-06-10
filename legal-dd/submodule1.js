// legal-dd/submodule1.js
// Pure builder: normalized Probe42 profile → Litigation Register (blocks 1A–1G,
// KPI band, severity findings, distress cross-exports, GAP rows). No Watchout
// required for the core; an optional Watchout entity result feeds a side-lane.
//
// Everything tunable (severity rules, cluster threshold, dormancy window,
// filing-year regex, "today") is surfaced as JUDG so a reviewer sees it.

import { daysSince, filingYear, nameMatches } from "./util.js";
import { gap } from "./gaps.js";

const DEFAULT_TUNING = {
  dormancyDays: 365, // pending case with no hearing past this → dormant (JUDG)
  clusterThreshold: 3, // same counterparty ≥ this → cluster (JUDG)
  trendYears: 5,
};

// Regulator vocabulary used to tag initiator/respondent type (JUDG).
const REGULATOR_RX =
  /\b(ACIT|DCIT|CIT|ITO|income tax|IT dept|state tax|gst|commissioner|sebi|rbi|roc|registrar|enforcement|directorate|state of|union of india|municipal|bmc|pollution|labour|epfo|esic)\b/i;

const CRIMINAL_RX = /\b(NI Act|negotiable instrument|138|criminal|cr\.?\s|cnr|cns)\b/i;
const NCLT_RX = /\b(NCLT|IBC|insolvency|C\.?P\.?\s*\(IB\)|CP ?\(IB\))\b/i;

function direction(row, companyName) {
  const isResp = nameMatches(row.respondent, companyName);
  const isPet = nameMatches(row.petitioner, companyName);
  if (isResp && !isPet) return "against";
  if (isPet && !isResp) return "by";
  // Ambiguous (name on both sides or neither matched) → default to "against"
  // but flag so the reviewer knows the direction is a guess.
  return isPet ? "by" : "against";
}

function initiatorType(party) {
  return REGULATOR_RX.test(party || "") ? "Regulator" : "Commercial";
}

// Severity tagging (JUDG). Order: Critical (IBC against) → Amber (criminal/
// regulator) → Soft·dormant → Soft.
function severityFor(row, dir, dormancyDays, asOf) {
  const cat = `${row.caseCategory} ${row.caseType} ${row.caseNumber}`;
  const ds = daysSince(row.date, asOf);
  if (dir === "against" && NCLT_RX.test(cat)) {
    return { tag: "Critical", tone: "crit", chip: "JUDG", reason: "IBC/NCLT pending against company" };
  }
  if (CRIMINAL_RX.test(cat)) {
    return { tag: "Amber · NI Act", tone: "amber", chip: "JUDG", reason: "criminal / NI Act matter" };
  }
  if (initiatorType(dir === "against" ? row.petitioner : row.respondent) === "Regulator") {
    return { tag: "Amber · regulator", tone: "amber", chip: "JUDG", reason: "regulator-initiated" };
  }
  if (ds != null && ds > dormancyDays) {
    return { tag: "Soft · dormant", tone: "soft", chip: "JUDG", reason: `>${dormancyDays}d since last hearing` };
  }
  // Native Probe42 severity as a fallback hint.
  if (/high|critical/i.test(row.severity)) {
    return { tag: "Amber", tone: "amber", chip: "JUDG", reason: `P42 severity="${row.severity}"` };
  }
  return { tag: "Soft", tone: "soft", chip: "JUDG", reason: "default" };
}

export function buildSubmodule1(profile, opts = {}) {
  const tuning = { ...DEFAULT_TUNING, ...(opts.tuning || {}) };
  const asOf = opts.asOf || null;
  const companyName = profile?.header?.legalName || "";
  const rows = profile?.legalHistory || [];

  // Annotate every row with direction, status, severity, days-since.
  const annotated = rows.map((r) => {
    const dir = direction(r, companyName);
    const status = r.caseStatus.includes("dispos")
      ? "disposed"
      : r.caseStatus.includes("pend")
      ? "pending"
      : r.caseStatus || "unknown";
    return {
      ...r,
      direction: dir,
      status,
      daysSince: daysSince(r.date, asOf),
      initiatorType: initiatorType(dir === "against" ? r.petitioner : r.respondent),
      severity: severityFor(r, dir, tuning.dormancyDays, asOf),
      filingYear: filingYear(r.caseNumber),
      isProbable: /probable|unverified|low/i.test(`${r.caseStatus} ${r.severity}`),
    };
  });

  const pending = annotated.filter((r) => r.status === "pending");
  const disposed = annotated.filter((r) => r.status === "disposed");
  const against = annotated.filter((r) => r.direction === "against");
  const by = annotated.filter((r) => r.direction === "by");

  const pendingAgainst = pending.filter((r) => r.direction === "against");
  const pendingBy = pending.filter((r) => r.direction === "by");
  const disposedAgainst = disposed.filter((r) => r.direction === "against");
  const disposedBy = disposed.filter((r) => r.direction === "by");

  const probable = annotated.filter((r) => r.isProbable);
  const ncltPendingAgainst = pendingAgainst.filter((r) =>
    NCLT_RX.test(`${r.caseCategory} ${r.caseType} ${r.caseNumber}`)
  );
  const criminalPendingAgainst = pendingAgainst.filter((r) =>
    CRIMINAL_RX.test(`${r.caseCategory} ${r.caseType} ${r.caseNumber}`)
  );
  const regulatorPendingAgainst = pendingAgainst.filter(
    (r) => r.initiatorType === "Regulator"
  );

  // KPI band
  const kpis = [
    { key: "pending", label: "Pending Cases", value: pending.length, chip: "P42", note: `${pendingAgainst.length} against + ${pendingBy.length} by` },
    { key: "disposed", label: "Disposed Cases", value: disposed.length, chip: "P42", note: `${disposedAgainst.length} against + ${disposedBy.length} by` },
    { key: "against", label: "Cases AGAINST", value: against.length, chip: "P42" },
    { key: "by", label: "Cases BY", value: by.length, chip: "P42" },
    { key: "nclt", label: "NCLT/IBC Pending Against", value: ncltPendingAgainst.length, chip: "P42", tone: ncltPendingAgainst.length ? "crit" : null },
    { key: "criminal", label: "Criminal Pending Against", value: criminalPendingAgainst.length, chip: "P42", tone: criminalPendingAgainst.length ? "amber" : null },
    { key: "regulator", label: "Regulator-initiated Pending Against", value: regulatorPendingAgainst.length, chip: "P42", tone: regulatorPendingAgainst.length ? "amber" : null },
    { key: "probable", label: "Probable + Unverified", value: probable.length, chip: "P42" },
  ];

  // Findings (severity callouts)
  const findings = [];
  for (const r of ncltPendingAgainst) {
    findings.push({
      tone: "crit",
      label: "Critical",
      chips: ["P42", "JUDG"],
      text: `Pending insolvency/NCLT petition against the company — ${r.caseNumber || "case"} (${r.court || "NCLT"}), petitioner ${r.petitioner || "—"}. Last hearing ${r.date || "—"}${r.daysSince != null ? ` (~${r.daysSince}d ago)` : ""}. Management question queued.`,
    });
  }
  const clusters = detectClusters(annotated, tuning.clusterThreshold);
  if (clusters.length) {
    findings.push({
      tone: "amber",
      label: "Amber",
      chips: ["P42", "JUDG"],
      text: `Recurring counterparty cluster(s): ${clusters
        .map((c) => `${c.party} (${c.count})`)
        .join("; ")}. Soft signal of a dispute pattern — probe the relationship.`,
    });
  }
  const dormant = pending.filter(
    (r) => r.daysSince != null && r.daysSince > tuning.dormancyDays
  );
  if (dormant.length) {
    findings.push({
      tone: "soft",
      label: "Soft",
      chips: ["P42", "JUDG"],
      text: `${dormant.length} pending case(s) with last hearing > ${tuning.dormancyDays} days ago — possibly dormant. Plus ${probable.length} probable/unverified record(s).`,
    });
  }

  // Detail blocks 1A–1G
  const blocks = {
    "1A": block("Pending Cases Filed Against the Company", "P42 Legal History → Cases Filed Against → Pending", rowsAgainst(pendingAgainst, true)),
    "1B": block("Pending Cases Filed By the Company", "P42 Legal History → Cases Filed By → Pending", rowsBy(pendingBy, true)),
    "1C": block("Disposed Cases Filed Against", "P42 Legal History → Cases Filed Against → Disposed", rowsAgainst(disposedAgainst, false)),
    "1D": block("Disposed Cases Filed By", "P42 Legal History → Cases Filed By → Disposed", rowsBy(disposedBy, false)),
    "1E": {
      title: "Cases for Consolidation of Corporate Affairs",
      source: "P42 Legal History → CCA",
      rows: [],
      empty: "No pending or disposed corporate-restructuring matters on record.",
    },
    "1F": {
      title: "Probable Cases & Unverified Court Records",
      source: "P42 Legal History → Probable + Unverified",
      rows: probable.map((r) => ({
        caseNumber: r.caseNumber,
        type: r.caseType || r.caseCategory,
        court: r.court,
        parties: `${r.petitioner || "—"} vs ${r.respondent || "—"}`,
        date: r.date,
        confidence: "Low",
      })),
      empty: "No probable or unverified records.",
    },
    "1G": buildTrend(annotated, tuning.trendYears),
  };

  // Distress cross-exports
  const distress = {
    cirpStatus: profile?.header?.cirpStatus ?? null,
    bifr: (profile?.bifrHistory || []).length,
    cdr: (profile?.cdrHistory || []).length,
    struckOff248: (profile?.struckOff248 || []).length,
    defaulterList: (profile?.defaulterList || []).length,
    msmeDelays: (profile?.msmeDelays || []).length,
    openCharges: (profile?.openCharges || []).length,
    keyIndicators: profile?.keyIndicators || {},
  };

  // Watchout regulatory/financial side-lane (entity search). Carries the ₹
  // amounts parsed from the action text — the financial-exposure signal that
  // Probe42's litigation register does not provide.
  const watchoutRecords = opts.watchoutEntity?.records || [];
  const watchoutSideLane = watchoutRecords.map((n) => ({
    recordId: n.recordId,
    regulator: n.regulator,
    orderDate: n.orderDate,
    charges: n.charges,
    actions: n.actions,
    amount: n.amount ?? null,
    amountCr: n.amountCr ?? null,
    sources: n.actionSources || [],
    developments: n.developments || [],
    chip: "WATCHOUT",
  }));
  const watchoutExposureCr = watchoutSideLane.reduce(
    (sum, r) => sum + (r.amountCr || 0),
    0
  );

  // GAP rows
  const gaps = [gap("IM_LITIGATION"), gap("ECOURTS_PDF"), gap("CLAIM_AMOUNTS")];

  return {
    kpis,
    findings,
    blocks,
    distress,
    watchoutSideLane,
    watchoutExposureCr,
    clusters,
    gaps,
    tuning,
  };

  // ── local helpers ──
  function rowsAgainst(list, pending) {
    return list.map((r) => ({
      caseNumber: r.caseNumber,
      category: r.caseCategory || r.caseType,
      court: r.court,
      petitioner: r.petitioner,
      initiatorType: r.initiatorType,
      lastHearing: r.date,
      daysSince: pending ? r.daysSince : null,
      judgementDate: pending ? null : r.date,
      severity: pending ? r.severity : null,
    }));
  }
  function rowsBy(list, pending) {
    return list.map((r) => ({
      caseNumber: r.caseNumber,
      category: r.caseCategory || r.caseType,
      court: r.court,
      respondent: r.respondent,
      respondentType: r.initiatorType,
      lastHearing: r.date,
      daysSince: pending ? r.daysSince : null,
      judgementDate: pending ? null : r.date,
    }));
  }
}

function block(title, source, rows) {
  return {
    title,
    source,
    rows,
    empty: "No matching cases on record.",
  };
}

function detectClusters(rows, threshold) {
  const counts = new Map();
  for (const r of rows) {
    const party =
      r.direction === "against" ? r.petitioner : r.respondent;
    if (!party) continue;
    const key = party.trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= threshold)
    .map(([party, count]) => ({ party, count }))
    .sort((a, b) => b.count - a.count);
}

function buildTrend(rows, years) {
  const byYear = new Map();
  for (const r of rows) {
    const y = r.filingYear;
    if (!y) continue;
    if (!byYear.has(y)) byYear.set(y, { against: 0, by: 0 });
    byYear.get(y)[r.direction === "by" ? "by" : "against"] += 1;
  }
  const allYears = [...byYear.keys()].sort();
  const recent = allYears.slice(-years);
  return {
    title: "Litigation Trend (last 5 FYs)",
    source: "P42 + JUDG (filing-year via case-number regex)",
    chip: "JUDG",
    series: recent.map((y) => ({ year: y, ...byYear.get(y) })),
    note: "Illustrative — filing-year regex needs hardening; not production-ready.",
  };
}
