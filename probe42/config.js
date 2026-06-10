// probe42/config.js
// Resolves Probe42 connection settings from env. All reads are lazy (via a
// getter) so importing this file never throws when keys are absent — the
// orchestrator can run in fixtures mode without any Probe42 credentials.

const BASES = {
  sandbox: {
    core: "https://api.probe42.in/probe_pro_sandbox",
    reports: "https://api.probe42.in/probe_reports_sandbox",
  },
  production: {
    core: "https://api.probe42.in",
    reports: "https://api.probe42.in",
  },
};

export function getProbe42Config() {
  const envName = (process.env.PROBE42_ENV || "sandbox").toLowerCase();
  const bases = BASES[envName] || BASES.sandbox;
  return {
    envName,
    apiKey: process.env.PROBE42_API_KEY || "",
    apiVersion: process.env.PROBE42_API_VERSION || "1.3",
    coreBase: bases.core,
    reportsBase: bases.reports,
  };
}

// Throw a clear error only at call time, not import time.
export function assertProbe42Configured() {
  const cfg = getProbe42Config();
  if (!cfg.apiKey) {
    throw new Probe42ConfigError(
      "PROBE42_API_KEY is not set. Set it in .env, or run with USE_FIXTURES=true."
    );
  }
  return cfg;
}

export class Probe42ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "Probe42ConfigError";
  }
}
