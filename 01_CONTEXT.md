# Legal DD Tester — Project Context & Data Sources

_Last updated: 2026-06-10_

A practical guide to **what we are building, the two data sources that feed it, how the
Probe42 side was already wired, and how the two APIs divide the work** for the legal /
compliance / litigation due-diligence module.

Companion files:
- [`02_API_REFERENCE.md`](02_API_REFERENCE.md) — consolidated endpoint reference for **both** APIs + a field→submodule map.
- [`03_BUILD_GUIDE.md`](03_BUILD_GUIDE.md) — how to build the interface, block by block, with the gap-marking system.

---

## 1. What we are building

A **testing interface that exercises two APIs together** — **Probe42** and **Watchout
Investors** — and renders the output as a legal-DD report, **scoped to exactly two
submodules**:

| # | Submodule | What it answers |
|---|---|---|
| **1** | **Litigation Register** | Every court/tribunal case for/against the company, severity-tagged, plus distress signals (IBC, BIFR, CDR, strike-off). |
| **2** | **Director Legal & Regulatory** | Per-director regulatory action, disqualification, strike-off exposure, and adverse history. |

The visual/structural target is the **ACC mock** (`ACC_mock_module.html`) — masthead +
KPI band + finding callouts + detailed blocks per submodule + a per-submodule gap list —
**but cut down to Submodule 1 and Submodule 2 only**, plus a small **general company
header**. The defining requirement: **every data point shows its provenance, and every
field we cannot fill is explicitly marked as a GAP with the source that would close it.**

This is a **tester first**: the point is to prove what the two APIs can and cannot
populate, end-to-end, before investing in the full module.

---

## 2. The two data sources

### 2.1 Probe42 — the corporate-profile engine (primary)

Probe42 (probe42.in, by Probe Information Services) aggregates **MCA / regulatory /
financial** data on Indian corporates. We call its **V1 REST API** for a company's full
profile. For our two submodules it is the **primary** source:

- **Submodule 1** is built almost entirely from Probe42's **`legal_history`** array
  (case-level, court-keyed, with a **`severity`** field), supplemented by
  `legal_cases_of_financial_disputes`, `defaulter_list`, `bifr_history`, `cdr_history`,
  `cirp_status`, `struckoff248_details`, `msme_supplier_payment_delays`, `open_charges`,
  and the `key_indicators` flags.
- **Submodule 2** gets its **director identity, DIN status, DIR-3 KYC, association
  history, other-directorships and strike-off exposure** from Probe42
  (`authorized_signatories`, `director_network`, the `/director/network` and
  `/directors/{id}` endpoints).

### 2.2 Watchout Investors — the regulatory-defaulter registry (enrichment)

watchoutinvestors.com (run by PRIME Database / Praxis) is a **national registry of
entities and persons indicted by regulators/investigation agencies for economic default
or non-compliance** — covering ~35 regulators and agencies. It is searchable by **name**
(person/company, with exact/regular/like matching) or by **PAN / CIN / DIN**. For our two
submodules it is **enrichment**, and it matters most in **Submodule 2**:

- It is the source for **per-director regulatory action** (search the director's DIN/PAN →
  regulator, order date, charges, action, status), which Probe42 does not provide for
  individuals.
- It partially covers **defaulter hits** (RBI wilful-defaulter and regulator-sourced
  fraud/defaulter lists) and **economic-offence** matters by investigation agencies.

> **Important calibration (carried from the source analysis):** Watchout is a *regulatory*
> registry, **not** a general criminal-records database and **not** a credit bureau. It
> does **not** reliably cover ordinary personal criminal proceedings or CIBIL "suit-filed"
> data. Treat its criminal/defaulter contribution as *partial*. See §4.

---

## 3. How Probe42 was already wired (condensed from the prior integration)

The existing app already integrates Probe42. Reuse this; do **not** rebuild it.

- **Two front doors, one pipeline.** A local **Express** route (`server.js`) and **Vercel
  serverless** functions (`api/probe/*.js`) both call the same framework-agnostic handlers
  in `probe42/handlers.js`.
- **Server-side only.** The Probe42 **API key is secret** and Probe42 **does not support
  CORS**, so every Probe call is made server-side; the browser only talks to our own
  `/api/probe/*` endpoints. **The same rule will apply to Watchout** (secret credentials +
  encryption key).
- **Pipeline:** `client.js` (HTTPS + `x-api-key`) → `normalize.js` (comprehensive JSON →
  classifier shape + doc-id harvesting) → `src/classify.js` (LLM business-model
  classifier) → `public/app/adapter.js` `buildCompany()` (maps raw response → a single
  `COMPANY` object) → React sections render.
- **Graceful degradation.** The adapter sets **safe defaults for every field** so missing
  sections render as **empty states**, never crashes. The full raw `data` is kept on
  `C._raw` and shown in an **"All data"** tab so nothing is hidden.
- **Sandbox vs production.** A **sandbox key** resolves only **~150 fixed test entities**
  (122 companies, 13 LLPs, 15 P&Ps; last refreshed Nov 2025) on the sandbox base URLs. A
  **production key** resolves any real CIN on `https://api.probe42.in`.
- **Not-probed flow.** The comprehensive endpoint returns **404 "not probed yet"** for an
  entity Probe hasn't fetched before → call `/api/probe/update` (returns a `request_id`) →
  wait a few minutes → retry.

