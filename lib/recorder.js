// lib/recorder.js
// Persists every real API response (Probe42 + Watchout) to disk so nothing is
// lost. Files land under responses/<source>/<timestamp>__<label>.json — that
// folder is gitignored (the dumps are local artifacts; the feature ships in the
// repo so anyone can record their own).
//
// Toggle with DUMP_RESPONSES=false. Never throws — a dump failure must not break
// the API flow.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "responses");

const enabled = () =>
  String(process.env.DUMP_RESPONSES ?? "true").toLowerCase() !== "false";

function safe(s) {
  return (
    String(s)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "x"
  );
}

// dump(source, label, payload) → absolute file path written, or null.
export function dump(source, label, payload = {}) {
  if (!enabled()) return null;
  try {
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const dir = path.join(ROOT, safe(source));
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${ts}__${safe(label)}.json`);
    writeFileSync(
      file,
      JSON.stringify({ source, label, at: now.toISOString(), ...payload }, null, 2)
    );
    return file;
  } catch {
    return null; // recording is best-effort; never break the request
  }
}
