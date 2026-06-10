// fixtures/acc.raw.js
// A representative RAW Probe42 comprehensive-details payload modelled on the ACC
// mock (ACC_mock_module.html). Used ONLY in fixtures mode so the full pipeline
// (normalize → build → render) can be exercised without any API call. Not real
// Probe42 output — illustrative values for the tester.

export const ACC_RAW = {
  metadata: { source: "FIXTURE", note: "Synthetic ACC data — not a real Probe42 response." },
  data: {
    company: {
      legal_name: "ACC INDIA PRIVATE LIMITED",
      cin: "U45400DL2012PTC241533",
      pan: "AAKCA9219Q",
      company_status: "Active",
      efiling_status: "Active Compliant",
      company_class: "Private",
      date_of_incorporation: "2012-09-03",
      paid_up_capital: 14100000, // raw rupees → ₹1.41 Cr
      authorized_capital: 50000000,
      last_agm_date: "2025-09-30",
      business_activity: "Real Estate · Builders & Developers",
      cirp_status: null,
    },

    legal_history: [
      // 1A — pending AGAINST (company = respondent)
      { case_number: "C.P. (IB) – 719/2023", court: "NCLT", petitioner: "Chintamani Fabrication Pvt Ltd", respondent: "ACC INDIA PRIVATE LIMITED", date: "2024-05-08", case_status: "Pending", case_type: "Insolvency", case_category: "NCLT / IBC", severity: "High" },
      { case_number: "CS DJ/683/2021", court: "District & Sessions Judge, South-East, Saket", petitioner: "Mukesh Kumar Gautam", respondent: "ACC INDIA PRIVATE LIMITED", date: "2022-05-17", case_status: "Pending", case_type: "Civil", case_category: "Civil", severity: "" },
      { case_number: "CS/4194/2024", court: "District & Sessions Judge, New Delhi, PHC", petitioner: "Cornish Aluminium India P. Ltd.", respondent: "ACC INDIA PRIVATE LIMITED", date: "2024-10-28", case_status: "Pending", case_type: "Civil", case_category: "Civil", severity: "" },
      { case_number: "CNS/3216/2023", court: "Metropolitan Magistrate, Calcutta", petitioner: "Shree Shyam Ply & Laminates", respondent: "ACC INDIA PRIVATE LIMITED", date: "2025-07-23", case_status: "Pending", case_type: "Criminal", case_category: "NI Act / Criminal", severity: "" },
      { case_number: "ITA 650/DEL/2020", court: "ITAT", petitioner: "ACIT, Circle-1(1), New Delhi", respondent: "ACC INDIA PRIVATE LIMITED", date: "", case_status: "Pending", case_type: "Income Tax Appeals", case_category: "Income Tax Appeals", severity: "" },
      { case_number: "Commercial Summary Suit/100397/2025", court: "City Civil Court, Mumbai", petitioner: "Regalia Solutions Pvt Ltd thr Ashok Sanghavi", respondent: "ACC INDIA PRIVATE LIMITED", date: "2026-01-05", case_status: "Pending", case_type: "Commercial", case_category: "Others / Commercial", severity: "" },
      { case_number: "Misc. Case (Com)/15/2024", court: "Commercial Court, Alipore", petitioner: "Sunidhi Estates Pvt Ltd", respondent: "ACC INDIA PRIVATE LIMITED", date: "2024-08-17", case_status: "Pending", case_type: "Commercial", case_category: "Others / Commercial", severity: "" },

      // 1B — pending BY (company = petitioner)
      { case_number: "WTAX/2660/2025", court: "High Court of Allahabad", petitioner: "ACC INDIA PRIVATE LIMITED", respondent: "STATE OF U.P. AND ANOTHER", date: "2025-05-29", case_status: "Pending", case_type: "Taxation", case_category: "Taxation Matters", severity: "" },
      { case_number: "ITA 4833/DEL/2024", court: "ITAT", petitioner: "ACC INDIA PRIVATE LIMITED", respondent: "ACIT, Circle-1(1), Delhi", date: "2025-08-12", case_status: "Pending", case_type: "Income Tax Appeals", case_category: "Income Tax Appeals", severity: "" },
      { case_number: "WPA/27195/2024", court: "HC Calcutta — Appellate Side", petitioner: "ACC INDIA PRIVATE LIMITED", respondent: "Asst Comm. of State Tax, Ballygunge & Ors", date: "2024-11-29", case_status: "Pending", case_type: "Writs", case_category: "Writs and Regulatory Matters", severity: "" },
      { case_number: "MEx (Com)/11/2023", court: "Commercial Court, Alipore", petitioner: "ACC INDIA PRIVATE LIMITED", respondent: "Sunidhi Estates Pvt. Ltd.", date: "2023-11-30", case_status: "Pending", case_type: "Others", case_category: "Others", severity: "" },

      // 1C — disposed AGAINST
      { case_number: "1613(ND)2024", court: "NCLT", petitioner: "Chintamani Fabrication Pvt Ltd", respondent: "ACC INDIA PRIVATE LIMITED", date: "2024-05-08", case_status: "Disposed", case_type: "Insolvency", case_category: "NCLT / IBC", severity: "" },
      { case_number: "719(ND)2023", court: "NCLT", petitioner: "Chintamani Fabrication Pvt Ltd", respondent: "ACC INDIA PRIVATE LIMITED", date: "2024-05-08", case_status: "Disposed", case_type: "Insolvency", case_category: "NCLT / IBC", severity: "" },
      { case_number: "Cr Rev/196/2018", court: "District & Sessions Judge, Saket", petitioner: "Ashok Kumar Singh", respondent: "ACC INDIA PRIVATE LIMITED", date: "2018-06-01", case_status: "Disposed", case_type: "Criminal Appeals", case_category: "Criminal Appeals", severity: "" },
      { case_number: "SPCS/398/2014", court: "Civil Court, Surat", petitioner: "Piyushbhai Vajubhai Kapadia", respondent: "ACC INDIA PRIVATE LIMITED", date: "2016-03-10", case_status: "Disposed", case_type: "Civil", case_category: "Civil", severity: "" },
      { case_number: "SPCS/577/2016", court: "Civil Court, Surat", petitioner: "Piyushbhai Vajubhai Kapadia", respondent: "ACC INDIA PRIVATE LIMITED", date: "2017-04-15", case_status: "Disposed", case_type: "Civil", case_category: "Civil", severity: "" },
      { case_number: "SMCST/458/2016", court: "Small Cause Court, Surat", petitioner: "Piyushbhai Vajubhai Kapadia", respondent: "ACC INDIA PRIVATE LIMITED", date: "2016-12-20", case_status: "Disposed", case_type: "Criminal", case_category: "NI Act / Criminal", severity: "" },
      { case_number: "CMA SC/84/2017", court: "Civil Court, Surat", petitioner: "Piyushbhai Vajubhai Kapadia", respondent: "ACC INDIA PRIVATE LIMITED", date: "2017-06-23", case_status: "Disposed", case_type: "Others", case_category: "Others", severity: "" },

      // 1D — disposed BY
      { case_number: "ARB/193/2019", court: "District & Sessions Court, Gurgaon", petitioner: "ACC INDIA PRIVATE LIMITED", respondent: "M/S Manglam Multiplex Pvt Ltd", date: "2019-12-09", case_status: "Disposed", case_type: "Arbitration", case_category: "Arbitration", severity: "" },
      { case_number: "ARBP/72/2023", court: "HC Orissa", petitioner: "ACC INDIA PRIVATE LIMITED", respondent: "Khushi Realcon Pvt Ltd", date: "2024-07-19", case_status: "Disposed", case_type: "Arbitration", case_category: "Arbitration", severity: "" },
      { case_number: "Money Suit/53/2022", court: "Commercial Court, Alipore", petitioner: "ACC INDIA PRIVATE LIMITED", respondent: "Sunidhi Estates Pvt Ltd", date: "2023-04-21", case_status: "Disposed", case_type: "Civil", case_category: "Civil", severity: "" },
      { case_number: "WP/2329/2018", court: "HC Bombay", petitioner: "ACC INDIA PRIVATE LIMITED", respondent: "State of Maharashtra & 4 Ors", date: "2018-07-30", case_status: "Disposed", case_type: "Writs", case_category: "Writs and Regulatory", severity: "" },

      // 1F — probable / unverified (low confidence)
      { case_number: "Sum.Civ.Suit/492/2022", court: "Civil Court Sr Division, Thane", petitioner: "TNA Readymix", respondent: "ACC Indian Pvt Ltd", date: "2023-12-09", case_status: "Probable", case_type: "Civil", case_category: "Probable · Civil", severity: "Low — name variant" },
      { case_number: "CO 72/DEL/2023", court: "ITAT", petitioner: "ACC India Pvt Ltd", respondent: "ACIT Circle-1(1)", date: "", case_status: "Unverified", case_type: "ITAT", case_category: "Unverified · ITAT", severity: "Low — court portal down at scan" },
    ],

    legal_cases_of_financial_disputes: [],
    defaulter_list: [],
    bifr_history: [],
    cdr_history: [],
    struckoff248_details: [],
    msme_supplier_payment_delays: [],
    open_charges: [],
    key_indicators: {
      pending_cases_filed_against_this_corporate: true,
      bureau_defaults: false,
      gst_filing_delay: false,
      epf_payment_delay: null,
    },

    authorized_signatories: [
      {
        pan: "AXXPR1234A",
        din: "05340569",
        name: "Aniruddha Ray",
        designation: "Managing Director",
        din_status: "Approved",
        date_of_appointment: "2012-09-03",
        date_of_appointment_for_current_designation: "2013-01-15",
        date_of_cessation: null,
        dsc_status: null,
        dsc_expiry_date: null,
        association_history: [
          { event: null, designation_after_event: "Director", event_date: "2012-09-03", filing_date: null },
          { event: null, designation_after_event: "Managing Director", event_date: "2013-01-15", filing_date: null },
        ],
      },
      {
        pan: "AXXPM5678B",
        din: "03614250",
        name: "Rachid Mikati",
        designation: "Director",
        din_status: "Approved",
        date_of_appointment: "2012-09-03",
        date_of_appointment_for_current_designation: "2012-09-03",
        date_of_cessation: null,
        dsc_status: null,
        dsc_expiry_date: null,
        association_history: [
          { event: null, designation_after_event: "Director", event_date: "2012-09-03", filing_date: null },
        ],
      },
      {
        pan: "AXXPP9999C",
        din: "03623627",
        name: "William Joseph Parker",
        designation: "Director",
        din_status: "Deactivated due to non-filing of DIR-3 KYC",
        date_of_appointment: "2012-09-03",
        date_of_appointment_for_current_designation: "2012-09-03",
        date_of_cessation: "2013-11-04",
        dsc_status: null,
        dsc_expiry_date: null,
        association_history: [],
      },
    ],

    director_network: [
      {
        name: "Aniruddha Ray",
        pan: "AXXPR1234A",
        din: "05340569",
        network: {
          companies: [
            { cin: "U45200DL2013PTC251104", legal_name: "ASSURED CONSOLIDATED CONSTRUCTION PVT LTD", company_status: "Active", designation: "Director", date_of_appointment: "2013-04-25", date_of_cessation: "" },
            { cin: "U74999MH2016PTC284017", legal_name: "PRIME FACIE DESIGN PVT LTD", company_status: "Strike Off", designation: "Director", date_of_appointment: "2016-07-22", date_of_cessation: "" },
            { cin: "U45400MH2014PTC256936", legal_name: "INTERNATIONAL BUILDING AND INFRASTRUCTURE PVT LTD", company_status: "Strike Off", designation: "Director", date_of_appointment: "2014-08-06", date_of_cessation: "" },
          ],
          llps: [],
        },
      },
      {
        name: "Rachid Mikati",
        pan: "AXXPM5678B",
        din: "03614250",
        network: { companies: [], llps: [] },
      },
    ],

    related_party_transactions: [
      { financial_year: "2024-25", company: "ASSURED CONSOLIDATED CONSTRUCTION PVT LTD", llp: "", individual: "", others: "" },
    ],
  },
};

