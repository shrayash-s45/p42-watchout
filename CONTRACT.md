# API Integration Contract — Probe42 & Watchout Investors

A practical implementation guide for both APIs used by this tester: authentication, **every
endpoint**, request/response shapes, and **real working examples** that returned data.

> **Golden rule:** both APIs are **server-side only**. Probe42 uses a secret `x-api-key` and
> sends no CORS headers; Watchout uses secret login credentials + a secret AES key. The browser
> must never call either directly — it talks to our own `/api/*` proxy. Load all secrets from
> environment variables (`.env`), never hard-code them.

---

# Part 1 — Probe42 (V1 REST)

Corporate profile engine (MCA / regulatory / financial) for Indian entities. Plain JSON REST.

## 1.1 Base URLs

| | Sandbox | Production |
|---|---|---|
| Core data | `https://api.probe42.in/probe_pro_sandbox` | `https://api.probe42.in` |
| Reports/docs | `https://api.probe42.in/probe_reports_sandbox` | `https://api.probe42.in` |

- **Sandbox** key resolves only a fixed set of ~150 test entities.
- **Production** key resolves any real CIN/LLPIN.

## 1.2 Auth & required headers (every request)

```
x-api-key:      <SECRET_API_KEY>
Accept:         application/json
x-api-version:  1.3
```

## 1.3 Identifiers

`CIN` (companies) · `LLPIN` (LLPs) · `PAN` (only PANs already in Probe's DB; pass
`identifier_type=PAN`) · `DIN` (directors) · `doc-id` (documents) · `request_id` (async polling).

## 1.4 Error codes

| HTTP | Meaning |
|---|---|
| 400 | Bad request |
| 403 | Missing/incorrect key |
| 404 | Not found — **special case:** body says *"Entity requested is not probed yet. Call update()…"* |
| 422 | Validation (e.g. bad CIN) |
| 429 | Insufficient credits / rate limited |
| 500 / 502 / 504 | Server / timeout |

## 1.5 All endpoints

| # | Method & path | Purpose |
|---|---|---|
| 1 | `GET /entities?filters=<urlenc>&limit=<n>` | Search companies/LLPs/P&Ps by name → identifiers |
| 2 | `GET /companies/{cin}/comprehensive-details` | Full company profile (Submodule 1 + 2 backbone) |
| 3 | `GET /llps/{llpin}/comprehensive-details` | Full LLP profile |
| 4 | `GET /director/network?din={DIN}` (or `?PAN=`) | All companies + LLPs a director is/was in |
| 5 | `GET /directors/{id}?identifier_type=DIN\|PAN` | Director identity + `din_status` |
| 6 | `POST /companies/{cin}/update` | Initiate a probe for a not-yet-probed entity → `request_id` |
| 7 | `GET /companies/{cin}/get-update-status?request_id=<id>` | Poll the probe status |
| 8 | `GET /companies/{cin}/reference-document-by-id?doc-id=<id>` | Pull an MCA reference PDF |

---

### Endpoint 1 — Search entities by name

```
GET /entities?filters=<URL-encoded JSON>&limit=<n>
```
`filters` must be **URL-encoded JSON**. ⚠️ **The exact filter schema is not in our reference
docs and must be confirmed against Probe42's full `probe42-api-reference.md`.** Empirically:
sending a non-JSON value returns `400 {"message":"Invalid JSON"}`, and several plausible JSON
shapes (`{"name":"godrej"}`, `[{"name":"name","operator":"LIKE","value":"GODREJ"}]`,
`…"values":[…]`, etc.) all return `400 {"message":"Invalid filters passed"}` — so the schema is
specific and still **TODO: confirm with Probe42**.

In-app proxy: `GET /api/probe/search?name=<...>&limit=<n>` (see `probe42/client.js → searchEntities`).

**Representative `200` response shape** (entity identifier records — fields mirror the `company`
block; *illustrative, pending the confirmed filter schema*):
```jsonc
{
  "metadata": { "api_version": "1.3" },
  "data": {
    "entities": [
      {
        "cin": "L74120MH1985PLC035308",
        "legal_name": "GODREJ PROPERTIES LIMITED",
        "pan": "AAACG3995M",
        "status": "Listed",
        "efiling_status": "Active",
        "classification": "Public Limited Indian Non-Government Company",
        "incorporation_date": "1985-02-08"
      }
      // …more matches up to `limit`
    ]
  }
}
```

---

### Endpoints 2 & 3 — Comprehensive company / LLP details

