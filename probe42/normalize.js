// probe42/normalize.js
// Maps a raw Probe42 comprehensive-details response into the stable shape the
// legal-dd submodule builders consume. Every field gets a safe default so a
// sparse response never crashes a downstream builder. The full raw payload is
// preserved on `_raw` so the "All data" tab can show nothing is hidden.

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const str = (v) => (v == null ? "" : String(v));

// Probe42 returns monetary statement figures in raw rupees → ₹ Cr.
const toCr = (rupees) => {
  const n = Number(rupees);
  return Number.isFinite(n) ? n / 1e7 : null;
};

export function normalizeCompany(response) {
  const env = obj(response);
  const data = obj(env.data);
  const metadata = obj(env.metadata);
  const company = obj(data.company);

  return {
    // ── General header (Probe42) ──────────────────────────────────────────
    header: {
      legalName: str(company.legal_name || company.name || data.legal_name),
      cin: str(company.cin || data.cin),
      pan: str(company.pan || data.pan),
      status: str(company.company_status || company.status),
      complianceStatus: str(company.efiling_status || company.compliance_status),
      classification: str(company.company_class || company.classification),
      incorporationDate: str(company.date_of_incorporation || company.incorporation_date),
      paidUpCapitalCr: toCr(company.paid_up_capital ?? company.paidup_capital),
      authorizedCapitalCr: toCr(company.authorized_capital),
      lastAgmDate: str(company.last_agm_date),
      lastFiledFY: str(company.last_filed_financial_year),
      industry: str(company.industry || company.business_activity),
      cirpStatus: company.cirp_status ?? null,
    },

    // ── Submodule 1 sources (litigation + distress) ───────────────────────
    legalHistory: arr(data.legal_history).map(normalizeLegalRow),
    financialDisputes: arr(data.legal_cases_of_financial_disputes),
    defaulterList: arr(data.defaulter_list),
    bifrHistory: arr(data.bifr_history),
    cdrHistory: arr(data.cdr_history),
    struckOff248: arr(data.struckoff248_details),
    msmeDelays: arr(data.msme_supplier_payment_delays),
    openCharges: arr(data.open_charges),
    keyIndicators: obj(data.key_indicators),

    // ── Submodule 2 sources (directors) ───────────────────────────────────
    signatories: arr(data.authorized_signatories).map(normalizeSignatory),
    directorNetwork: arr(data.director_network).map(normalizeNetwork),
    relatedPartyTransactions: arr(data.related_party_transactions),

    metadata,
    _raw: response,
  };
}

function normalizeLegalRow(row = {}) {
  return {
    petitioner: str(row.petitioner),
    respondent: str(row.respondent),
    court: str(row.court),
    date: str(row.date),
    caseStatus: str(row.case_status).toLowerCase(), // "pending" | "disposed" | ...
    caseNumber: str(row.case_number),
    caseType: str(row.case_type),
    caseCategory: str(row.case_category),
    severity: str(row.severity),
    _raw: row,
  };
}

function normalizeSignatory(row = {}) {
  return {
    pan: str(row.pan),
    din: str(row.din),
    name: str(row.name),
    designation: str(row.designation),
    dinStatus: str(row.din_status), // verbatim MCA reason string
    dscStatus: row.dsc_status ?? null,
    dscExpiry: row.dsc_expiry_date ?? null,
    dateOfAppointment: str(row.date_of_appointment),
    dateOfAppointmentCurrentDesignation: str(
      row.date_of_appointment_for_current_designation
    ),
    dateOfCessation: row.date_of_cessation ?? null,
    associationHistory: arr(row.association_history).map((h = {}) => ({
      event: h.event ?? null,
      designationAfterEvent: str(h.designation_after_event),
      eventDate: str(h.event_date),
      filingDate: h.filing_date ?? null,
    })),
    _raw: row,
  };
}

function normalizeNetwork(row = {}) {
  const network = obj(row.network);
  const mapEntity = (e = {}) => ({
    cin: str(e.cin || e.llpin),
    legalName: str(e.legal_name || e.name),
    companyStatus: str(e.company_status || e.status),
    designation: str(e.designation),
    dateOfAppointment: str(e.date_of_appointment),
    dateOfCessation: str(e.date_of_cessation),
    _raw: e,
  });
  return {
    name: str(row.name),
    pan: str(row.pan),
    din: str(row.din),
    companies: arr(network.companies).map(mapEntity),
    llps: arr(network.llps).map(mapEntity),
    _raw: row,
  };
}

// For /directors/{id} responses (when starting from a DIN, not a company).
export function normalizeDirector(response) {
  const data = obj(obj(response).data);
  const d = obj(data.director);
  return {
    name: str(d.name),
    pan: str(d.pan),
    din: str(d.din),
    dateOfBirth: str(d.date_of_birth),
    age: str(d.age),
    gender: str(d.gender),
    nationality: str(d.nationality),
    dinStatus: str(d.din_status),
    dscStatus: d.dsc_status ?? null,
    address: obj(d.address),
    _raw: response,
  };
}

export { toCr };
