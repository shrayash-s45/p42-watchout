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

**Returned `200`** (~1.1 MB). The **complete verbatim response** is committed at
[`examples/probe42-company-details.json`](examples/probe42-company-details.json). Below is the
**same response annotated**, with one element per array (real values; arrays truncated with `// …`):

```jsonc
{
  "metadata": {                                  // freshness + document token
    "api_version": "1.3",
    "last_updated": "2026-06-04",                // how current Probe's data is
    "identifier_changed": false,
    "document_list_token": "6a280a8c4053c48f94061571"
  },
  "data": {
    // ── Identity / status ──
    "company": {
      "cin": "L74120MH1985PLC035308",
      "legal_name": "GODREJ PROPERTIES LIMITED",
      "pan": "AAACG3995M",
      "status": "Listed",
      "classification": "Public Limited Indian Non-Government Company",
      "efiling_status": "Active",
      "active_compliance": "ACTIVE compliant",
      "incorporation_date": "1985-02-08",
      "paid_up_capital": 1506038705,             // RAW RUPEES → ÷1e7 = ₹150.60 Cr
      "authorized_capital": 6690000000,
      "sum_of_charges": 65456500000,             // total secured borrowing (raw ₹)
      "cirp_status": null,                       // IBC/insolvency flag (Submodule 1 distress)
      "last_agm_date": "2025-08-01",
      "last_filing_date": "2025-03-31",
      "website": "https://www.godrejproperties.com/",
      "email": "secretarial@godrejproperties.com",
      "lei": { "number": "335800KM3Y5NZWXOE183", "status": "ISSUED", "next_renewal_date": "2027-04-13" },
      "registered_address": { "full_address": "Godrej One, 5th Floor, … Vikhroli (East), Mumbai - 400079", "city": "Mumbai", "state": "Maharashtra", "pincode": "400079" },
      "business_address": { "city": "Mumbai", "pincode": 400079, "state": "MAHARASHTRA" }
    },

    "description": { "desc_thousand_char": "Godrej Properties Limited (GPL) … real estate venture of the Godrej Group …" },
    "name_history": [ { "name": "GODREJ PROPERTIES & INVESTMENTS LIMITED", "date": "2008-05-14" } ],

    // ── Directors (Submodule 2) ──
    "authorized_signatories": [                   // current signatories/directors
      {
        "pan": "ALCPB9271H", "din": "09302960", "name": "INDU BHUSHAN", "designation": "Director",
        "din_status": "Approved",                // VERBATIM MCA reason → parse for disqualification / DIR-3 KYC
        "gender": "Male", "date_of_birth": "1961-01-06", "age": 65,
        "date_of_appointment": "2022-05-03",
        "date_of_appointment_for_current_designation": "2022-07-04",
        "date_of_cessation": null,               // null = active director
        "nationality": "India", "dsc_status": null, "dsc_expiry_date": null, "father_name": null,
        "address": { "address_line1": null, "city": null, "state": null, "pincode": null, "country": null },
        "association_history": [ { "event": null, "designation_after_event": "Director", "event_date": "2022-07-04", "filing_date": null } ]
      }
      // … 9 directors total
    ],

    "director_network": [                          // other directorships per director → strike-off exposure
      {
        "name": "AMITAVA MUKHERJEE", "pan": "AAEPM4024G", "din": "00003285",
        "network": {
          "companies": [
            {
              "cin": "U33125MH1995PTC090076", "legal_name": "TEXANLAB LABORATORIES PRIVATE LIMITED",
              "company_status": "ACTIVE",         // cross-check vs "Strike Off" for exposure
              "incorporation_date": "1995-06-29", "paid_up_capital": 100400800, "city": "Navi Mumbai",
              "active_compliance": "ACTIVE compliant", "cirp_status": null, "designation": "Director",
              "date_of_appointment": "2017-04-25", "date_of_cessation": "2023-07-03"
            }
            // … more companies
          ],
          "llps": []                              // same shape for LLPs
        }
      }
      // … one entry per director
    ],

    "contact_details": { "email": [ { "emailId": "secretarial@godrejproperties.com", "status": null } ], "phone": [ { "phoneNumber": "02261698500", "status": null } ] },

    // ── Charges / borrowings (distress signal) ──
    "open_charges": [ { "id": 100603359, "date": "2025-10-03", "holder_name": "CATALYST TRUSTEESHIP LIMITED", "amount": 55505000000, "type": "Modification" } ],
    "open_charges_latest_event": [ { "id": 100603359, "amount": 55505000000, "type": "Modification", "rate_of_interest": "8.60%", "number_of_chargeholder": 1, "filing_date": "2025-10-13", "joint_holding": "NO", "consortium_holding": "NO", "property_type": "Immovable property … Commercial …" } ],
    "charge_sequence": [ { "charge_id": 100603359, "status": "Modification", "date": "2025-09-19", "amount": 55505000000, "holder_name": "CATALYST TRUSTEESHIP LIMITED", "number_of_holder": 1 } ],

    // ── Financials (raw ₹; STANDALONE + CONSOLIDATED across years) ──
    "financials": [
      {
        "year": "2025-03-31", "nature": "STANDALONE", "filing_type": "XBRL", "filing_standard": "Schedule III",
        "ratios": { "revenue_growth": 46.52, "net_margin": 51.86, "ebitda_margin": -17.44, "return_on_equity": 5.8, "debt_by_equity": 0.69, "current_ratio": 1.73, "interest_coverage_ratio": 3.24, "cash_conversion_cycle": 2656.47 },
        "bs": { "assets": { "given_assets_total": 439435900000, "inventories": 153126800000, "cash_and_bank_balances": 40599800000 }, "liabilities": { "share_capital": 1505900000, "reserves_and_surplus": 172935500000, "given_liabilities_total": 439435900000 }, "subTotals": { "total_equity": 174441400000, "total_debt": 119680900000 }, "metadata": { "doc_id": "442/…/FinancialStatements-2025-03-31.pdf" } },
        "pnl": { "lineItems": { "net_revenue": 19496200000, "other_income": 22077600000, "profit_before_tax": 12648200000, "income_tax": 2538100000, "profit_after_tax": 10110100000 } },
        "cash_flow": { "cash_flows_from_used_in_operating_activities": -17578400000, "cash_flow_statement_at_end_of_period": 8204800000 },
        "auditor": { "auditor_name": "ANIRUDDHA SHREEKANT GODBOLE", "auditor_firm_name": "B S R & CO LLP", "firm_registration_number": "101248W/W100022" },
        "auditor_comments": { "report_has_adverse_remarks": false, "disclosures_auditor_report": [], "disclosures_director_report": [] }
      }
      // … more years / CONSOLIDATED
    ],
    "nbfc_financials": [],
    "financial_parameters": [ { "year": "2025", "nature": "STANDALONE", "transaction_related_parties_as_18": 14211900000, "prescribed_csr_expenditure": 143100000, "total_amount_csr_spent_for_financial_year": 143200000, "proposed_dividend": "No" } ],

    // ── Business / industry ──
    "industry_segments": [ { "industry": "Real Estate", "segments": ["Builders and Developers"] } ],
    "principal_business_activities": [ { "year": "2025", "main_activity_group_code": "L", "business_activity_description": "Real Estate activities", "percentage_of_turnover": 100 } ],

    // ── Related parties (cross-flag director other-directorships) ──
    "related_party_transactions": [ { "financial_year": "2025-03-31", "company": [ { "name": "GODREJ INDUSTRIES LIMITED", "relationship": "Holding Company", "type_of_transaction": "Expense", "amount": 265700000, "cin": "L24241MH1988PLC097781" } ], "llp": [], "individual": [], "others": [] } ],

    "establishments_registered_with_epfo": [],

    // ── Shareholding ──
    "shareholdings": [ { "shareholders": "promoter", "financial_year": "2025-03-31", "category": "equity", "body_corporate_held_percentage_of_shares": 46.36, "total_no_of_shares": 140553593, "total_percentage_of_shares": 46.67 } ],
    "shareholdings_more_than_five_percent": [ { "company": [ { "name": "GODREJ INDUSTRIES LIMITED", "shareholding_percentage": 44.77, "no_of_shares": 134849594 } ], "financial_year": "2025-03-31" } ],
    "shareholdings_summary": [ { "financial_year": "2025-03-31", "total_equity_shares": 301184878, "promoter": 24, "public": 163446, "total": 163470 } ],   // COUNTS, not percentages
    "director_shareholdings": [ { "financial_year": "2025-03-31", "din_pan": "00432983", "full_name": "PIROJSHA ADI GODREJ", "designation": "Wholetime Director", "no_of_shares": 10, "percentage_holding": 0 } ],

    // ── Distress / legal (Submodule 1) ──
    "bifr_history": [],                            // legacy "sick company"
    "cdr_history": [],                             // debt restructuring
    "defaulter_list": [],                          // bureau/regulator defaults
    "legal_history": [                             // ← THE HEART of Submodule 1 (case-level, court-keyed, native severity)
      {
        "petitioner": "KARAN GILL & ANR.", "respondent": "GODREJ PROPERTIES LTD.",
        "court": "National Consumer Disputes Redressal Commission", "date": "2018-12-18",
        "case_status": "Pending", "case_number": "IA/9637/2016",
        "case_type": "Cases Filed Against This Corporate", "case_category": "Applications",
        "severity": "low"
      }
      // … 200+ more rows
    ],

    // ── Credit ratings ──
    "credit_ratings": [ { "rating_date": "2025-10-17", "rating_agency": "icra", "rating": "AA+ (Stable/Outstanding)", "type_of_loan": "Cash Credit (Long Term Fund Based)", "currency": "INR", "amount": 86250000000, "rating_details": [ { "rating": "AA+", "action": "Outstanding", "outlook": "Stable" } ] } ],
    "credit_rating_rationale": [ { "rating_agency": "icra", "financial_year": "2025-10-17", "doc_id": "442/…/1760712697707-1760639400.pdf" } ],   // doc_id → endpoint 8 PDF
    "unaccepted_rating": null,

    // ── Group structure (OBJECTS with company[]/llp[]/others[], not flat arrays) ──
    "holding_entities":    { "financial_year": "2025", "company": [ { "cin": "L24241MH1988PLC097781", "legal_name": "GODREJ INDUSTRIES LIMITED", "share_holding_percentage": 44.77, "status": "ACTIVE" } ], "llp": [], "others": [] },
    "subsidiary_entities": { "financial_year": "2025", "company": [ { "cin": "U70200MH2018PTC317814", "legal_name": "ASHANK LAND & BUILDING PRIVATE LIMITED", "share_holding_percentage": 100, "status": "ACTIVE" } ], "llp": [ { "llpin": "AAO-0256", "legal_name": "ASHANK FACILITY MANAGEMENT LLP", "share_holding_percentage": 100, "status": "ACTIVE" } ], "others": [] },
    "associate_entities":  { "financial_year": "2025", "company": [ { "cin": "U70200MH2013PTC251378", "legal_name": "GODREJ GREEN HOMES PRIVATE LIMITED", "share_holding_percentage": 50, "status": "ACTIVE" } ], "llp": [], "others": [] },
    "joint_ventures":      { "financial_year": "2025", "company": [ { "cin": "U70200MH2013PTC251378", "legal_name": "GODREJ GREEN HOMES PRIVATE LIMITED", "share_holding_percentage": 50 } ], "llp": [ { "llpin": "AAF-6499", "legal_name": "AR LANDCRAFT LLP", "share_holding_percentage": 50 } ], "others": [] },

    "securities_allotment": [ { "allotment_type": "Cash", "allotment_date": "2026-03-09", "instrument": "Equity Shares Without Differential Rights", "total_amount_raised": 6985, "number_of_securities_allotted": 1397 } ],
    "peer_comparison": [ { "bizIndustry": "Real Estate", "bizSegment": "Builders and Developers", "refYear": "2025", "peers": [ { "cin": "U70102KA1996PTC019532", "legalName": "BAGMANE DEVELOPERS PRIVATE LIMITED", "revenue": 20257690000 } ], "benchMarks": [ { "year": "2025", "no_of_peers_in_sample": 30, "median_net_margin": 16.59 } ] } ],

    // ── Tax / compliance ──
    "gst_details": [ { "gstin": "04AAACG3995M1Z9", "status": "Active", "state": "Chandigarh", "date_of_registration": "2017-07-01", "taxpayer_type": "Regular", "filing_timeliness": "Filed on Time", "filings": [ { "return_type": "GSTR3B", "date_of_filing": "2026-05-20", "filing_due_date": "2026-05-20", "status": "Filed", "filing_timeliness": "Filed on Time" } ] } ],
    "struckoff248_details": { "struck_off_status": "As per our records, this corporate name was never removed under section 248(5) by ROC", "restored_status": null },
    "msme_supplier_payment_delays": { "trend": [ { "period": "October 2023 to March 2024", "amount": 120825551.39 } ], "delays_for_period": { "latest_period": "October 2025 to March 2026", "total_amount_due_for_period": 26253493.69, "delays": [ { "supplier_name": "AJR Electrical Infra", "supplier_pan": "AABFI9969D", "amount_due": 232 } ] } },

    // ── Financial-dispute matters (the only place Probe surfaces ₹ claim amounts) ──
    "legal_cases_of_financial_disputes": { "payable": [ { "type_of_financial_dispute": "LOAN RECOVERY", "amount_under_default": null, "verdict": "OTHERS", "court": "National Company Law Tribunal", "litigant": "GODREJ PROPERTIES LTD", "case_no": "C.P. (IB) - 4604/2019", "date_of_judgement": "2022-10-14" } ] },

    // ── Scores + headline flags ──
    "probe_financial_score": { "overall_financial_score": 3, "growth_score": 5, "profitability_score": 2, "liquidity_score": 4, "solvency_score": 3, "efficiency_score": 1 },
    "key_indicators": {
      "revenue": "More than 1000 cr.", "profit": "More than 5 cr.", "employee_count": "Upto 100",
      "pending_cases_filed_against_this_corporate": true,   // Submodule 1 headline
      "bureau_defaults": false, "gst_filing_delay": false, "epf_payment_delay": null
    },
    "filing_dates": { "aoc_4": { "financial_year": "2025-03-31", "filing_date": "2025-08-29" }, "mgt_7": { "financial_year": "2025-03-31", "filing_date": "2025-09-27" } }
  }
}
```