```
GET /companies/{cin}/comprehensive-details      → { metadata, data }
GET /llps/{llpin}/comprehensive-details         → same envelope
```

`data` contains **~40 sections**. The complete list returned for a real company (Godrej):
```
company, description, name_history, authorized_signatories, director_network, contact_details,
open_charges, open_charges_latest_event, charge_sequence, financials, nbfc_financials,
financial_parameters, industry_segments, principal_business_activities, related_party_transactions,
establishments_registered_with_epfo, shareholdings, shareholdings_more_than_five_percent,
shareholdings_summary, director_shareholdings, bifr_history, cdr_history, defaulter_list,
legal_history, credit_ratings, credit_rating_rationale, unaccepted_rating, holding_entities,
subsidiary_entities, associate_entities, joint_ventures, securities_allotment, peer_comparison,
gst_details, struckoff248_details, msme_supplier_payment_delays, legal_cases_of_financial_disputes,
probe_financial_score, key_indicators, filing_dates
```

Sections this tester consumes:
- **Submodule 1 (litigation + distress):** `legal_history[]` (the heart — case-level, court-keyed,
  native `severity`), `legal_cases_of_financial_disputes[]`, `defaulter_list[]`, `bifr_history[]`,
  `cdr_history[]`, `struckoff248_details[]`, `msme_supplier_payment_delays[]`, `open_charges[]`,
  `company.cirp_status`, `key_indicators{}`.
- **Submodule 2 (directors):** `authorized_signatories[]` (incl. `din_status` — the **verbatim MCA
  reason string**, so disqualification & DIR-3-KYC are read directly from it), `director_network[]`,
  `related_party_transactions[]`.

> **Gotchas (handled in `probe42/normalize.js`):** monetary fields are in **raw rupees**
> (`paid_up_capital: 1506038705` → ÷1e7 = ₹150.60 Cr); `holding/subsidiary/associate` are objects
> `{financial_year, company[], llp[], others[]}` not flat arrays; `din_status` is free text → parse
> with a tolerant matcher (`legal-dd/din.js`).

#### ✅ Working example — verified

```bash
curl -s "https://api.probe42.in/probe_pro_sandbox/companies/L74120MH1985PLC035308/comprehensive-details" \
  -H "x-api-key: $PROBE42_API_KEY" -H "Accept: application/json" -H "x-api-version: 1.3"
```

**Returned `200`** (~1.1 MB). Actual response, trimmed (real values; long arrays cut with `// …`):
```jsonc
{
  "metadata": {
    "api_version": "1.3",
    "last_updated": "2026-06-04",
    "identifier_changed": false,
    "document_list_token": "6a294e55889b745699050bad"
  },
  "data": {
    "company": {
      "cin": "L74120MH1985PLC035308",
      "legal_name": "GODREJ PROPERTIES LIMITED",
      "pan": "AAACG3995M",
      "status": "Listed",
      "classification": "Public Limited Indian Non-Government Company",
      "efiling_status": "Active",
      "active_compliance": "ACTIVE compliant",
      "incorporation_date": "1985-02-08",
      "paid_up_capital": 1506038705,        // raw rupees → ₹150.60 Cr
      "authorized_capital": 6690000000,
      "sum_of_charges": 65456500000,
      "cirp_status": null,
      "last_agm_date": "2025-08-01",
      "last_filing_date": "2025-03-31",
      "website": "https://www.godrejproperties.com/",
      "email": "secretarial@godrejproperties.com",
      "lei": { "number": "335800KM3Y5NZWXOE183", "status": "ISSUED", "next_renewal_date": "2027-04-13" },
      "registered_address": {
        "full_address": "Godrej One, 5th Floor, Pirojshanagar, Eastern Express Highway, Vikhroli (East), Mumbai, Maharashtra - 400079",
        "city": "Mumbai", "state": "Maharashtra", "pincode": "400079"
      }
    },

    "key_indicators": {
      "revenue": "More than 1000 cr.",
      "profit": "More than 5 cr.",
      "employee_count": "Upto 100",
      "pending_cases_filed_against_this_corporate": true,
      "bureau_defaults": false,
      "gst_filing_delay": false,
      "epf_payment_delay": null
    },

    "legal_history": [
      {
        "petitioner": "KARAN GILL & ANR.",
        "respondent": "GODREJ PROPERTIES LTD.",
        "court": "National Consumer Disputes Redressal Commission",
        "date": "2018-12-18",
        "case_status": "Pending",
        "case_number": "IA/9637/2016",
        "case_type": "Cases Filed Against This Corporate",
        "case_category": "Applications",
        "severity": "low"
      }
      // … 200+ more rows (total 216 pending across against/by)
    ],

    "authorized_signatories": [
      {
        "pan": "ALCPB9271H",
        "din": "09302960",
        "name": "INDU BHUSHAN",
        "designation": "Director",
        "din_status": "Approved",                 // verbatim MCA reason string
        "gender": "Male",
        "date_of_birth": "1961-01-06",
        "age": 65,
        "date_of_appointment": "2022-05-03",
        "date_of_appointment_for_current_designation": "2022-07-04",
        "date_of_cessation": null,
        "nationality": "India",
        "dsc_status": null,
        "association_history": [
          { "event": null, "designation_after_event": "Director", "event_date": "2022-07-04", "filing_date": null },
          { "event": null, "designation_after_event": "Additional Director", "event_date": "2022-05-03", "filing_date": null }
        ]
      }
      // … more directors (9 total)
    ],

    "director_network": [
      {
        "name": "AMITAVA MUKHERJEE",
        "pan": "AAEPM4024G",
        "din": "00003285",
        "network": {
          "companies": [
            {
              "cin": "U33125MH1995PTC090076",
              "legal_name": "TEXANLAB LABORATORIES PRIVATE LIMITED",
              "company_status": "ACTIVE",          // cross-check vs "Strike Off" for exposure
              "designation": "Director",
              "date_of_appointment": "2017-04-25",
              "date_of_cessation": null
            }
            // … more companies
          ],
          "llps": [ /* same shape */ ]
        }
      }
      // … one entry per director
    ]

    // … 35+ more sections (financials, shareholdings, gst_details, defaulter_list, … — see list above)
  }
}
```

