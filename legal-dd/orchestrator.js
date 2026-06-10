// legal-dd/orchestrator.js
// Loads the entity, builds Submodule 1 (Probe42 only), resolves directors, fans
// out per-director to Watchout (rate-limit-aware), builds Submodule 2, and
// assembles one response object the frontend adapter consumes.
//
// In fixtures mode (USE_FIXTURES=true or { useFixtures:true }) NO network calls
// are made: a local fixture profile + Watchout map are fed through the SAME real
// builders, so the rendering path is exercised end-to-end without credentials.

import { getCompanyProfile, getDirectorNetwork, initiateProbe } from "../probe42/handlers.js";
import { searchDirector, searchEntity } from "../watchout/handlers.js";
import { buildSubmodule1 } from "./submodule1.js";
import { buildSubmodule2 } from "./submodule2.js";
import { gapSummary } from "./gaps.js";
import { getFixture } from "../fixtures/index.js";

function buildHeader(profile) {
  const h = profile?.header || {};
  return {
    legalName: h.legalName || "—",
    cin: h.cin || "",
    pan: h.pan || "",
    status: h.status || "",
    complianceStatus: h.complianceStatus || "",
    classification: h.classification || "",
    incorporationDate: h.incorporationDate || "",
    paidUpCapitalCr: h.paidUpCapitalCr,
    lastAgmDate: h.lastAgmDate || "",
    industry: h.industry || "",
    cirpStatus: h.cirpStatus ?? null,
    chip: "P42",
  };
}

// Fan out Watchout per ACTIVE director, BY NAME (Watchout matches by name, not
// bare DIN). `directors` is [{ din, name }]; result is keyed by DIN so the
// builder's lookup still works. Never throws; short-circuits on an unreachable
// host so one outage can't stall the request behind N connection timeouts.
async function fanOutWatchout(directors) {
  const out = {};
  let unreachable = false;
  for (const d of directors) {
    if (!d || !d.din) continue;
    if (unreachable || !d.name) {
      out[d.din] = { status: "error", code: unreachable ? "UNREACHABLE" : "NO_NAME", records: [], note: unreachable ? "Watchout unreachable — skipped." : "No name to search." };
      continue;
    }
    const env = await searchDirector(d.name);
    out[d.din] = env;
    if (env.status === "error" && env.code === "UNREACHABLE") unreachable = true;
  }
  return { out, unreachable };
}

