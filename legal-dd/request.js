// legal-dd/request.js
// Shared request → orchestrator-options mapper, used by BOTH front doors
// (Express + Vercel) so they behave identically. Resolves the fixtures default
// from env unless the request explicitly overrides it.

import { runLegalDD } from "./orchestrator.js";

const truthy = (v) => v === true || v === "true" || v === "1" || v === 1;

export function resolveOptions(input = {}) {
  const envFixtures = truthy(process.env.USE_FIXTURES);
  // Request may override env: { useFixtures:false } forces a live call.
  const useFixtures =
    input.useFixtures === undefined ? envFixtures : truthy(input.useFixtures);

  return {
    entityType: input.entityType || "company",
    identifier: input.identifier || input.cin || "",
    idType: input.idType || "CIN",
    useWatchout: truthy(input.useWatchout),
    useFixtures,
    asOf: input.asOf || null,
    tuning: input.tuning || {},
    fixtureKey: input.fixtureKey || "default",
    enrichNetworks: truthy(input.enrichNetworks),
  };
}

export async function handleLegalDD(input) {
  const opts = resolveOptions(input);
  if (!opts.useFixtures && !opts.identifier) {
    return {
      status: 400,
      body: { ok: false, error: "identifier (CIN/PAN) is required in live mode." },
    };
  }
  try {
    const result = await runLegalDD(opts);
    return { status: result.ok === false ? 200 : 200, body: result };
  } catch (err) {
    return {
      status: 500,
      body: { ok: false, error: err.message, name: err.name },
    };
  }
}