---

### Endpoint 4 — Director network

```
GET /director/network?din={DIN}        (or ?PAN={PAN})
```
Returns every company + LLP a director is/was in (active + past via `date_of_cessation`). Used for
**other-directorships** and **strike-off exposure** (`company_status == "Strike Off"`). Same per-entity
shape as the `director_network[].network` block shown above. In-app, this is usually unnecessary —
`comprehensive-details` already includes `director_network`.

### Endpoint 5 — Director by id

```
GET /directors/{id}?identifier_type=DIN|PAN   →  { data: { director: { … } } }
```
Director identity + `din_status` + DSC status. Use when starting from a DIN rather than a company.

### Endpoints 6 & 7 — Not-probed flow

A first-time entity returns `404` with body *"Entity requested is not probed yet. Call update()…"*:
```
POST /companies/{cin}/update                          → { request_id }
GET  /companies/{cin}/get-update-status?request_id=…  → status (poll a few minutes)
→ then re-fetch /comprehensive-details
```
This tester surfaces the not-probed signal rather than auto-polling (`probe42/handlers.js`).

### Endpoint 8 — Reference document

```
GET /companies/{cin}/reference-document-by-id?doc-id=<id>
```
Pulls an MCA reference PDF (e.g. a credit-rating rationale). `doc-id`s come from the
`document_list_token` / relevant sections of the comprehensive response.

---

# Part 2 — Watchout Investors (PRIME)

National registry of entities/persons indicted by ~35 regulators/agencies for economic default
or non-compliance. **Two-step, AES-encrypted** API: login for a JWT, then POST encrypted search
params and **decrypt the encrypted response body**.

## 2.1 Endpoints (only two)

| Method & path | Purpose |
|---|---|
| `POST https://www.watchoutinvestors.com/api/login` | Authenticate → JWT |
| `POST https://www.watchoutinvestors.com/api/json` | Encrypted search → encrypted records |

## 2.2 Step 1 — Login

Request body (plain JSON):
```json
{ "Userid": "<SECRET_USERID>", "Password": "<SECRET_PASSWORD>" }
```
Response (`200`):
```json
{ "token": "<JWT>" }          // header also carries: token-expire-in: 60  (minutes)
```

> ⚠️ **The JWT field is lowercase `token`** (not `Token` as some docs show). Accept both.
> Cache the JWT (~55 min) and refresh on expiry or on a `PRIME_Code: A320`. Login is throttled
> (~1/min) — do **not** re-login per request.

## 2.3 Encryption (used for the search body and response)

- Algorithm: **AES-256-CBC**, **PKCS5Padding** (= PKCS7 for a 16-byte block), **fixed IV = 16
  zero bytes**.
- Key: the AES key is **secret, 32 bytes** once decoded. Confirm its encoding (`utf8` 32-char /
  `hex` 64-char / `base64`).
- Output/transport: **base64**.

