// watchout/handlers.js
// Framework-agnostic Watchout handlers used by the orchestrator and any
// granular /api/watchout/* endpoints. They wrap the client + normalizer and
// translate PRIME_Code outcomes / limit errors into a uniform result envelope
// so the caller never has to try/catch around individual searches.

import { search, WatchoutLimitError } from "./client.js";
import { normalizeRecords } from "./normalize.js";
import { PRIME } from "./config.js";
import { dump } from "../lib/recorder.js";

// Uniform envelope:
//   { status: "ok"|"none"|"limited"|"error", code, records[], note }
function envelope(result) {
  if (result.limited) {
    return {
      status: "limited",
      code: result.code,
      records: [],
      note: "Watchout call limit hit — render as GAP·Watchout limit.",
    };
  }
  if (result.error) {
    return { status: "error", code: result.code, records: [], note: "Watchout error code." };
  }
  if (result.code === PRIME.NO_RECORD || (result.records || []).length === 0) {
    return { status: "none", code: result.code, records: [] };
  }
  return { status: "ok", code: result.code, records: normalizeRecords(result.records) };
}

async function run(params) {
  // `params` carries only the search inputs (type/searchType/name) — no secrets.
  const label = `${params.type || ""}-${params.searchType || ""}-${params.name || params.panCinDin || ""}`;
  let result;
  try {
    result = envelope(await search(params));
  } catch (err) {
    if (err instanceof WatchoutLimitError) {
      result = { status: "limited", code: err.code, records: [], note: `Local rate guard: ${err.message}` };
    } else {
      result = { status: "error", code: err.code || "ERROR", records: [], note: err.message };
    }
  }
  dump("watchout", `search-${label}`, { request: params, ...result });
  return result;
}

// Session cache: Watchout matches reliably by NAME (IDs are stored prefixed,
// e.g. "PAN:AAACU0589R", so bare-ID lookups miss). We cache every non-error
// result by query so we never re-query the same subject — this conserves
// credits and sidesteps the "records once, then empty on repeat" behaviour.
const cache = new Map();
const keyOf = (type, name) => `${type}:${String(name).trim().toUpperCase()}`;

async function runCached(type, name, searchType) {
  const key = keyOf(type, name);
  if (cache.has(key)) return { ...cache.get(key), cached: true };
  const env = await run({ type, searchType, name: String(name || "") });
  if (env.status !== "error") cache.set(key, env); // cache ok/none/limited
  return env;
}

// Per-director search — by NAME (type "P"). Bare-DIN lookups miss in Watchout.
export function searchDirector(name, { searchType = "E" } = {}) {
  return runCached("P", name, searchType);
}

// Entity search — by NAME (type "C"). Bare-CIN lookups miss in Watchout.
export function searchEntity(name, { searchType = "E" } = {}) {
  return runCached("C", name, searchType);
}

// Generic name search (explicit type).
export function searchByName(name, { type = "P", searchType = "E" } = {}) {
  return runCached(type, name, searchType);
}

export function clearWatchoutCache() {
  cache.clear();
}
