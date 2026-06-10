// fixtures/index.js
// Turns the raw fixtures into the exact shapes the orchestrator/builders expect,
// by running them through the SAME normalizers used in live mode. This keeps
// fixtures mode honest: it exercises normalize.js too, not just the builders.

import { normalizeCompany } from "../probe42/normalize.js";
import { normalizeRecords } from "../watchout/normalize.js";
import { ACC_RAW, ACC_WATCHOUT_RAW } from "./acc.raw.js";

const REGISTRY = {
  // The ACC mock entity. Rich litigation + one director with strike-off
  // exposure + a sample Watchout regulatory record.
  default: () => buildAcc(),
  acc: () => buildAcc(),
};

function buildAcc() {
  const profile = normalizeCompany(ACC_RAW);

  // Watchout: DIN → uniform envelope (matches watchout/handlers.js output).
  const watchoutByDin = {};
  for (const [din, raw] of Object.entries(ACC_WATCHOUT_RAW)) {
    const records = normalizeRecords(raw);
    watchoutByDin[din] =
      records.length === 0
        ? { status: "none", code: "A200", records: [] }
        : { status: "ok", code: "A100", records };
  }

  return {
    profile,
    watchoutByDin,
    watchoutEntity: { status: "none", code: "A200", records: [] },
  };
}

export function getFixture(key = "default") {
  const make = REGISTRY[key] || REGISTRY.default;
  return make();
}

export function listFixtures() {
  return Object.keys(REGISTRY);
}
