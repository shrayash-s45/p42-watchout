# Application Build Guide — Two-Submodule Legal DD Tester

_Last updated: 2026-06-10_

How to build an interface that **tests Probe42 and Watchout Investors together** and
renders a legal-DD report scoped to **Submodule 1 (Litigation Register)** and **Submodule 2
(Director Legal & Regulatory)** — structurally like the ACC mock, with a small general
company header, and **every unfillable field marked as a GAP**.

Read first: [`01_CONTEXT.md`](01_CONTEXT.md) (what & why) and
[`02_API_REFERENCE.md`](02_API_REFERENCE.md) (endpoints + field→submodule map). The
existing Probe42 wiring is described there; this guide adds the Watchout side, the
orchestration, and the two-submodule rendering spec.

---

## 1. Goal & acceptance criteria

A reviewer can:

1. **Load a company** by CIN/PAN (sandbox or production), or by name-search → pick.
2. See a **general header** (name, CIN, status, incorporation, paid-up, last AGM — from Probe42).
3. See **Submodule 1** fully built from Probe42, severity-tagged, with the 3 known GAP rows shown.
4. See **Submodule 2** with Probe42 identity/strike-off + **Watchout** regulatory/defaulter
   enrichment per director, and **all remaining GAP rows shown** (MCA, criminal, CIBIL, etc.).
5. Toggle Watchout **off** and watch Submodule 2 **degrade gracefully** to "MCA-only"
   (every Watchout-fed cell flips to a `GAP` chip) — proving the dependency.
6. Open an **"All data"** tab showing the raw responses so nothing is hidden.
7. See a **gap summary** per submodule (counts + the source that closes each).

**Done = the tester demonstrates exactly what the two APIs can and cannot populate, with
provenance on every cell.** It is a diagnostic, not a polished product.

---

## 2. Architecture — extend "two front doors, one pipeline"

Reuse the existing pattern. Add a **Watchout module** mirroring the Probe42 module, and an
**orchestration** step that fans out per director.

```
Browser (React)
  │  POST /api/legal-dd  { entityType, identifier, idType, useWatchout }
  ▼
Express route (server.js)  ──or──  Vercel function (api/legal-dd.js)
  │
  ▼
legal-dd/orchestrator.js
  ├─ probe42/handlers.js        → comprehensive-details (+ update-if-not-probed)
  │                               → director_network / directors per DIN
  ├─ watchout/handlers.js       → login(JWT, cached) → encrypted search per DIN + per entity
  │                               → decrypt → normalize
  ├─ legal-dd/submodule1.js     → build Litigation Register from Probe42 legal_history
  ├─ legal-dd/submodule2.js     → merge Probe42 directors + Watchout per-DIN, mark gaps
  └─ legal-dd/gaps.js           → attach provenance + GAP rows per spec
  ▼
JSON: { header, submodule1, submodule2, gaps, raw, watchoutAvailable }
  ▼
Browser: public/app/legalAdapter.js  → shape for the two submodule tabs
  ▼
React: <Header/> <Submodule1/> <Submodule2/> <AllData/> <GapSummary/>
```

### New `watchout/` module (mirror `probe42/`)

| File | Role |
|---|---|
| `watchout/config.js` | Env: login URL, data URL, `WATCHOUT_USERID`, `WATCHOUT_PASSWORD`, `WATCHOUT_AES_KEY`, base toggle (test/prod). All **secret**. |
| `watchout/crypto.js` | AES-256-CBC + PKCS5, fixed 16-zero-byte IV: `encrypt(plain)` / `decrypt(cipher)`. |
| `watchout/client.js` | `login()` (caches JWT ~60 min), `search({name,type,searchType,panCinDin})` → POST encrypted body, parse `PRIME_Code`, decrypt body. Typed `WatchoutError`. |
| `watchout/normalize.js` | Decrypted record(s) → flat `{ regulator, orderRef, orderDate, charges, action, status, sources[], developments[], associated[] }`. |
| `watchout/handlers.js` | Framework-agnostic `searchEntity` / `searchDirector` with rate-limit guard. |

### New `legal-dd/` module

| File | Role |
|---|---|
| `orchestrator.js` | Loads the entity, resolves directors, fans out to both APIs, assembles the response. |
| `submodule1.js` | Pure function: Probe42 `legal_history` (+ distress) → blocks 1A–1G + counters + findings. |
| `submodule2.js` | Pure function: Probe42 directors + Watchout per-DIN → blocks 2A–2D + counters + findings. |
| `gaps.js` | Central registry of GAP definitions (id, label, closing-source, which submodule/field). |

