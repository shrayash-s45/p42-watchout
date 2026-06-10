// watchout/normalize.js
// Decrypted Watchout record(s) → a flat, predictable shape for Submodule 2
// (and Submodule 1's optional regulatory side-lane). The raw record carries
// ~80 columns (Further_Development1..22 + _Source1..22, New/Old names 1..4,
// etc.); we collapse the repeated groups into arrays and keep the raw on _raw.

const str = (v) => (v == null ? "" : String(v).trim());

// Collect Field1..FieldN (1-indexed) into a clean array, dropping blanks.
function collectIndexed(rec, base, max) {
  const out = [];
  for (let i = 1; i <= max; i++) {
    const v = str(rec[`${base}${i}`]);
    if (v) out.push(v);
  }
  return out;
}

// Pair Further_DevelopmentN with Further_Development_SourceN into a trail.
function collectDevelopments(rec, max = 22) {
  const out = [];
  for (let i = 1; i <= max; i++) {
    const text = str(rec[`Further_Development${i}`]);
    const source = str(rec[`Further_Development_Source${i}`]);
    if (text || source) out.push({ text, source });
  }
  return out;
}

// Extract monetary amounts (₹) embedded in free-text action/charge fields, e.g.
// "SUIT FILED- RS.48,21,31,894" or "APPLICATION ADMITTED- RS.1,49,20,71,505".
// Returns rupee numbers; the caller can take the max as the material exposure.
export function extractAmounts(text = "") {
  const out = [];
  const rx = /(?:rs\.?|inr|₹)\s*([\d][\d,]*(?:\.\d+)?)/gi;
  let m;
  while ((m = rx.exec(String(text)))) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

const toCr = (rupees) =>
  rupees == null ? null : Math.round((rupees / 1e7) * 100) / 100;

export function normalizeRecord(rec = {}) {
  const amounts = extractAmounts(
    `${str(rec.Regulatory_Actions)} ${str(rec.Regulatory_Charges)}`
  );
  const amount = amounts.length ? Math.max(...amounts) : null;
  return {
    recordId: str(rec.Record_ID),
    amount, // largest ₹ figure found in the action/charge text (rupees)
    amountCr: toCr(amount), // same, in ₹ Cr for display
    amounts, // all figures found
    regulator: str(rec.Regulator_Competent_Authority_Name),
    orderDate: str(rec.Order_Date),
    defaulterCode: str(rec.Defaulter_Code),
    defaulterName: str(rec.Defaulter_Name),
    defaulterType: str(rec.Defaulter_Type_Company_Person), // "C" | "P"
    panCinDin: str(rec.PAN_CIN_DIN),

    newNames: collectIndexed(rec, "Defaulter_New_Name", 4),
    oldNames: collectIndexed(rec, "Defaulter_Old_Name", 4),
    mergedWith: str(rec.Defaulter_Merged_With),

    // "linked to a defaulter, not itself one" — important not to over-flag.
    associatedNotDefaulter: str(rec.Not_Defaulter_Infact_Associated_Entity),
    role: str(rec.Defaulter_Other_Details), // Remisier/Agent/Sub-Broker/Member of...
    alongwith: str(rec.Alongwith),
    associatedEntityPerson: str(rec.Associated_Entity_Person),

    charges: str(rec.Regulatory_Charges),
    actions: str(rec.Regulatory_Actions),
    actionSources: collectIndexed(rec, "Regulatory_Action_Source", 3),

    developments: collectDevelopments(rec, 22),

    _raw: rec,
  };
}

export function normalizeRecords(records = []) {
  return (Array.isArray(records) ? records : []).map(normalizeRecord);
}

// Light classification used by Submodule 2 KPI counters. Watchout is a
// regulatory/economic-default registry, so "criminal" here = economic-offence
// agency actions only (general criminal stays a GAP per §4 of the context).
export function classifyRecord(n) {
  const blob = `${n.regulator} ${n.charges} ${n.actions} ${n.role}`.toLowerCase();
  const isAssociatedOnly = !!n.associatedNotDefaulter;
  const isDefaulter =
    /wilful|willful|defaulter|fraud|npa|suit\s*filed/.test(blob) && !isAssociatedOnly;
  const isEconomicOffence =
    /\bcbi\b|\bed\b|enforcement directorate|serious fraud|\bsfio\b|economic offence|\bpmla\b|\bfera\b|\bfema\b|money laundering/.test(
      blob
    );
  const hasRegulatoryAction = !isAssociatedOnly && (!!n.actions || !!n.regulator);
  return { isAssociatedOnly, isDefaulter, isEconomicOffence, hasRegulatoryAction };
}
