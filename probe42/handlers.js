// probe42/handlers.js
// Framework-agnostic handlers shared by the Express route and the Vercel
// serverless functions ("two front doors, one pipeline"). These compose the
// client + normalizer and surface the not-probed flow without throwing.

import {
  searchEntities,
  comprehensiveCompany,
  comprehensiveLLP,
  directorNetwork,
  directorById,
  startUpdate,
  getUpdateStatus,
  Probe42Error,
} from "./client.js";
import { normalizeCompany, normalizeDirector } from "./normalize.js";

// Resolve a company's comprehensive profile, normalized. On a not-probed 404 we
// do NOT auto-poll here (that can take minutes); we return a typed signal so the
// caller decides whether to kick off /update.
export async function getCompanyProfile(identifier, { entityType = "company" } = {}) {
  try {
    const raw =
      entityType === "llp"
        ? await comprehensiveLLP(identifier)
        : await comprehensiveCompany(identifier);
    return { ok: true, profile: normalizeCompany(raw) };
  } catch (err) {
    if (err instanceof Probe42Error && err.code === "NOT_PROBED") {
      return { ok: false, code: "NOT_PROBED", identifier };
    }
    throw err;
  }
}

export async function searchByName(name, { limit = 10 } = {}) {
  const raw = await searchEntities(name, limit);
  return raw;
}

export async function getDirector(identifier, idType = "DIN") {
  const raw = await directorById(identifier, idType);
  return normalizeDirector(raw);
}

export async function getDirectorNetwork(identifier, idType = "DIN") {
  return directorNetwork(identifier, idType);
}

// Not-probed flow: caller can drive update → poll → retry from these.
export async function initiateProbe(cin) {
  return startUpdate(cin);
}

export async function pollProbe(cin, requestId) {
  return getUpdateStatus(cin, requestId);
}

export { Probe42Error };