Node implementation (`watchout/crypto.js`):
```js
import crypto from "node:crypto";
const IV = Buffer.alloc(16, 0);
const key = Buffer.from(process.env.WATCHOUT_AES_KEY, process.env.WATCHOUT_AES_KEY_ENCODING || "utf8"); // 32 bytes
export const encrypt = (plain) => {
  const c = crypto.createCipheriv("aes-256-cbc", key, IV);
  return Buffer.concat([c.update(String(plain), "utf8"), c.final()]).toString("base64");
};
export const decrypt = (b64) => {
  const d = crypto.createDecipheriv("aes-256-cbc", key, IV);
  return Buffer.concat([d.update(Buffer.from(b64, "base64")), d.final()]).toString("utf8");
};
```

## 2.4 Step 2 — Search (`POST /api/json`)

Headers:
```
Authorization: Bearer <JWT>
Content-Type:  application/json
```

Body — **`Userid` is PLAIN TEXT; every other field is AES-encrypted (base64)**:
```jsonc
{
  "Userid":         "<plain-text userid>",
  "Defaulter_Name": "<enc>",   // name search (entity/person)
  "Defaulter_Type": "<enc>",   // "C" entity | "P" person
  "Search_Type":    "<enc>",   // "E" exact | "R" regular | "L" like
  "PAN_CIN_DIN":    "<enc>"    // PAN/CIN/DIN — if sent, it WINS over name
}
```

**Field constraints:** `Userid` 26–32 · `Defaulter_Name` 6–100 · `Defaulter_Type` 1 ·
`Search_Type` 1 · `PAN_CIN_DIN` 8–50. Send **either** a name **or** a PAN/CIN/DIN.

**Search types (Annexure I):**
- **E (Exact):** the complete string matched **anywhere as a substring** across defaulter names →
  broad (common tokens overflow the 250 cap).
- **R (Regular):** **whole-string only** — the defaulter name must equal the input.
- **L (Like):** Exact + also the first and last word of the input searched separately.
- Names are **standardized** before matching: e.g. `LIMITED→LTD.`, `PRIVATE→PVT.`, `COMPANY→CO.`,
  `AND→&`, `KUMAR→KR.`, punctuation→space.

## 2.5 Response — `PRIME_Code` header

`200 OK` always; the **`PRIME_Code` response header** carries the result:

| Code | Meaning |
|---|---|
| `A100` | Success |
| `A200` | No record found |
| `A210` | Minimum parameter length not provided |
| `A310` | No parameter string provided |
| `A320` | Unauthorized (re-auth / refresh JWT) |
| `A340` | Timeout |
| `A400 / E001 / E002` | Error |
| `A500` | Result exceeded 250 records — **refine search (no body returned)** |
| `A520 / A540 / A530` | Call limit exceeded (peak / non-peak / monthly) |

> Read the header case-insensitively (`PRIME_Code` / `PRIME_CODE` / `prime_code`).
> The **response body is encrypted** — decrypt with the same AES key to get a JSON array.

## 2.6 Decrypted record fields

```
Record_ID, Regulator_Competent_Authority_Name, Order_Date,
Defaulter_Code, Defaulter_Name, Defaulter_Type_Company_Person (C/P),
Defaulter_New_Name1..4, Defaulter_Old_Name1..4, Defaulter_Merged_With,
PAN_CIN_DIN,                              // note: stored PREFIXED, e.g. "PAN:AAACU0589R"
Not_Defaulter_Infact_Associated_Entity,  // "linked to a defaulter, not itself one"
Defaulter_Other_Details,                 // role: Remisier/Agent/Sub-Broker/Member of
Alongwith, Associated_Entity_Person,
Regulatory_Charges, Regulatory_Actions,  // ₹ amounts live in this free text
Regulatory_Action_Source1..3,
Further_Development1..22 (+ _Source1..22) // dated case-history trail
```

## 2.7 Rate / volume limits

- **6 calls / minute** (hard).
- **350** calls peak (09:00–20:00) · up to **1300** off-peak (20:00–09:00).
- **50,000** calls / month.
- **≤ 250 records** per result (else `A500`).

## 2.8 ✅ Working example (verified — returned 6 real records)

Entity search for **Unimark Remedies** by **name** (`Defaulter_Type=C`, `Search_Type=E`):

