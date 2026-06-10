// server.js
// Local Express front door. Mirrors the Vercel serverless functions in api/*.
// Serves the static tester UI from public/ and exposes the JSON endpoints.
// All Probe42 / Watchout secrets stay server-side; the browser only ever calls
// these /api/* routes.

import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { handleLegalDD } from "./legal-dd/request.js";
import { searchByName, initiateProbe, pollProbe } from "./probe42/handlers.js";
import { searchDirector, searchEntity } from "./watchout/handlers.js";
import { usage } from "./watchout/ratelimit.js";
import { listFixtures } from "./fixtures/index.js";
import { getSandboxEntities } from "./fixtures/sandbox.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));

// ── Main orchestrated endpoint ──────────────────────────────────────────────
app.post("/api/legal-dd", async (req, res) => {
  const { status, body } = await handleLegalDD(req.body || {});
  res.status(status).json(body);
});

// Convenience GET for quick browser testing in fixtures mode.
app.get("/api/legal-dd", async (req, res) => {
  const { status, body } = await handleLegalDD({
    identifier: req.query.cin,
    idType: req.query.idType,
    useWatchout: req.query.useWatchout,
    useFixtures: req.query.useFixtures,
    fixtureKey: req.query.fixtureKey,
  });
  res.status(status).json(body);
});

// ── Granular Probe42 endpoints (optional, live only) ────────────────────────
app.get("/api/probe/search", async (req, res) => {
  try {
    res.json(await searchByName(req.query.name, { limit: Number(req.query.limit) || 10 }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: e.code });
  }
});
app.post("/api/probe/update", async (req, res) => {
  try {
    res.json(await initiateProbe(req.body?.cin));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: e.code });
  }
});
app.get("/api/probe/update-status", async (req, res) => {
  try {
    res.json(await pollProbe(req.query.cin, req.query.request_id));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: e.code });
  }
});

// ── Granular Watchout endpoints (optional, live only) ───────────────────────
app.post("/api/watchout/director", async (req, res) => {
  res.json(await searchDirector(req.body?.din));
});
app.post("/api/watchout/entity", async (req, res) => {
  res.json(await searchEntity(req.body?.cin));
});
app.get("/api/watchout/usage", (_req, res) => res.json(usage()));

// Sandbox entity list for the picker (confidential — only served locally).
app.get("/api/sandbox-entities", (_req, res) => {
  res.json(getSandboxEntities());
});

// ── Diagnostics ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mode: process.env.USE_FIXTURES === "true" ? "fixtures" : "live",
    fixtures: listFixtures(),
    probe42: { configured: !!process.env.PROBE42_API_KEY, env: process.env.PROBE42_ENV || "sandbox" },
    watchout: {
      configured: !!(process.env.WATCHOUT_USERID && process.env.WATCHOUT_AES_KEY),
      env: process.env.WATCHOUT_ENV || "test",
    },
  });
});

// ── Static UI ───────────────────────────────────────────────────────────────
// Disable caching so the tester always serves the latest HTML/JS/CSS.
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => res.setHeader("Cache-Control", "no-store"),
  })
);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  const mode = process.env.USE_FIXTURES === "true" ? "FIXTURES (no API calls)" : "LIVE";
  console.log(`Legal DD tester → http://localhost:${PORT}  [mode: ${mode}]`);
});