> **Field-note recap (DD-relevant):** `legal_history` drives Submodule 1; `authorized_signatories.din_status`
> + `director_network` drive Submodule 2; `paid_up_capital`/financials are **raw rupees** (÷1e7);
> `holding/subsidiary/associate/joint_ventures` are **objects** with `company[]/llp[]/others[]`;
> `shareholdings_summary` is **counts** not %; `credit_rating_rationale.doc_id` → fetch via endpoint 8;
> `legal_cases_of_financial_disputes` is the only section carrying ₹ claim context (often `null`).

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

## 2.9 Observed values & formats (from real responses)

- **Date format:** `DD-Mon-YYYY` (e.g. `31-Oct-2022`) — note this differs from Probe42's ISO
  `YYYY-MM-DD`. Normalize when merging.
- **`Defaulter_Code`** groups records by entity/person (Unimark's records mostly shared
  `C0334605`) — useful as a stable per-defaulter key.
- **`Regulator_Competent_Authority_Name`** is a short code/label. Real values seen in one entity's
  6 records: `BANKS`, `EPFO`, `BSE`, `NCLT`, `NSDL` (and `SEBI` for a director record) — out of
  the ~35 covered regulators/agencies. Treat as an open vocabulary, not an enum.
- **`PAN_CIN_DIN`** is often **empty** on a record and, when present, is **prefixed**
  (`PAN:AAACU0589R`). Don't rely on it for matching — search by name.