// Synthetic Watchout records keyed by DIN (raw record shape, pre-normalize).
// Aniruddha Ray has a sample SEBI order; Rachid Mikati has none — so toggling
// Watchout on/off has a visible effect in the tester.
export const ACC_WATCHOUT_RAW = {
  "05340569": [
    {
      Record_ID: "WO-2021-114857",
      Regulator_Competent_Authority_Name: "Securities and Exchange Board of India (SEBI)",
      Order_Date: "2021-08-19",
      Defaulter_Code: "D-559210",
      Defaulter_Name: "Aniruddha Ray",
      Defaulter_Type_Company_Person: "P",
      PAN_CIN_DIN: "05340569",
      Not_Defaulter_Infact_Associated_Entity: "",
      Defaulter_Other_Details: "Director / Promoter",
      Regulatory_Charges: "Non-compliance with disclosure norms; alleged fund diversion",
      Regulatory_Actions: "Restrained from accessing securities market for 1 year; monetary penalty ₹5,00,000",
      Regulatory_Action_Source1: "SEBI Order WTM/AB/2021/14857 dated 19-Aug-2021",
      Further_Development1: "Appeal filed before SAT",
      Further_Development_Source1: "SAT Appeal No. 412/2021",
      Further_Development2: "SAT granted partial stay on monetary penalty",
      Further_Development_Source2: "SAT Order dated 02-Nov-2021",
    },
  ],
  "03614250": [],
};
