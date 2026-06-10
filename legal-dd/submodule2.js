// legal-dd/submodule2.js
// Pure builder: Probe42 directors (+ networks) merged with per-DIN Watchout
// results → Director Legal & Regulatory (blocks 2A–2D, KPI band, findings, GAPs).
// When useWatchout is false (or a director's feed is unavailable), every
// Watchout-fed cell flips to a GAP·Watchout chip and risk degrades — this is the
// dependency demonstration the spec requires.

import { daysSince } from "./util.js";
import { parseDinStatus, dinStatusBadge } from "./din.js";
import { classifyRecord } from "../watchout/normalize.js";
import { gap } from "./gaps.js";

const DEFAULT_TUNING = {
  resignedLookbackYears: 3, // recently-resigned window (JUDG)
};

// A Watchout cell when the feed is off/unavailable.
const watchoutGap = () => gap("WATCHOUT_FEED", { value: "?" });

// Strike-off exposure for a director: count network entities with Strike Off
// status (across the company's director_network rows + the dedicated network).
function strikeOffExposure(networkRow) {
  if (!networkRow) return { count: 0, entities: [] };
  const all = [...(networkRow.companies || []), ...(networkRow.llps || [])];
  const struck = all.filter((e) => /strike\s*off/i.test(e.companyStatus));
  return { count: struck.length, entities: struck };
}

function otherDirectorships(networkRow, rptIndex) {
  if (!networkRow) return [];
  const all = [...(networkRow.companies || []), ...(networkRow.llps || [])];
  return all.map((e) => ({
    ...e,
    isStruckOff: /strike\s*off/i.test(e.companyStatus),
    isRelatedParty: rptIndex.has(normalizeKey(e.legalName)) || rptIndex.has(e.cin),
  }));
}