> **Server-side only, again.** Watchout credentials + AES key live in env on the server.
> The browser calls `/api/legal-dd` (and optional granular `/api/watchout/*`) — never
> Watchout directly.

---

## 3. Orchestration / data flow

```
1. Resolve entity
   - If name given → Probe42 /entities → user picks → identifier.
   - GET /companies/{id}/comprehensive-details
       └─ 404 "not probed" → POST /companies/{id}/update → poll get-update-status → retry.
2. Build Submodule 1 (Probe42 only)
   - submodule1.build(comprehensive)  // no Watchout needed for the core register
   - (optional) Watchout entity search (Defaulter_Type="C", PAN_CIN_DIN=CIN) → regulatory side-lane.
3. Resolve directors
   - From comprehensive.authorized_signatories (active) → list of {din, pan, name}.
   - (optional) /director/network per DIN for richer other-directorships.
4. Build Submodule 2
   - For each active director:
       • Probe42: din_status, DIR-3/DSC, association_history, other-directorships, strike-off exposure.
       • If useWatchout: watchout.searchDirector(din) → reg actions, defaulter hits, economic-offence rows.
       • Else: every Watchout-fed cell = GAP.
   - submodule2.build(directors, watchoutResults, watchoutAvailable)
5. Attach gaps + provenance, return.
```

**Watchout fan-out respects the limits** (§B.4 of the reference): **≤6 calls/min**, batch
directors with a small queue, cache JWT, and short-circuit on `A320` (re-auth) / `A500`
(refine) / `A520/A530/A540` (limit hit → mark those rows `GAP: Watchout limit`).

---

## 4. Submodule 1 — Litigation Register (build spec)

**Source: Probe42 `legal_history` (+ `legal_cases_of_financial_disputes`, `defaulter_list`,
`cirp_status`, `bifr_history`, `cdr_history`, `struckoff248_details`,
`msme_supplier_payment_delays`, `key_indicators`).** No Watchout required for the core.

### KPI band (derive from `legal_history`)
- Pending count · Disposed count · Cases AGAINST · Cases BY ·
- NCLT/IBC pending against · Criminal pending against (NI Act vs other) ·
- Regulator-initiated pending against · Probable + Unverified.

### Finding callouts (severity)
- **Critical**: any pending IBC/NCLT petition against the company (surface case no.,
  petitioner, last hearing, days-since; queue a management question if duplicate/consolidated).
- **Amber**: recurring-counterparty **clusters** (same party ≥ threshold) and NI Act matters.
- **Soft**: **dormant** cases (last hearing > 365 days) and unverified records.

### Detail blocks (split `legal_history`)
| Block | Filter | Columns |
|---|---|---|
| **1A** Pending AGAINST | `case_status=pending` & company is `respondent` | case_no, category, court, petitioner, initiator type, last hearing, days-since, **severity** |
| **1B** Pending BY | `case_status=pending` & company is `petitioner` | case_no, category, court, respondent, respondent type, last hearing, days-since |
| **1C** Disposed AGAINST | `case_status=disposed` & respondent | + judgement date |
| **1D** Disposed BY | `case_status=disposed` & petitioner | + judgement date |
| **1E** Corporate-affairs consolidation | CCA subset | empty-state if none |
| **1F** Probable / Unverified | low-confidence rows | + confidence reason (e.g. name variant, portal down) |
| **1G** Litigation trend (5 FY) | filing-year via case-no regex (`JUDG`) | AGAINST vs BY per FY (illustrative) |

### Cross-module export stubs (label only; S3/S4 are out of scope)
- IBC pending count → "Credit History (distress)".
- Regulator-initiated count → "Final Synthesizer".
- Pattern clusters → "Mgmt Q queue".