- **Action text is uppercase** and contains the financial figure + the counterparty + the order
  date, e.g. `SUIT FILED- RS.48,21,31,894; BANK OF MAHARASHTRA (ORDER DATED:31-OCT-2022)`.
- **`Regulatory_Charges`** is the category (`WILFUL DEFAULTER`, `VIOLATED SEBI (DELISTING …)
  REGULATIONS 2009`, `DEFAULTED IN MAKING PAYMENT OF DUES`, …); **`Regulatory_Actions`** is the
  consequence (suit amount, delisting, ISIN freeze, market ban, IBC admission amount).
- **`Further_Development*`** carries the post-order trail (appeals, stays, "not appearing in the
  list for month ended …", NCLAT set-asides) — important for current-status, not just history.

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
8. **Deployment: the SERVER's egress IP must be whitelisted by PRIME.** This gates *everything* on
   `watchoutinvestors.com` — both the API **and** the source PDFs (`Regulatory_Action_Source*`). If
   you move the deployment to a new host (cloud VM, serverless region, etc.), whitelist that host's
   egress IP first or both the API and the documents stop working.
9. **Source PDFs are whitelist-gated too — proxy them.** Browsers on non-whitelisted IPs can't open
   `watchoutinvestors.com` PDFs directly. Route them through the whitelisted server
   (`GET /api/watchout/doc?url=…`, host-allowlisted to prevent SSRF) so any viewer can open them.

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