function normalizeKey(s = "") {
  return String(s).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

// Build an index of related-party names/CINs from RPT rows for cross-flagging.
function buildRptIndex(rpts = []) {
  const idx = new Set();
  for (const r of rpts) {
    for (const v of Object.values(r || {})) {
      if (typeof v === "string" && v.trim()) idx.add(normalizeKey(v));
    }
  }
  return idx;
}

export function buildSubmodule2(profile, opts = {}) {
  const tuning = { ...DEFAULT_TUNING, ...(opts.tuning || {}) };
  const asOf = opts.asOf || null;
  const useWatchout = !!opts.useWatchout;
  // Map of DIN → Watchout envelope ({ status, code, records[] }).
  const watchoutByDin = opts.watchoutByDin || {};

  const signatories = profile?.signatories || [];
  const networks = profile?.directorNetwork || [];
  const networkByDin = new Map(networks.map((n) => [n.din, n]));
  const rptIndex = buildRptIndex(profile?.relatedPartyTransactions);

  const active = signatories.filter((s) => !s.dateOfCessation);
  const resigned = signatories.filter((s) => s.dateOfCessation);

  // ── 2A: Director Risk Matrix (one row per active director) ──
  const matrix = active.map((s) => {
    const din = parseDinStatus(s.dinStatus);
    const exposure = strikeOffExposure(networkByDin.get(s.din));
    const wEnv = watchoutByDin[s.din];
    const watchoutOn = useWatchout && wEnv && wEnv.status === "ok";
    const watchoutLimited = useWatchout && wEnv && wEnv.status === "limited";

    let regActions, criminal, defaulter;
    if (!useWatchout || !wEnv) {
      regActions = criminal = defaulter = watchoutGap();
    } else if (watchoutLimited) {
      const g = gap("WATCHOUT_FEED", { value: "?", note: "limit hit" });
      regActions = criminal = defaulter = g;
    } else {
      const cls = (wEnv.records || []).map(classifyRecord);
      regActions = {
        chip: "WATCHOUT",
        value: cls.filter((c) => c.hasRegulatoryAction).length,
      };
      criminal = {
        chip: "WATCHOUT",
        value: cls.filter((c) => c.isEconomicOffence).length,
        note: "economic-offence only",
        also: gap("CRIMINAL_GENERAL"),
      };
      defaulter = {
        chip: "WATCHOUT",
        value: cls.filter((c) => c.isDefaulter).length,
        also: gap("CIBIL_SUIT"),
      };
    }

    const risk = computeRisk({ din, exposure, regActions, watchoutOn, watchoutKnown: useWatchout && !!wEnv });

    return {
      name: s.name,
      din: s.din,
      pan: s.pan,
      designation: s.designation,
      apptDate: s.dateOfAppointmentCurrentDesignation || s.dateOfAppointment,
      dinStatus: { ...dinStatusBadge(s.dinStatus), chip: din.chip, state: din.state },
      dir3Kyc:
        din.state === "KYC_DEACTIVATED"
          ? { label: "Deactivated (KYC)", tone: "amber", chip: "P42" }
          : { label: "OK", tone: "ok", chip: din.chip === "JUDG" ? "JUDG" : "P42" },
      regActions,
      criminal,
      strikeOffAssoc: { chip: "P42", value: exposure.count },
      defaulter,
      risk,
    };
  });

  // ── 2B: Per-director drawers ──
  const drawers = active.map((s) => {
    const networkRow = networkByDin.get(s.din);
    const exposure = strikeOffExposure(networkRow);
    const wEnv = watchoutByDin[s.din];
    const watchoutOn = useWatchout && wEnv && wEnv.status === "ok";
    return {
      din: s.din,
      name: s.name,
      identity: {
        chip: "P42",
        designation: s.designation,
        apptDate: s.dateOfAppointment,
        apptCurrentDesignation: s.dateOfAppointmentCurrentDesignation,
        dinStatus: s.dinStatus,
      },
      associationHistory: {
        chip: "P42",
        rows: s.associationHistory,
      },
      otherDirectorships: {
        chip: "P42",
        rows: otherDirectorships(networkRow, rptIndex),
      },
      regulatoryActions: watchoutOn
        ? { chip: "WATCHOUT", rows: wEnv.records }
        : watchoutGap(),
      criminal: watchoutOn
        ? { chip: "WATCHOUT", note: "economic-offence only", rows: (wEnv.records || []).filter((r) => classifyRecord(r).isEconomicOffence), also: gap("CRIMINAL_GENERAL") }
        : { ...watchoutGap(), also: gap("CRIMINAL_GENERAL") },
      defaulter: watchoutOn
        ? { chip: "WATCHOUT", rows: (wEnv.records || []).filter((r) => classifyRecord(r).isDefaulter), also: gap("CIBIL_SUIT") }
        : { ...watchoutGap(), also: gap("CIBIL_SUIT") },
      strikeOffEntities: exposure.entities,
    };
  });

  // ── 2C: Prior strike-off entity associations (consolidated) ──
  const strikeOff = [];
  for (const s of signatories) {
    const exposure = strikeOffExposure(networkByDin.get(s.din));
    for (const e of exposure.entities) {
      strikeOff.push({
        director: s.name,
        entityName: e.legalName,
        entityCin: e.cin,
        strikeOffDate: gap("MCA_STRIKEOFF"),
        sectionInvoked: gap("MCA_STRIKEOFF"),
        associationFrom: e.dateOfAppointment,
        chip: "P42",
      });
    }
  }

  // ── 2D: Recently resigned (within lookback window) ──
  const cutoffDays = tuning.resignedLookbackYears * 365;
  const recentlyResigned = resigned
    .filter((s) => {
      const ds = daysSince(s.dateOfCessation, asOf);
      return ds != null && ds <= cutoffDays;
    })
    .map((s) => ({
      name: s.name,
      din: s.din,
      designation: s.designation,
      cessationDate: s.dateOfCessation,
      chip: "P42",
    }));
  const historicTrail = resigned
    .filter((s) => {
      const ds = daysSince(s.dateOfCessation, asOf);
      return ds == null || ds > cutoffDays;
    })
    .map((s) => ({
      name: s.name,
      din: s.din,
      cessationDate: s.dateOfCessation,
      dinStatus: s.dinStatus,
      chip: "P42",
    }));

  // ── KPI band ──
  const disqualified = active.filter((s) => parseDinStatus(s.dinStatus).state === "DISQUALIFIED");
  const kycLapsed = active.filter((s) => parseDinStatus(s.dinStatus).state === "KYC_DEACTIVATED");
  const withExposure = matrix.filter((m) => m.strikeOffAssoc.value > 0);

  const watchoutCount = (pred) =>
    useWatchout
      ? matrix.filter((m) => {
          const env = watchoutByDin[m.din];
          return env && env.status === "ok" && pred(env);
        }).length
      : null; // null → render as GAP

  const kpis = [
    { key: "total", label: "Total Directors", value: active.length, chip: "P42" },
    { key: "disqualified", label: "Disqualified", value: disqualified.length, chip: "P42", tone: disqualified.length ? "crit" : "ok" },
    { key: "regAction", label: "With Regulatory Action", value: watchoutCount((e) => e.records.some((r) => classifyRecord(r).hasRegulatoryAction)), chip: useWatchout ? "WATCHOUT" : "GAP", gap: !useWatchout, closes: "Watchout Investors" },
    { key: "exposure", label: "With Strike-off Exposure", value: withExposure.length, chip: "P42", tone: withExposure.length ? "amber" : null },
    { key: "criminal", label: "With Criminal Record", value: watchoutCount((e) => e.records.some((r) => classifyRecord(r).isEconomicOffence)), chip: useWatchout ? "WATCHOUT" : "GAP", gap: !useWatchout, closes: "Watchout (partial) + criminal-records source" },
    { key: "defaulter", label: "With Defaulter Hit", value: watchoutCount((e) => e.records.some((r) => classifyRecord(r).isDefaulter)), chip: useWatchout ? "WATCHOUT" : "GAP", gap: !useWatchout, closes: "Watchout (partial)" },
    { key: "kyc", label: "DIR-3 KYC Pending / Lapsed", value: kycLapsed.length, chip: "P42" },
    { key: "resigned", label: "Recently Resigned", value: recentlyResigned.length, chip: "P42", note: `within ${tuning.resignedLookbackYears}y (JUDG)` },
  ];

  // ── Findings ──
  const findings = [];
  for (const m of withExposure) {
    findings.push({
      tone: "amber",
      label: "Amber",
      chips: ["P42"],
      text: `${m.name} carries ${m.strikeOffAssoc.value} struck-off entity association(s). Investigate association period and reason for strike-off.`,
    });
  }
  for (const m of disqualified) {
    findings.push({
      tone: "crit",
      label: "Critical",
      chips: ["P42"],
      text: `${m.name} (DIN ${m.din}) — DIN status reads disqualified: "${m.dinStatus.title}".`,
    });
  }
  if (!useWatchout) {
    findings.push({
      tone: "info",
      label: "Degraded",
      chips: ["GAP"],
      text: "Watchout off — Submodule 2 is MCA-only. Per-director regulatory/criminal/defaulter cells are GAP·Watchout and composite risk is 'Unknown — pending Watchout'.",
    });
  }

  // ── GAPs ──
  const gaps = [
    gap("MCA_STRIKEOFF"),
    gap("CRIMINAL_GENERAL"),
    gap("CIBIL_SUIT"),
    gap("PROMOTER_HIST"),
  ];
  if (!useWatchout) gaps.unshift(gap("WATCHOUT_FEED"));

  return {
    kpis,
    findings,
    matrix,
    drawers,
    strikeOff,
    recentlyResigned,
    historicTrail,
    gaps,
    tuning,
    watchoutAvailable: useWatchout,
  };
}

// Composite risk (JUDG). Degrades to "Unknown — pending Watchout" when the
// regulatory feed isn't known for this director.
function computeRisk({ din, exposure, regActions, watchoutOn, watchoutKnown }) {
  if (din.state === "DISQUALIFIED") {
    return { label: "Critical", tone: "crit", chip: "JUDG", reason: "disqualified director" };
  }
  const regHits = watchoutOn && typeof regActions?.value === "number" ? regActions.value : 0;
  if (regHits > 0) {
    return { label: "Critical", tone: "crit", chip: "JUDG", reason: "regulatory action on record" };
  }
  if (exposure.count > 0) {
    if (!watchoutKnown) {
      return { label: "Amber", tone: "amber", chip: "JUDG", reason: "strike-off exposure; Watchout pending" };
    }
    return { label: "Amber", tone: "amber", chip: "JUDG", reason: "strike-off exposure" };
  }
  if (!watchoutKnown) {
    return { label: "Unknown — pending Watchout", tone: "info", chip: "JUDG", reason: "no Watchout feed" };
  }
  return { label: "Low", tone: "ok", chip: "JUDG", reason: "no flags" };
}