### GAP rows to render (Submodule 1)
- `GAP · IM` — IM-disclosed material litigation schedule (post-IM; reconciliation can't run).
- `GAP · ECOURTS` — court order PDFs for disposed cases.
- `GAP · none` — per-case claim amounts (₹) for non-financial-dispute matters.

### Engineering-tunable (`JUDG`) — surface, don't hide
Severity rule-set (1A) · filing-year regex (1G) · cluster threshold (≥3) · dormancy window
(365d) · days-since computed from **today**.

---

## 5. Submodule 2 — Director Legal & Regulatory (build spec)

**Sources: Probe42 (identity, DIN status, strike-off exposure, KYC, association) +
Watchout (per-director regulatory action + defaulter/economic-offence).** This is where the
two APIs combine — and where most GAP rows live.

### KPI band
- Total directors (Probe42) · **Disqualified** (Probe42 `din_status` reason = "Disqualified
  u/s 164(2)"; MCA/auditor PDF = optional corroboration) ·
  **With regulatory action** (`Watchout`; `GAP` if off) · With strike-off exposure (Probe42) ·
  **With criminal record** (`Watchout` partial → still `GAP·criminal-source`) ·
  **With defaulter hit** (`Watchout` partial) · DIR-3 KYC pending/lapsed (Probe42 `din_status`
  reason) · Recently resigned (Probe42 + window `JUDG`).

### 2A — Director Risk Matrix (one row per active director)
Columns and their source chips:

| Column | Source |
|---|---|
| Name, DIN, Designation, Appt date | `P42` |
| DIN status / **Disqualified** (Sec 164(2)) | `P42` (`din_status` — verbatim MCA reason, parsed) |
| DIR-3 KYC | `P42` (`din_status` reason: "Deactivated due to non-filing of DIR-3 KYC") |
| Reg actions | `WATCHOUT` → `GAP` if off |
| Criminal | `WATCHOUT` partial + `GAP·criminal-source` |
| Strike-off assoc. (count) | `P42` (`director_network`, `company_status=Strike Off`) |
| Defaulter hits | `WATCHOUT` partial (`GAP·BUREAU` for CIBIL) |
| **Risk** (composite) | `JUDG` (degrades to "Unknown — pending Watchout" when off) |

### 2B — Per-Director drawer (click a 2A row)
- **Identity & status** — `P42`.
- **Association history** — `P42` (`association_history`).
- **Other directorships** — `P42` (`director_network`), flag any that are **Related Party**
  (cross-check `related_party_transactions`) and any `Strike Off`.
- **Regulatory actions** — `WATCHOUT` per-DIN: `regulator | order ref | date | nature |
  status` (+ up to 22 dated developments). `GAP` if off.
- **Criminal (personal capacity)** — `WATCHOUT` (economic-offence only) + note any Block 1F
  probable case naming this director; `GAP·criminal-source` for general criminal.
- **Defaulter hits** — `WATCHOUT` (RBI wilful / regulator fraud) + `GAP·BUREAU` (CIBIL suit-filed).
  Note: Probe42 entity-level distress is **not** per-DIN.

### 2C — Prior strike-off entity associations (consolidated)
- Entity name + CIN + association period → `P42`.
- **Strike-off date + section invoked** → `GAP·MCA` (Probe42 surfaces status, not date/section).

### 2D — Recently resigned directors
- `date_of_cessation` within lookback window (`JUDG`, default 3y) → `P42`.
- Keep historic/out-of-window directors as a trail (not flagged).

### GAP rows to render (Submodule 2)
- `GAP · WATCHOUT` — per-director regulatory feed (drives the reg/criminal/defaulter cells when off).
- `GAP · MCA` — **strike-off date + section invoked only** (the entity's strike-off particulars). DIN status, disqualification, and DIR-3 KYC are **not** gaps — they come from `din_status`; an MCA lookup is optional corroboration/freshness.
- `GAP · criminal-source` — general/personal criminal records.
- `GAP · BUREAU` — CIBIL suit-filed.
- `GAP · scope` — promoter personal & foreign-entity legal history (out of v1).

---

## 6. The gap-marking system (core requirement)

Every rendered cell carries a **provenance chip**; every unfillable cell carries a **GAP
chip naming the closing source.** Centralise definitions in `legal-dd/gaps.js`:

```js
// gaps.js — single source of truth
export const GAPS = {
  IM_LITIGATION:   { sub:1, label:"IM-disclosed litigation schedule", closes:"IM (post-IM)" },
  ECOURTS_PDF:     { sub:1, label:"Court order PDFs (disposed)",       closes:"eCourts" },
  CLAIM_AMOUNTS:   { sub:1, label:"Per-case claim amounts (₹)",        closes:"none available" },
  WATCHOUT_FEED:   { sub:2, label:"Per-director regulatory feed",      closes:"Watchout Investors" },
  MCA_STRIKEOFF:   { sub:2, label:"Strike-off date + section",         closes:"MCA portal" },
  CRIMINAL_GENERAL:{ sub:2, label:"General/personal criminal records", closes:"criminal-records source" },
  CIBIL_SUIT:      { sub:2, label:"CIBIL suit-filed",                  closes:"credit bureau" },
  PROMOTER_HIST:   { sub:2, label:"Promoter personal/foreign history", closes:"out of v1 scope" },
  // NOTE: there is deliberately no MCA_DIN gap. DIN status, disqualification (Sec 164(2)),
  // and DIR-3 KYC come straight from Probe42 `din_status`, which relays the verbatim MCA
  // reason. An MCA-portal lookup is optional corroboration/freshness, not a gap.
};
```

Because `din_status` is **free text**, map it with a tolerant matcher (not exact equality):

```js
// din.js — verbatim MCA reason → state (order matters; match on substrings, case-insensitive)
export function parseDinStatus(raw = "") {
  const s = raw.toLowerCase();
  if (s.includes("disqualif"))                 return { state:"DISQUALIFIED", critical:true, reason:raw };
  if (s.includes("deactivat") && s.includes("kyc")) return { state:"KYC_DEACTIVATED", reason:raw };
  if (s.includes("deactivat"))                 return { state:"DEACTIVATED", reason:raw };
  if (s.includes("approv") || s.includes("active")) return { state:"ACTIVE", reason:raw };
  return { state:"UNKNOWN", reason:raw };       // unrecognised wording → surface raw + JUDG chip
}
```
Unrecognised wording should render the **raw string** with a `JUDG` chip (so a reviewer
sees it) rather than being silently dropped — MCA phrasing varies.

Render rules:
- A populated cell → `<chip class="P42|WATCHOUT|MCA|PDF|JUDG">` + value.
- An unfillable cell → `<chip class="GAP">` + `gaps.closes`.
- `JUDG` cells (severity, trend, windows, risk score) get a distinct chip so reviewers know
  they are **engineering-tunable placeholders**, not raw data.
- A **Gap Summary** panel lists, per submodule, the active GAPs and their closing source,
  plus a count (e.g. "Submodule 2: 4 of 7 KPIs depend on Watchout").

When `useWatchout=false`, the orchestrator flips every Watchout-fed cell to `GAP ·
WATCHOUT` and the composite risk to "Unknown — pending Watchout" — this **degraded mode**
must be visibly correct (the mock's "~30% depth, MCA-only" state).

---

## 7. Watchout integration specifics (pseudocode)

```js
// watchout/crypto.js  — AES-256-CBC, PKCS5, fixed 16-zero-byte IV
import crypto from "crypto";
const IV = Buffer.alloc(16, 0);                 // bytes(bytearray(16))
const key = Buffer.from(process.env.WATCHOUT_AES_KEY, "utf8"); // 32 bytes for AES-256
export const encrypt = (plain) => {
  const c = crypto.createCipheriv("aes-256-cbc", key, IV);     // PKCS5≈PKCS7 default padding
  return Buffer.concat([c.update(plain, "utf8"), c.final()]).toString("base64");
};
export const decrypt = (b64) => {
  const d = crypto.createDecipheriv("aes-256-cbc", key, IV);
  return Buffer.concat([d.update(Buffer.from(b64, "base64")), d.final()]).toString("utf8");
};
```

```js
// watchout/client.js  — login + per-DIN search
let jwt = null, jwtAt = 0;
async function login() {
  const r = await fetch(LOGIN_URL, { method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ Userid: env.WATCHOUT_USERID, Password: env.WATCHOUT_PASSWORD }) });
  const j = await r.json(); jwt = j.Token; jwtAt = Date.now();             // expires ~60 min
  return jwt;
}
async function token() { return (!jwt || Date.now()-jwtAt > 55*60_000) ? login() : jwt; }

export async function searchDirector(din) {
  const t = await token();
  const body = {
    Userid: env.WATCHOUT_USERID,                 // plain text
    Defaulter_Name: encrypt(""),                 // empty: searching by ID
    Defaulter_Type: encrypt("P"),                // person
    Search_Type:    encrypt("E"),                // exact
    PAN_CIN_DIN:    encrypt(din),                // DIN wins over name
  };
  const r = await fetch(DATA_URL, { method:"POST",
    headers:{ Authorization:`Bearer ${t}`, "Content-Type":"application/json" },
    body: JSON.stringify(body) });
  const code = r.headers.get("PRIME_Code") || r.headers.get("PRIME_CODE");
  if (code === "A320") { jwt = null; return searchDirector(din); }        // re-auth once
  if (code === "A200") return { code, records: [] };                       // no record
  if (["A520","A530","A540"].includes(code)) return { code, limited:true };// limit hit → GAP
  const records = JSON.parse(decrypt(await r.text()));                     // decrypt body
  return { code, records };
}
```

Guards: a small **rate-limit queue** (≤6/min), batch directors, and a monthly counter so a
test run can't blow the 50k cap. Map non-`A100` codes to `GAP` rows rather than throwing.

> **India-only + economic-default scope.** Treat Watchout's criminal/defaulter contribution
> as *partial* (see `01_CONTEXT.md §4`): RBI wilful-defaulter and regulator fraud are in
> scope; CIBIL suit-filed and general criminal records are not.

---

## 8. Rendering

- One assembled object per load (mirror the existing `buildCompany()` pattern):
  `{ header, submodule1{ kpis, findings, blocks{1A..1G}, gaps }, submodule2{ kpis, findings,
  matrix(2A), drawers(2B), strikeOff(2C), resigned(2D), gaps }, gapSummary, raw }`.
- **Safe defaults for every field** → missing sections render empty states, never crash.
- Tabs: **Header · Submodule 1 · Submodule 2 · Gap Summary · All data** (raw responses).
- Reuse the mock's legend/badge styling; add the `GAP`/`JUDG`/`WATCHOUT` chips.
- A header toggle **"Use Watchout"** drives the degraded-mode demonstration.

---

## 9. Testing plan

1. **Probe42 sandbox** (no Watchout): pick a **listed** company (Godrej Properties
   `L74120MH1985PLC035308`, Flipkart `U51909KA2011PTC060489`) → rich `legal_history`,
   directors, strike-off exposure. Confirm Submodule 1 fully builds and the 3 GAP rows show.
2. **Empty-state company** (a small private one) → confirm blocks degrade to empty states,
   not crashes.
3. **Not-probed path** → confirm the update → poll → retry flow.
4. **Watchout on** (test creds + AES key): confirm per-director reg-action rows populate,
   `PRIME_Code` handling (`A100/A200/A320/A500/limits`), and decrypt works.
5. **Watchout off** → confirm Submodule 2 degrades to MCA-only with every Watchout cell as
   `GAP · WATCHOUT` and risk = "Unknown — pending Watchout".
6. **ACC India** is **not** in the Probe42 sandbox → only testable with a **production key**;
   note this in the run log rather than faking it.

---

## 10. Caveats / unverified assumptions (confirm before production)

Carried from the prior Probe42 integration, plus Watchout additions:

**Probe42**
- PAN flag param name (`identifier_type=PAN`) — verify exact spelling.
- Document param names (`type`, `doc-id`, report `type`/`client_name`/`unit`).
- `/update` postback without a whitelisted URL; comprehensive-report `PROBE42_REPORT_TYPE`.
- Financial unit scaling (÷1e7 rupees→₹Cr) — re-check if production figures look off by 100/1000×.
- **`din_status` reason coverage** — confirmed it relays the **verbatim MCA reason** (not a
  collapsed flag), so disqualification and DIR-3-KYC deactivation are read directly. Open
  items: (a) MCA **wording varies**, so harden `parseDinStatus` against unseen phrasings and
  surface unrecognised text with a `JUDG` chip rather than dropping it; (b) the reason
  rarely carries the **disqualifying company + period** — if you need those, that's the only
  part still requiring an MCA-portal lookup; (c) watch **freshness** via Probe's
  `last_updated` (the relayed status is only as current as Probe's last refresh).

**Watchout**
- **AES key length/encoding** — AES-256 needs a 32-byte key; confirm the provided key's
  encoding (raw vs hex vs base64) and that PKCS5≈PKCS7 default padding matches their server.
- **JWT lifetime** — assume ~60 min; refresh on `A320`. Confirm header name casing
  (`PRIME_Code`).
- **DIN search reliability** — confirm a DIN in `PAN_CIN_DIN` returns the person's record(s)
  (and how multiple matches / associated-entity rows are shaped) so 2B renders correctly.
- **Test vs production** — separate Userid/Password/key per environment; never reuse or
  commit the sample login credentials from the API PDF.
- **Rate/volume** — 6/min, 350 peak / 1300 off-peak / 50k month, ≤250 records: keep the
  fan-out queued and counted.