**Real-shape gotchas already handled in the adapter** (re-use, don't re-discover):

- **Financials are in raw rupees** — divide monetary statement fields by `1e7` to show ₹ Cr.
- `holding_entities` / `subsidiary_entities` / `associate_entities` / `joint_ventures` are
  **objects** `{ financial_year, company:[], llp:[], others:[] }`, not flat arrays;
  foreign holders sit in `others`.
- `shareholdings` is an array of rows keyed by `shareholders` × `category` with per-holder-
  type breakdown; `shareholdings_summary` is **counts**, not percentages.
- `credit_rating_rationale` is **not text** — it's `{ rating_agency, financial_year,
  doc_id }` (downloadable PDFs).
- `financials` can contain **both STANDALONE and CONSOLIDATED** across many years with
  full-date labels (`2025-03-31`).

---

## 4. Division of labour — which source feeds which field

This is the crux. The honest mapping (from the source/mock analysis):

### Submodule 1 — Litigation Register
- **Probe42 fills essentially everything**: all case blocks, severity, counters, clusters,
  dormancy, trend.
- **Watchout adds only a side-lane**: regulator enforcement *orders* that are not filed as
  court cases (and so would be absent from court-based `legal_history`). Optional.
- **Neither API fills** the three real gaps — see §5.

### Submodule 2 — Director Legal & Regulatory
| Field / counter | Source | Coverage |
|---|---|---|
| Director identity, DIN, designation, appt/cessation | Probe42 | ✅ Full |
| **DIN status** — passes through the **verbatim MCA reason string** (not a collapsed flag) | Probe42 `din_status` | ✅ Full |
| **Disqualification (Sec 164(2))** — readable directly from the `din_status` reason text | Probe42 `din_status` (parse reason) | ✅ Full |
| **DIR-3 KYC pending/lapsed** — readable from the `din_status` reason (e.g. *"Deactivated due to non-filing of DIR-3 KYC"*) | Probe42 `din_status` (parse reason) | ✅ Full |
| **Regulatory actions per director** | **Watchout** (DIN/PAN search) | ✅ Full |
| Defaulter hits — RBI wilful-defaulter / regulator fraud | **Watchout** | ✅ partial |
| Defaulter hits — **CIBIL suit-filed** | credit bureau | ❌ not Watchout |
| **Criminal record (personal capacity)** | Watchout (economic-offence only) + criminal-records source | ⚠️ partial |
| Strike-off **exposure** (which struck-off entities) | Probe42 other-directorships | ✅ Full |
| Strike-off **date + section invoked** | MCA portal | ❌ not Watchout |
| Promoter personal/foreign legal history | out of v1 (India slice partly via Watchout) | ❌ |

**One-line takeaway:** Probe42 carries Submodule 1 and most of Submodule 2 — identity,
structure, **and the disqualification / DIR-3-KYC signals (via the verbatim `din_status`
reason)**; Watchout closes the **per-director regulatory-action** hole (the biggest
remaining one) and the RBI-defaulter slice; **eCourts, the IM, a credit bureau, and a
criminal-records source** are still needed for the rest. MCA is now only an optional
**corroboration/freshness** check, not a hard dependency — except for entity **strike-off
date/section**, which `din_status` does not cover.

---

## 5. Gaps that remain even with both APIs

The tester must render these as explicit **GAP** rows, each tagged with the source that
would close it:

**Submodule 1**
1. **IM-disclosed material litigation schedule** → comes from the deal's **Information
   Memorandum** (target-provided), post-IM only. Reconciliation logic cannot run pre-IM.
2. **Court order PDFs** for disposed cases → **eCourts** scrape (deferred).
3. **Per-case claim amounts (₹)** → not surfaced by Probe42 for non-financial-dispute
   matters; not in Watchout either.

**Submodule 2**
4. **Strike-off date + section invoked** → **MCA portal** (`din_status` covers the director's
   own status, not the *entity's* strike-off particulars).
5. **Criminal records (general/personal)** → dedicated **criminal-records** source (Watchout only covers economic-offence/agency actions).
6. **CIBIL suit-filed** → **credit bureau**.
7. **ADT-3** (past auditor change) → MCA filing / AOC-4 bundle.
8. **Promoter personal & foreign-entity legal history** → out of v1 scope.

> **No longer gaps (resolved by `din_status` passing the verbatim MCA reason):**
> director **disqualification (Sec 164(2))** and **DIR-3 KYC deactivation** are read
> directly from the `din_status` text. An MCA-portal lookup is now an *optional* freshness/
> corroboration step (Probe's `last_updated` tells you how stale the value may be), not a
> blocker. Because the reason is **free text**, the build needs a tolerant parser/mapping
> of reason strings → states — see the build guide.

---

## 6. Scope guardrails

- **Only Submodules 1 and 2.** No statutory/tax/labour (S3) or auditor/CARO (S4) blocks —
  but leave clearly-labelled cross-module export stubs where the mock had them.
- **Pre-IM posture.** Anything that needs the Information Memorandum is a GAP, not a TODO
  to fake.
- **Two levels:** entity-level (company/LLP) litigation + director-level risk.
- **Test data:** **ACC India Private Limited is _not_ in the Probe42 sandbox** (needs a
  production key). For sandbox testing use a listed company (e.g. Godrej Properties,
  Flipkart) to see rich data and a small private company to exercise empty/GAP states.
  Watchout is exercised with its own test credentials + encryption key, separately.
- **Confidentiality:** Probe's sandbox entity list is *STRICTLY CONFIDENTIAL*; keep it in
  private repos only. Watchout login credentials and the AES key are secrets — server-side,
  never in the browser, never committed.
