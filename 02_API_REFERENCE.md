# Consolidated API Reference — Probe42 + Watchout Investors

_Last updated: 2026-06-10_

The endpoints, auth, and response fields for **both** APIs, focused on what **Submodule 1
(Litigation Register)** and **Submodule 2 (Director Legal & Regulatory)** actually consume.
The full verbatim Probe42 reference (all 30 endpoints) lives in `probe42-api-reference.md`;
this file is the working subset plus the Watchout API and a field→submodule map.

> **Both APIs are server-side only.** Probe42 = secret `x-api-key` + no CORS. Watchout =
> secret login credentials + a secret AES encryption key. The browser only ever calls our
> own `/api/*` proxy endpoints.

---

## A. Probe42 (V1 REST)

### A.1 Base URLs, headers, identifiers

| | Sandbox | Production |
|---|---|---|
| Core data | `https://api.probe42.in/probe_pro_sandbox` | `https://api.probe42.in` |
| Reports/docs | `https://api.probe42.in/probe_reports_sandbox` | `https://api.probe42.in` |

**Required headers (all requests):** `x-api-key: <KEY>`, `Accept: application/json`,
`x-api-version: 1.3`.

**Identifiers:** `CIN` (companies), `LLPIN` (LLPs), `PAN` (only PANs already in Probe's DB;
pass `identifier_type=PAN`), `BID` (Probe internal id), `DIN` (director), `doc-id`
(documents), `request_id` (async update polling).

**Error codes:** `400` bad request · `403` missing/incorrect key · `404` not found (special
case: *"Entity requested is not probed yet. Call update()…"*) · `422` validation (e.g. bad
CIN) · `429` insufficient credits / rate limited · `500/502/504` server/timeout.

### A.2 Endpoints we use for these two submodules

| Endpoint | Method | Use |
|---|---|---|
| `/entities?filters=<urlenc>&limit=` | GET | **Search** companies/LLPs/P&Ps by name → identifiers. |
| `/companies/{id}/comprehensive-details` | GET | **Submodule 1 + 2 backbone** (company). 404 → call update first. |
| `/llps/{id}/comprehensive-details` | GET | Same for LLPs. |
| `/director/network?din={DIN}` (or `?PAN=`) | GET | All companies + LLPs a director is/was in (active + past via `date_of_cessation`). **Submodule 2 "other directorships".** |
| `/directors/{id}` (`Identifier Type` = `DIN`/`PAN`) | GET | Director identity + **`din_status`** + DIR-3/DSC status. **Submodule 2 identity.** |
| `/companies/{id}/update` | POST | Initiate probe for a not-yet-probed entity → `request_id`. |
| `/companies/{id}/get-update-status?request_id=` | GET | Poll the probe status. |
| `/companies/{id}/reference-document-by-id?doc-id=` | GET | Optional: pull MCA reference PDFs (e.g. credit-rating rationale). |

### A.3 Comprehensive response — sections that feed our two submodules

`GET /companies/{id}/comprehensive-details` → `{ metadata, data }`. `data` has ~40
sections; the ones we read:

**For Submodule 1 (litigation + distress):**

```jsonc
"legal_history": [
  { "petitioner": "string", "respondent": "string", "court": "string",
    "date": "string", "case_status": "string", "case_number": "string",
    "case_type": "string", "case_category": "string", "severity": "string" }
],
"legal_cases_of_financial_disputes": [ /* array */ ],
"defaulter_list": [ /* array */ ],
"bifr_history": [ /* array */ ],          // legacy "sick company"
"cdr_history": [ /* array */ ],            // debt restructuring
"struckoff248_details": [ /* array */ ],   // strike-off u/s 248
"msme_supplier_payment_delays": [ /* array */ ],
"open_charges": [ { "id":"number","date":"string","holder_name":"string","amount":"number","type":"string" } ],
"company": { "cirp_status": "null", /* IBC insolvency */ "...": "..." },
"key_indicators": {
  "pending_cases_filed_against_this_corporate": "boolean",
  "bureau_defaults": "boolean",
  "gst_filing_delay": "boolean",
  "epf_payment_delay": "null"
}
```

> **`legal_history` is the heart of Submodule 1.** It is **case-level**, **court-keyed**,
> and carries a **`severity`** tag natively. Split rows by `case_status`
> (pending/disposed) and by direction (the company as `petitioner` vs `respondent`) to
> build blocks 1A–1D.

**For Submodule 2 (directors):**

