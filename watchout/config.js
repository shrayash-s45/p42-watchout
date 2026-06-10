// watchout/config.js
// Watchout Investors (PRIME) connection + crypto settings from env. Lazy reads
// so importing never throws when secrets are absent (fixtures mode).

const HOSTS = {
  test: "https://www.watchoutinvestors.com",
  production: "https://www.watchoutinvestors.com",
};

export function getWatchoutConfig() {
  const envName = (process.env.WATCHOUT_ENV || "test").toLowerCase();
  const host = HOSTS[envName] || HOSTS.test;
  return {
    envName,
    loginUrl: `${host}/api/login`,
    dataUrl: `${host}/api/json`,
    userId: process.env.WATCHOUT_USERID || "",
    password: process.env.WATCHOUT_PASSWORD || "",
    aesKey: process.env.WATCHOUT_AES_KEY || "",
    aesKeyEncoding: (process.env.WATCHOUT_AES_KEY_ENCODING || "utf8").toLowerCase(),
  };
}

export function assertWatchoutConfigured() {
  const cfg = getWatchoutConfig();
  const missing = [];
  if (!cfg.userId) missing.push("WATCHOUT_USERID");
  if (!cfg.password) missing.push("WATCHOUT_PASSWORD");
  if (!cfg.aesKey) missing.push("WATCHOUT_AES_KEY");
  if (missing.length) {
    throw new WatchoutConfigError(
      `Watchout not configured (missing: ${missing.join(", ")}). ` +
        "Set them in .env, or run with USE_FIXTURES=true / useWatchout=false."
    );
  }
  return cfg;
}

export class WatchoutConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "WatchoutConfigError";
  }
}

// PRIME_Code response codes (Annexure). Centralised so the client + handlers
// branch on names rather than magic strings.
export const PRIME = {
  SUCCESS: "A100",
  NO_RECORD: "A200",
  MIN_PARAM: "A210",
  NO_PARAM: "A310",
  UNAUTHORIZED: "A320",
  TIMEOUT: "A340",
  ERROR: "A400",
  ERROR_E1: "E001",
  ERROR_E2: "E002",
  EXCEEDED_MAX: "A500",
  LIMIT_PEAK: "A520",
  LIMIT_OFFPEAK: "A540",
  LIMIT_MONTHLY: "A530",
};

export const LIMIT_CODES = [PRIME.LIMIT_PEAK, PRIME.LIMIT_OFFPEAK, PRIME.LIMIT_MONTHLY];
