// fixtures/sandbox.js
// Loads the Probe42 sandbox entity list (the ~150 entities the sandbox key can
// resolve) and exposes a slimmed, UI-safe view for the company picker. Prefers
// the committed `sandbox-entities.json`; falls back to the older gitignored
// `sandbox-entities.confidential.json` if that's all a checkout has. Returns an
// empty list if neither is present so nothing breaks.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [
  path.join(__dirname, "sandbox-entities.json"),
  path.join(__dirname, "sandbox-entities.confidential.json"),
];

function readFirst() {
  for (const f of CANDIDATES) {
    try {
      return readFileSync(f, "utf8");
    } catch {
      /* try next */
    }
  }
  return null;
}

// type → the identifier kind the comprehensive lookup expects.
const ID_TYPE = { company: "CIN", llp: "LLPIN", pnp: "PAN" };

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const text = readFirst();
    if (!text) throw new Error("no sandbox entity file");
    const raw = JSON.parse(text);
    const entities = (raw.entities || []).map((e) => ({
      name: e.legalName,
      type: e.type, // company | llp | pnp
      identifier: e.identifier,
      idType: ID_TYPE[e.type] || "CIN",
      pan: e.pan || null,
    }));
    cache = { available: true, counts: raw.counts || null, lastUpdated: raw.lastUpdated || null, entities };
  } catch {
    cache = { available: false, counts: null, lastUpdated: null, entities: [] };
  }
  return cache;
}

export function getSandboxEntities() {
  return load();
}