export async function runLegalDD({
  entityType = "company",
  identifier,
  idType = "CIN",
  useWatchout = false,
  useFixtures = false,
  asOf = null,
  tuning = {},
  fixtureKey = "default",
  enrichNetworks = false,
} = {}) {
  const meta = {
    entityType,
    identifier,
    idType,
    useWatchout,
    mode: useFixtures ? "fixtures" : "live",
    asOf: asOf || null,
  };

  // ── FIXTURES MODE ──────────────────────────────────────────────────────
  if (useFixtures) {
    const fx = getFixture(fixtureKey);
    const profile = fx.profile;
    const watchoutByDin = useWatchout ? fx.watchoutByDin || {} : {};
    const watchoutEntity = useWatchout ? fx.watchoutEntity || { records: [] } : { records: [] };

    const submodule1 = buildSubmodule1(profile, { asOf, tuning, watchoutEntity });
    const submodule2 = buildSubmodule2(profile, { asOf, tuning, useWatchout, watchoutByDin });

    const fxDirectors = (profile.signatories || [])
      .filter((s) => !s.dateOfCessation && s.din)
      .map((s) => ({ din: s.din, name: s.name }));

    return assemble({
      meta: { ...meta, fixtureKey },
      profile,
      submodule1,
      submodule2,
      useWatchout,
      raw: { probe42: profile._raw, watchout: { byDin: watchoutByDin, entity: watchoutEntity } },
      watchoutUsage: null,
      watchout: buildWatchoutSection({
        useWatchout,
        unreachable: false,
        entity: watchoutEntity,
        byDin: watchoutByDin,
        directors: fxDirectors,
      }),
    });
  }

  // ── LIVE MODE ──────────────────────────────────────────────────────────
  const result = await getCompanyProfile(identifier, { entityType });
  if (!result.ok && result.code === "NOT_PROBED") {
    // Surface the not-probed flow to the caller rather than auto-polling.
    const update = await initiateProbe(identifier).catch((e) => ({ error: e.message }));
    return {
      ok: false,
      code: "NOT_PROBED",
      meta,
      message:
        "Entity not probed yet. An update was initiated; poll get-update-status and retry.",
      update,
    };
  }
  const profile = result.profile;

  // Submodule 1 — optionally enrich with a Watchout entity side-lane, BY NAME.
  let watchoutEntity = { records: [] };
  if (useWatchout && profile.header.legalName) {
    watchoutEntity = await searchEntity(profile.header.legalName).catch(() => ({ records: [] }));
  }
  const submodule1 = buildSubmodule1(profile, { asOf, tuning, watchoutEntity });

  // Resolve directors. Watchout is enriched per ACTIVE director only — resigned
  // directors would multiply the rate-limited fan-out for no benefit.
  const activeDirectors = (profile.signatories || [])
    .filter((s) => !s.dateOfCessation && s.din)
    .map((s) => ({ din: s.din, name: s.name }));
  const activeDins = activeDirectors.map((d) => d.din);

  // Optional, OFF by default: the comprehensive-details response already carries
  // `director_network`, so this per-DIN fan-out is usually redundant and — being
  // sequential — was the main cause of slow/hung loads. Enable only on request.
  if (enrichNetworks) {
    for (const din of activeDins) {
      if ((profile.directorNetwork || []).some((n) => n.din === din)) continue;
      try {
        const net = await getDirectorNetwork(din);
        profile.directorNetwork.push({ din, ...foldNetwork(net) });
      } catch {
        /* leave as-is; builder handles missing networks */
      }
    }
  }

  let watchoutByDin = {};
  let watchoutUnreachable = false;
  if (useWatchout) {
    const fan = await fanOutWatchout(activeDirectors);
    watchoutByDin = fan.out;
    watchoutUnreachable = fan.unreachable;
  }
  const submodule2 = buildSubmodule2(profile, { asOf, tuning, useWatchout, watchoutByDin });

  const { usage } = await import("../watchout/ratelimit.js");

  return assemble({
    meta: { ...meta, watchoutUnreachable },
    profile,
    submodule1,
    submodule2,
    useWatchout,
    raw: {
      probe42: profile._raw,
      watchout: { byDin: watchoutByDin, entity: watchoutEntity },
    },
    watchoutUsage: useWatchout ? usage() : null,
    watchout: buildWatchoutSection({
      useWatchout,
      unreachable: watchoutUnreachable,
      entity: watchoutEntity,
      byDin: watchoutByDin,
      directors: activeDirectors,
      usage: useWatchout ? usage() : null,
    }),
  });
}

function foldNetwork(net) {
  const data = (net && net.data) || net || {};
  const row = Array.isArray(data) ? data[0] : data;
  const network = (row && row.network) || {};
  const map = (e = {}) => ({
    cin: e.cin || e.llpin || "",
    legalName: e.legal_name || e.name || "",
    companyStatus: e.company_status || e.status || "",
    designation: e.designation || "",
    dateOfAppointment: e.date_of_appointment || "",
    dateOfCessation: e.date_of_cessation || "",
  });
  return {
    name: (row && row.name) || "",
    pan: (row && row.pan) || "",
    companies: (network.companies || []).map(map),
    llps: (network.llps || []).map(map),
  };
}

// Structured, UI-friendly summary of everything Watchout returned, so the
// dedicated "Watchout" tab can show exactly what the API gave (entity + each
// active director), with status codes and full records.
function buildWatchoutSection({ useWatchout, unreachable, entity, byDin, directors, usage }) {
  const summarise = (env = {}) => ({
    status: env.status || "off",
    code: env.code || null,
    cached: !!env.cached,
    count: (env.records || []).length,
    records: env.records || [],
  });
  return {
    available: useWatchout,
    unreachable: !!unreachable,
    usage: usage || null,
    entity: summarise(entity),
    directors: (directors || []).map((d) => ({
      din: d.din,
      name: d.name,
      ...summarise(byDin[d.din] || {}),
    })),
  };
}

function assemble({ meta, profile, submodule1, submodule2, useWatchout, raw, watchoutUsage, watchout }) {
  return {
    ok: true,
    meta,
    watchoutAvailable: useWatchout,
    header: buildHeader(profile),
    submodule1,
    submodule2,
    watchout: watchout || { available: useWatchout, entity: { status: "off", records: [] }, directors: [] },
    gapSummary: gapSummary({ watchoutAvailable: useWatchout }),
    watchoutUsage,
    raw,
  };
}