```jsonc
"authorized_signatories": [
  { "pan":"string","din":"string","name":"string","designation":"string",
    "din_status":"string","date_of_appointment":"string",
    "date_of_appointment_for_current_designation":"string",
    "date_of_cessation":"null","dsc_status":"null","dsc_expiry_date":"null",
    "association_history":[ { "event":"null","designation_after_event":"string","event_date":"string","filing_date":"null" } ] }
],
"director_network": [
  { "name":"string","pan":"string","din":"string",
    "network": { "companies":[ { "cin":"string","legal_name":"string","company_status":"string","designation":"string","date_of_appointment":"string","date_of_cessation":"string" } ],
                 "llps":[ /* same idea */ ] } }
],
"related_party_transactions": [ { "financial_year":"string","company":"...","llp":"...","individual":"...","others":"..." } ]
```

> **`din_status` passes through the literal MCA DIN-status reason string verbatim — it is
> not a collapsed flag.** So **disqualification (Sec 164(2))** and **DIR-3 KYC deactivation**
> are read **directly** from the reason text (e.g. *"Disqualified u/s 164(2)"*, *"Deactivated
> due to non-filing of DIR-3 KYC"*, *"Approved"*). Because the wording is free text, parse it
> with a **tolerant string→state mapping** (see the build guide), and treat an MCA-portal
> lookup as optional corroboration/freshness only. `director_network[].network` gives the
> **other directorships**; cross-check each entity's `company_status` against `Strike Off`
> to compute **strike-off exposure**.

**Director-only endpoints** (when starting from a DIN rather than a company):

```jsonc
// GET /directors/{id}
"data": { "director": { "name":"string","pan":"string","din":"string","date_of_birth":"string",
  "age":"string","gender":"string","nationality":"string","din_status":"string","dsc_status":"null","address":{ ... } } }
```

---

## B. Watchout Investors (PRIME)

A two-step, **AES-encrypted** API: log in for a JWT, then POST encrypted search params and
decrypt the encrypted response.

### B.1 Auth + crypto

| | Value |
|---|---|
| Login URL | `https://www.watchoutinvestors.com/api/login` |
| Data URL | `https://www.watchoutinvestors.com/api/json` |
| Login body | `{ "Userid": "<USERID>", "Password": "<PASSWORD>" }` *(provided separately — secrets)* |
| Login response | `{ "Token": "<JWT>", "Token-Expire-in": 60 }` (minutes) |
| Auth header (all calls) | `Authorization: Bearer <JWT>` · `Content-Type: application/json` |
| Encryption | **AES-256, CBC, PKCS5Padding, 16-byte block, fixed IV = 16 zero bytes** |
| Key | The AES key is **provided separately** (separate test vs production keys) — a secret. |

> Do **not** hard-code the sample `Userid`/`Password`/key anywhere; load from server-side
> env. Cache the JWT and refresh on expiry (≈60 min) or on a `A320` response.

**Flow sequence:** Login → JWT → send `{JWT + AES-encrypted params}` → server verifies JWT
→ decrypts → encrypts response → returns encrypted body → **you decrypt with the same key**.

### B.2 Request (POST to the data URL)

Body — **`Userid` in plain text; every other field AES-encrypted**:

```jsonc
{
  "Userid": "<plain-text userid>",
  "Defaulter_Name": "<AES-encrypted>",   // name search (entity or person)
  "Defaulter_Type": "<AES-encrypted>",   // "P" = person, "C" = entity
  "Search_Type":    "<AES-encrypted>",   // "E" exact, "R" regular, "L" like
  "PAN_CIN_DIN":    "<AES-encrypted>"     // PAN/CIN/DIN — wins over name if both sent
}
```

Field constraints: `Userid` 26–32 · `Defaulter_Name` 6–100 · `Defaulter_Type` 1 · `Search_Type` 1 · `PAN_CIN_DIN` 8–50.
Send **either** a name **or** a PAN/CIN/DIN — if both, the ID wins and the name is ignored.

**Search types (Annexure I):** **E** exact substring across defaulter names · **R**
whole-string-only · **L** like (exact + first/last word search). Entity/person name
**standardization** applies (e.g. LIMITED→LTD., COMPANY→CO., KUMAR→KR., punctuation→space).

### B.3 Response

`200 OK`. The **`PRIME_Code`** header signals the result:

| Code | Meaning |
|---|---|
| `A100` | Success |
| `A200` | No record found |
| `A210` | Minimum parameter length not provided |
| `A310` | No parameter string provided |
| `A320` | Unauthorized (re-auth / refresh JWT) |
| `A340` | Timeout |
| `A400 / E001 / E002` | Error |
| `A500` | Result exceeded max records — refine search |
| `A520 / A540 / A530` | Call limit exceeded (peak / non-peak / monthly) |

Body is **encrypted**; decrypt with the same AES key. Decrypted record fields (used by
Submodule 2, and optionally Submodule 1's regulatory side-lane):

```
Record_ID, Regulator_Competent_Authority_Name, Order_Date,
Defaulter_Code, Defaulter_Name, Defaulter_Type_Company_Person (C/P),
Defaulter_New_Name1..4, Defaulter_Old_Name1..4, Defaulter_Merged_With,
PAN_CIN_DIN,
Not_Defaulter_Infact_Associated_Entity,   // "linked to a defaulter, not itself one"
Defaulter_Other_Details,                   // role: Remisier/Agent/Sub-Broker/Member of
Alongwith, Associated_Entity_Person,
Regulatory_Charges, Regulatory_Actions,
Regulatory_Action_Source1..3,
Further_Development1..22 (+ _Source1..22)   // dated case-history trail
```

### B.4 Rate / volume limits (plan the tester around these)

- **6 calls/minute** (hard).
- **350 calls** peak (09:00–20:00); up to **1300** off-peak (20:00–09:00).
- **50,000 calls/month.**
- **≤250 records** per result (else `A500`).

---

## C. Field → Submodule source map

The single sheet that says, per field, **which API + endpoint + field** fills it and the
honest verdict. `JUDG` = engineering-tunable logic, not a raw field.

### Submodule 1 — Litigation Register

| Block / field | Source | Verdict |
|---|---|---|
| KPI counters (pending/disposed, against/by, NCLT, criminal, regulator-initiated, probable) | Probe42 `legal_history` (derived) | ✅ |
| 1A Pending against · 1B Pending by · 1C Disposed against · 1D Disposed by | Probe42 `legal_history` (split by `case_status` + direction) | ✅ |
| Severity tag per case | Probe42 `legal_history.severity` (+ `JUDG` re-tag) | ✅ |
| Case category (S45) / type / court / parties / dates | Probe42 `legal_history` fields | ✅ |
| 1E Corporate-affairs consolidation (CCA) | Probe42 `legal_history` (CCA subset) | ✅ |
| 1F Probable / unverified records | Probe42 `legal_history` (low-confidence) | ✅ |
| 1G Litigation trend (filing-year) | Probe42 + `JUDG` (case-number regex) | ✅ (illustrative) |
| Distress cross-export (IBC/BIFR/CDR/strike-off) | Probe42 `cirp_status`/`bifr_history`/`cdr_history`/`struckoff248_details` | ✅ |
| Regulator *orders* not filed as court cases | Watchout (entity search) | ➕ optional side-lane |
| **IM-disclosed litigation schedule** | Information Memorandum (post-IM) | ❌ GAP |
| **Court order PDFs (disposed)** | eCourts | ❌ GAP |
| **Per-case claim amounts (₹)** | none (Probe42 only for financial-dispute matters) | ❌ GAP |

### Submodule 2 — Director Legal & Regulatory

| Block / field | Source | Verdict |
|---|---|---|
| 2A identity, DIN, designation, appt dates | Probe42 `authorized_signatories` / `/directors/{id}` | ✅ |
| 2A DIN status | Probe42 `din_status` (verbatim MCA reason) | ✅ |
| 2A DIR-3 KYC | Probe42 `din_status` reason (e.g. "Deactivated due to non-filing of DIR-3 KYC") | ✅ |
| 2A **Reg actions** column + "with regulatory action" counter | **Watchout** (DIN/PAN search) | ✅ |
| 2A Defaulter hits — RBI wilful / regulator fraud | **Watchout** | ✅ partial |
| 2A Defaulter hits — CIBIL suit-filed | credit bureau | ❌ GAP |
| 2A **Criminal** column | Watchout (economic-offence only) + criminal-records source | ⚠️ partial |
| 2A / 2C strike-off **exposure** (which entities) | Probe42 `director_network` (`company_status = Strike Off`) | ✅ |
| 2C strike-off **date + section** | MCA portal | ❌ GAP |
| 2B per-director drawer (assoc. history, other directorships, RPT link) | Probe42 | ✅ (+ Watchout for reg/criminal/defaulter rows) |
| 2D recently-resigned (lookback window) | Probe42 `date_of_cessation` + `JUDG` (window) | ✅ |
| Disqualified counter (Sec 164(2)) | Probe42 `din_status` reason ("Disqualified u/s 164(2)"); MCA/auditor PDF = optional corroboration | ✅ |
| Promoter personal / foreign-entity history | out of v1 (India slice partly Watchout) | ❌ GAP |

**Provenance badges to render** (mirror the mock's legend): `P42`, `WATCHOUT`, `MCA`,
`ECOURTS`, `IM`, `BUREAU`, `PDF` (auditor bundle), `JUDG` (engineering-tunable), `GAP`.
