// fixtures/sandbox.js
// Loads the CONFIDENTIAL Probe42 sandbox entity list (gitignored) and exposes a
// slimmed, UI-safe view for the company picker. Returns an empty list if the
// file is absent (fresh clone / production deploy) so nothing breaks.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, "sandbox-entities.confidential.json");

// type → the identifier kind the comprehensive lookup expects.
const ID_TYPE = { company: "CIN", llp: "LLPIN", pnp: "PAN" };

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8"));
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
