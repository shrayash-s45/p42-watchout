// probe42/client.js
// Thin HTTPS client for the Probe42 V1 REST API. Server-side only (the API key
// is secret and Probe42 does not send CORS headers). Every method returns the
// parsed JSON `data`/`metadata` envelope or throws a typed Probe42Error.

import { assertProbe42Configured } from "./config.js";
import { dump } from "../lib/recorder.js";

export class Probe42Error extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = "Probe42Error";
    this.status = status;
    this.code = code; // e.g. "NOT_PROBED", "RATE_LIMIT", "VALIDATION"
    this.body = body;
  }
}

function headers() {
  const cfg = assertProbe42Configured();
  return {
    "x-api-key": cfg.apiKey,
    Accept: "application/json",
    "x-api-version": cfg.apiVersion,
  };
}

// Map HTTP status → a stable code the orchestrator can branch on.
function classify(status, body) {
  const text = JSON.stringify(body || "").toLowerCase();
  if (status === 404 && text.includes("not probed")) return "NOT_PROBED";
  if (status === 404) return "NOT_FOUND";
  if (status === 403) return "AUTH";
  if (status === 422) return "VALIDATION";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "SERVER";
  if (status >= 400) return "BAD_REQUEST";
  return "OK";
}

const TIMEOUT_MS = Number(process.env.PROBE42_TIMEOUT_MS) || 30000;

async function request(path, { method = "GET", base = "core", body } = {}) {
  const cfg = assertProbe42Configured();
  const root = base === "reports" ? cfg.reportsBase : cfg.coreBase;
  const url = `${root}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...headers(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const isTimeout = e.name === "TimeoutError";
    throw new Probe42Error(
      isTimeout
        ? `Probe42 ${method} ${path} timed out after ${TIMEOUT_MS}ms`
        : `Probe42 ${method} ${path} transport error: ${e.message}`,
      { code: isTimeout ? "TIMEOUT" : "TRANSPORT" }
    );
  }

  let parsed = null;
  const raw = await res.text();
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = { raw };
  }

  if (!res.ok) {
    const code = classify(res.status, parsed);
    dump("probe42", `${method}-${path}`, {
      request: { method, path, base },
      ok: false,
      status: res.status,
      code,
      response: parsed,
    });
    throw new Probe42Error(
      `Probe42 ${method} ${path} → ${res.status} (${code})`,
      { status: res.status, code, body: parsed }
    );
  }
  dump("probe42", `${method}-${path}`, {
    request: { method, path, base },
    ok: true,
    status: res.status,
    response: parsed,
  });
  return parsed;
}

// ── Endpoints used by the two submodules ─────────────────────────────────────

// Search companies/LLPs/P&Ps by name → identifiers.
export function searchEntities(filters, limit = 10) {
  const enc = encodeURIComponent(
    typeof filters === "string" ? filters : JSON.stringify(filters)
  );
  return request(`/entities?filters=${enc}&limit=${limit}`);
}

// Submodule 1 + 2 backbone for a company. 404 "not probed" → call update first.
export function comprehensiveCompany(cin) {
  return request(`/companies/${encodeURIComponent(cin)}/comprehensive-details`);
}

export function comprehensiveLLP(llpin) {
  return request(`/llps/${encodeURIComponent(llpin)}/comprehensive-details`);
}

// All companies + LLPs a director is/was in. `idValue` is a DIN (default) or PAN.
export function directorNetwork(idValue, idType = "DIN") {
  const key = idType.toUpperCase() === "PAN" ? "PAN" : "din";
  return request(`/director/network?${key}=${encodeURIComponent(idValue)}`);
}

// Director identity + din_status. idType = "DIN" | "PAN".
export function directorById(idValue, idType = "DIN") {
  return request(
    `/directors/${encodeURIComponent(idValue)}?identifier_type=${encodeURIComponent(
      idType.toUpperCase()
    )}`
  );
}

// Initiate a probe for a not-yet-probed entity → { request_id }.
export function startUpdate(cin) {
  return request(`/companies/${encodeURIComponent(cin)}/update`, {
    method: "POST",
  });
}

// Poll the probe status for a request_id.
export function getUpdateStatus(cin, requestId) {
  return request(
    `/companies/${encodeURIComponent(cin)}/get-update-status?request_id=${encodeURIComponent(
      requestId
    )}`
  );
}
