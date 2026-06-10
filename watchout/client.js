// watchout/client.js
// Watchout (PRIME) two-step encrypted client. Server-side only.
//   login()  → JWT (cached ~55 min, refreshed on expiry or A320)
//   search() → POST { Userid plaintext, every other field AES-encrypted }
//              parse PRIME_Code header, decrypt the body on success.
// No call is made until a search method is invoked; importing is side-effect free.

import { assertWatchoutConfigured, PRIME, LIMIT_CODES } from "./config.js";
import { encrypt, decrypt } from "./crypto.js";
import { acquireSlot, WatchoutLimitError } from "./ratelimit.js";

export class WatchoutError extends Error {
  constructor(message, { code, status, body } = {}) {
    super(message);
    this.name = "WatchoutError";
    this.code = code; // PRIME_Code or transport code
    this.status = status;
    this.body = body;
  }
}

// Module-local JWT cache. Watchout tokens last ~60 min; refresh at 55.
let jwt = null;
let jwtAt = 0;
const JWT_TTL_MS = 55 * 60_000;

// Per-request timeout so an unreachable host (e.g. IP not whitelisted) fails
// fast instead of hanging the whole orchestration.
const TIMEOUT_MS = Number(process.env.WATCHOUT_TIMEOUT_MS) || 8000;
const timeoutSignal = () => AbortSignal.timeout(TIMEOUT_MS);

async function login() {
  const cfg = assertWatchoutConfigured();
  let res;
  try {
    res = await fetch(cfg.loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Userid: cfg.userId, Password: cfg.password }),
      signal: timeoutSignal(),
    });
  } catch (e) {
    const isTimeout = e.name === "TimeoutError" || e.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
    throw new WatchoutError(
      isTimeout
        ? `Watchout login unreachable (timeout after ${TIMEOUT_MS}ms) — host may require IP whitelisting / check VPN.`
        : `Watchout login transport error: ${e.message}`,
      { code: "UNREACHABLE" }
    );
  }
  if (!res.ok) {
    throw new WatchoutError(`Watchout login failed (${res.status})`, {
      status: res.status,
      code: "LOGIN_FAILED",
    });
  }
  const j = await res.json();
  // Watchout returns the JWT as `token` (lowercase); accept `Token` too.
  const tok = j && (j.token || j.Token);
  if (!tok) {
    throw new WatchoutError("Watchout login returned no token.", {
      code: "LOGIN_FAILED",
      body: j,
    });
  }
  jwt = tok;
  jwtAt = Date.now();
  return jwt;
}

async function token() {
  if (!jwt || Date.now() - jwtAt > JWT_TTL_MS) return login();
  return jwt;
}

function readPrimeCode(res) {
  return (
    res.headers.get("PRIME_Code") ||
    res.headers.get("PRIME_CODE") ||
    res.headers.get("prime_code") ||
    ""
  );
}

// Core search. Pass at most one of { name } or { panCinDin } — if both, the ID
// wins server-side and name is ignored. `type`: "P" person | "C" company.
// `searchType`: "E" exact | "R" regular | "L" like.
// Returns { code, records, limited } — never throws on a non-A100 PRIME_Code;
// throws WatchoutError/WatchoutLimitError only on transport/config/limit faults.
export async function search(
  { name = "", type = "P", searchType = "E", panCinDin = "" } = {},
  { _retried = false } = {}
) {
  const cfg = assertWatchoutConfigured();
  await acquireSlot(); // rate-limit guard (may wait, may throw WatchoutLimitError)

  const t = await token();
  // Per the PDF, send EITHER a name OR a PAN/CIN/DIN. Sending an encrypted-empty
  // value for the unused field trips A210 ("min param length") on the Regular
  // (R) search path, so we OMIT whichever search field is empty.
  const body = {
    Userid: cfg.userId, // plaintext
    Defaulter_Type: encrypt(type),
    Search_Type: encrypt(searchType),
  };
  if (panCinDin) {
    body.PAN_CIN_DIN = encrypt(panCinDin); // ID wins over name when present
  } else if (name) {
    body.Defaulter_Name = encrypt(name);
  }

  let res;
  try {
    res = await fetch(cfg.dataUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(),
    });
  } catch (e) {
    const isTimeout = e.name === "TimeoutError" || e.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
    throw new WatchoutError(
      isTimeout
        ? `Watchout data endpoint unreachable (timeout after ${TIMEOUT_MS}ms) — host may require IP whitelisting / check VPN.`
        : `Watchout data transport error: ${e.message}`,
      { code: "UNREACHABLE" }
    );
  }

  const code = readPrimeCode(res);

  if (code === PRIME.UNAUTHORIZED) {
    jwt = null;
    if (_retried) {
      throw new WatchoutError("Watchout re-auth failed (A320).", { code });
    }
    return search({ name, type, searchType, panCinDin }, { _retried: true });
  }
  if (code === PRIME.NO_RECORD) return { code, records: [] };
  if (LIMIT_CODES.includes(code)) return { code, limited: true, records: [] };
  if (
    [
      PRIME.MIN_PARAM,
      PRIME.NO_PARAM,
      PRIME.TIMEOUT,
      PRIME.EXCEEDED_MAX,
      PRIME.ERROR,
      PRIME.ERROR_E1,
      PRIME.ERROR_E2,
    ].includes(code)
  ) {
    return { code, error: true, records: [] };
  }

  // Success path (A100, or empty/unknown code on a 200) → decrypt the body.
  const cipher = await res.text();
  if (!cipher) return { code: code || PRIME.SUCCESS, records: [] };
  let records;
  try {
    const json = decrypt(cipher);
    const parsed = JSON.parse(json);
    records = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    throw new WatchoutError(`Failed to decrypt/parse Watchout body: ${err.message}`, {
      code: code || "DECRYPT_FAILED",
      body: cipher.slice(0, 200),
    });
  }
  return { code: code || PRIME.SUCCESS, records };
}

export function _resetTokenForTest() {
  jwt = null;
  jwtAt = 0;
}

export { WatchoutLimitError };