```js
// 1) login → jwt   2) build encrypted body   3) POST /api/json   4) decrypt body
const body = {
  Userid: USERID,                       // plain text
  Defaulter_Name: encrypt("UNIMARK REMEDIES"),
  Defaulter_Type: encrypt("C"),
  Search_Type:    encrypt("E"),
  // PAN_CIN_DIN omitted — searching by name
};
const res  = await fetch("https://www.watchoutinvestors.com/api/json", {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const code = res.headers.get("PRIME_Code");          // → "A100"
const records = JSON.parse(decrypt(await res.text())); // → 6 records
```

**Returned `PRIME_Code: A100`, 6 records.** One decrypted record:
```json
{
  "Record_ID": "BNKR267329",
  "Regulator_Competent_Authority_Name": "BANKS",
  "Order_Date": "31-Oct-2022",
  "Defaulter_Name": "UNIMARK REMEDIES LTD.",
  "Defaulter_Type_Company_Person": "C",
  "Regulatory_Charges": "WILFUL DEFAULTER",
  "Regulatory_Actions": "SUIT FILED- RS.48,21,31,894; BANK OF MAHARASHTRA (ORDER DATED:31-OCT-2022)",
  "Regulatory_Action_Source1": "http://www.watchoutinvestors.com/Press_Rel-T/bank/EQUIFAX_OCT-2022.pdf",
  "Further_Development1": "NOT APPEARING IN THE LIST FOR THE MONTH ENDED 30-NOV-2022"
}
```
Other records for the same entity included an **NCLT IBC admission of ₹1,49,20,71,505**, a
**SEBI compulsory delisting (BSE)**, an **EPFO default**, and an **NSDL ISIN freeze**.

> 💡 **Financial figures** are embedded in `Regulatory_Actions` free text (e.g. `RS.48,21,31,894`).
> Parse with `/(?:rs\.?|inr|₹)\s*([\d][\d,]*(?:\.\d+)?)/gi` and strip commas (see
> `watchout/normalize.js → extractAmounts`).

---

# Part 3 — Hard-won behaviours (read before integrating)

1. **Watchout matches by NAME, not bare ID.** IDs are stored **prefixed** (`PAN:AAACU0589R`), so a
   bare `CIN`/`DIN` in `PAN_CIN_DIN` usually returns `A200`. Search by **name** (`Defaulter_Type`
   C/P), key results back to your DIN/CIN in app code.
2. **`A500` returns no body and there is no pagination.** A query matching >250 records gives you
   *nothing* — you must narrow it (more specific name, or `R` whole-string). Plan around this for
   mega-defaulters.
3. **Login is lowercase `token`** and **throttled** (~1/min) — cache the JWT, one login per session.
4. **Same query can return records once, then empty on rapid repeat** — likely metering/throttle.
   **Cache every successful result** by subject and never re-query (see `watchout/handlers.js`).
5. **Enforce 6/min in one long-lived process** — separate short-lived processes each reset the
   limiter and trip the server-side throttle.
6. **Always set request timeouts** (we use 8s Watchout / 30s Probe42). An unreachable host (e.g.
   IP not whitelisted / VPN) otherwise hangs the whole flow.
7. **Watchout requires IP whitelisting** — if every TCP connection times out, the egress IP isn't
   whitelisted (check VPN). DNS resolving but connect timing out = firewall/whitelist.

---

# Part 4 — End-to-end flow (this app)

```
POST /api/legal-dd { identifier, idType, useWatchout, useFixtures }
  → Probe42 comprehensive-details (entity + directors)        [Probe42]
  → if useWatchout:
       entity search by legal name        (Defaulter_Type=C)  [Watchout]
       per ACTIVE director search by name  (Defaulter_Type=P)  [Watchout, ≤6/min, cached]
  → merge + parse ₹ amounts + attach provenance/GAP chips
  → { header, submodule1, submodule2, watchout, gapSummary, raw }
```

Reference implementation: `probe42/` (client/normalize/handlers), `watchout/`
(crypto/ratelimit/client/normalize/handlers), `legal-dd/orchestrator.js`.

---

# Part 5 — Environment variables

```bash
# Probe42
PROBE42_API_KEY=
PROBE42_ENV=sandbox            # sandbox | production
PROBE42_API_VERSION=1.3
PROBE42_TIMEOUT_MS=30000

# Watchout Investors (PRIME)
WATCHOUT_USERID=
WATCHOUT_PASSWORD=
WATCHOUT_AES_KEY=             # 32 bytes once decoded
WATCHOUT_AES_KEY_ENCODING=utf8   # utf8 | hex | base64
WATCHOUT_ENV=test            # test | production
WATCHOUT_TIMEOUT_MS=8000
```

All values are **secret** — load from `.env` (gitignored), never commit, never expose to the browser.
