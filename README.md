# Legal DD Tester — Probe42 × Watchout Investors

A diagnostic tester that exercises two Indian corporate-data APIs together — **Probe42**
(MCA/regulatory/financial profile) and **Watchout Investors** (PRIME's regulatory-defaulter
registry) — and renders a legal due-diligence report scoped to two submodules, with a
**provenance chip on every value** and an explicit **GAP chip** (naming the closing source)
on every field the APIs can't fill.

> **Status:** working tester. Probe42 is fully wired; Watchout login → AES-encrypt → search →
> decrypt is proven end-to-end (real records retrieved and decrypted). It runs in **fixtures
> mode** out of the box, so the whole pipeline is demoable without any credentials.

> 📘 **Integrating either API?** Read [`CONTRACT.md`](CONTRACT.md) first — it documents every
> endpoint, auth, the Watchout AES encryption, response codes, and verified working examples.

---

## Scope

| Submodule | What it answers | Primary source |
|---|---|---|
| **1 — Litigation Register** | Court/tribunal cases for & against the company, severity-tagged, distress signals, **plus Watchout regulatory/financial defaults with ₹ amounts** | Probe42 `legal_history` (+ Watchout entity side-lane) |
| **2 — Director Legal & Regulatory** | Per-director DIN status, DIR-3 KYC, strike-off exposure, and **Watchout regulatory action per director** | Probe42 directors + Watchout (by name) |

---

## Quick start

```bash
npm install
cp .env.example .env       # leave USE_FIXTURES=true to demo without keys
npm start                  # → http://localhost:3000
```

Open the page — it loads a fixture (ACC) and renders a full report. Toggle **Use Watchout**
on/off to see Submodule 2 populate vs degrade to `GAP·Watchout`.

### Going live

1. Fill `.env`: `PROBE42_API_KEY` (+ `PROBE42_ENV`), and Watchout `USERID` / `PASSWORD` /
   `AES_KEY` (+ `WATCHOUT_AES_KEY_ENCODING` — `utf8` / `hex` / `base64`; must decode to **32
   bytes**).
2. Set `USE_FIXTURES=false`.
3. Sandbox Probe42 resolves a fixed set of test entities; production resolves any real CIN.

---

## Architecture — "two front doors, one pipeline"

```
Browser (public/) ──POST /api/legal-dd──► server.js  (or api/legal-dd.js on Vercel)
                                              │
                                   legal-dd/orchestrator.js
        ┌─────────────────────────────────────┼───────────────────────────────┐
   probe42/                            watchout/                          legal-dd/
   client → normalize                 crypto (AES-256-CBC)               submodule1.js
   (comprehensive, director net)      ratelimit (6/min, 350/1300, 50k)   submodule2.js
   handlers                           client (login/JWT) → normalize     gaps.js · din.js
                                      handlers (name search + cache)     util.js · request.js
                                              ▼
   { header, submodule1, submodule2, watchout, gapSummary, raw, watchoutAvailable }
```

| Module | Files |
|---|---|
| `probe42/` | `config` · `client` (timeout) · `normalize` · `handlers` |
| `watchout/` | `config` · `crypto` · `ratelimit` · `client` (JWT, 8s timeout) · `normalize` (₹-amount parser) · `handlers` (name search + result cache) |
| `legal-dd/` | `orchestrator` · `submodule1` · `submodule2` · `gaps` · `din` · `util` · `request` |
| `fixtures/` | `acc.raw.js` (synthetic) · `index.js` · `sandbox.js` (loads the gitignored sandbox list) |
| `public/` | `index.html` · `app/main.js` · `app/render.js` · `app/legalAdapter.js` · `app/styles.css` |

### UI tabs
**Header · Submodule 1 · Submodule 2 · Watchout API · Gap Summary · All data.**
The **Watchout API** tab shows the raw output of every Watchout call (entity + each active
director) with full fields, status codes, and rate usage — so you can see exactly what the
API returned.

---

## Key behaviours learned (and handled)

_Full detail, endpoints, and working examples in [`CONTRACT.md`](CONTRACT.md)._


- **Watchout matches by NAME, not bare ID.** IDs are stored prefixed (e.g. `PAN:AAACU0589R`),
  so bare CIN/DIN lookups return `A200`. The app searches entities/directors **by name**.
- **`E` (Exact) is substring-broad** → big defaulters exceed the **250-record cap** (`A500`,
  empty body, no pagination). Refine the query or use `R` (whole-string).
- **₹ amounts are embedded in free text** (`Regulatory_Actions`, e.g. `SUIT FILED- RS.48,21,31,894`).
  `watchout/normalize.js` parses these into numeric `amount` / `amountCr` and the UI sums a
  **total financial exposure**.
- **Results are cached** per subject (conserves credits; avoids "records once, then empty on
  repeat").
- **Rate limits** (6/min, 350 peak / 1300 off-peak / 50k month) are enforced in-process; the
  per-director fan-out covers **active directors only**.

---

## Security

**All Probe42 / Watchout secrets are server-side. The browser only ever calls `/api/*`.**

Never commit (these are gitignored):
- `.env` — API keys, Watchout credentials, AES key
- `*.confidential.*` — the Probe42 sandbox entity list (STRICTLY CONFIDENTIAL)
- `*.pdf` — PRIME's proprietary API documentation

`.env.example` is the safe, value-less template that *is* committed. See `.gitignore`.

> The internal spec docs (`01_CONTEXT.md`, `02_API_REFERENCE.md`, `03_BUILD_GUIDE.md`) and the
> `ACC_mock_module.html` are committed by default — remove them from the repo or add them to
> `.gitignore` if you want them private.

---

## Endpoints

- `POST /api/legal-dd` — `{ entityType, identifier, idType, useWatchout, useFixtures, fixtureKey, asOf, tuning }`
- `GET /api/legal-dd?cin=…&useWatchout=true` — convenience
- `GET /api/health` — mode + which credentials are configured
- `GET /api/sandbox-entities` — sandbox picker list (empty if the confidential file is absent)
- Granular (live): `GET /api/probe/search`, `POST /api/probe/update`, `GET /api/probe/update-status`,
  `POST /api/watchout/director`, `POST /api/watchout/entity`, `GET /api/watchout/usage`
- `GET /api/watchout/doc?url=…` — proxies a `watchoutinvestors.com` source PDF through the
  (whitelisted) server so any browser can open it; host-allowlisted (anti-SSRF)

---

## Open items / for PRIME

- How to retrieve results when a match exceeds **250** (pagination?).
- Exact requirements for **`R` (Regular)** search (returns `A210` for valid-length names).
- Confirm the **metering model** (an identical repeated query returned records once, then empty).
