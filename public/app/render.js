// public/app/render.js
// Renders the assembled legal-DD report into the tester UI: masthead, legend,
// tabs (Header · Submodule 1 · Submodule 2 · Gap Summary · All data), with a
// provenance chip on every value and a GAP chip on every unfillable cell.

import { esc, chip, valueCell, gapCell, badge, crVal } from "./legalAdapter.js";

export function renderReport(data) {
  if (data.ok === false && data.code === "NOT_PROBED") {
    return `<div class="error"><h3>Entity not probed yet</h3><p>${esc(data.message || "")}</p>
      <pre class="raw">${esc(JSON.stringify(data.update || {}, null, 2))}</pre></div>`;
  }
  if (data.ok === false) {
    return `<div class="error"><h3>Error</h3><p>${esc(data.error || "Unknown error")}</p></div>`;
  }

  const wCount =
    (data.watchout?.entity?.count || 0) +
    (data.watchout?.directors || []).reduce((s, d) => s + (d.count || 0), 0);
  const tabs = [
    { id: "header", label: "Header" },
    { id: "s1", label: "Submodule 1 — Litigation Register" },
    { id: "s2", label: "Submodule 2 — Director Legal & Regulatory" },
    { id: "watchout", label: `Watchout API${wCount ? ` (${wCount})` : ""}` },
    { id: "gaps", label: "Gap Summary" },
    { id: "raw", label: "All data" },
  ];

  return `
    ${masthead(data)}
    ${legend()}
    <div class="tabs">
      ${tabs.map((t, i) => `<div class="tab${i === 1 ? " active" : ""}" data-tab="${t.id}">${esc(t.label)}</div>`).join("")}
    </div>
    <div class="panel" id="tab-header">${headerPanel(data)}</div>
    <div class="panel active" id="tab-s1">${submodule1(data.submodule1)}</div>
    <div class="panel" id="tab-s2">${submodule2(data.submodule2)}</div>
    <div class="panel" id="tab-watchout">${watchoutPanel(data.watchout)}</div>
    <div class="panel" id="tab-gaps">${gapSummary(data.gapSummary, data.submodule2)}</div>
    <div class="panel" id="tab-raw">${rawPanel(data)}</div>
  `;
}

function masthead(d) {
  const h = d.header || {};
  const wpill = d.watchoutAvailable
    ? `<span class="badge b-ok">Watchout ON</span>`
    : `<span class="badge b-info">Watchout OFF — degraded</span>`;
  return `<div class="mast">
    <div>
      <h1>Legal, Compliance &amp; Litigation Module</h1>
      <div class="sub"><b>${esc(h.legalName)}</b> · CIN <span class="mono">${esc(h.cin)}</span> · PAN <span class="mono">${esc(h.pan)}</span> · ${esc(h.status)}${h.complianceStatus ? ", " + esc(h.complianceStatus) : ""} ${chip("P42")}</div>
      <div class="sub" style="margin-top:6px">${esc(h.industry)} · Incorporated ${esc(h.incorporationDate)} · Paid-up ${crVal(h.paidUpCapitalCr)} · Last AGM ${esc(h.lastAgmDate)} ${chip("P42")}</div>
    </div>
    <div class="meta">
      <div><b>Mode:</b> ${esc(d.meta?.mode || "")}</div>
      <div><b>Scope:</b> Submodule 1 + 2 only</div>
      <div>${wpill}</div>
    </div>
  </div>`;
}

function legend() {
  const items = [
    ["P42", "Probe42 comprehensive-details (primary)."],
    ["WATCHOUT", "Watchout Investors per-DIN / per-entity regulatory feed."],
    ["MCA", "MCA portal lookup (corroboration / strike-off particulars)."],
    ["JUDG", "Engineering-tunable value (severity, threshold, window, risk)."],
    ["GAP", "Cannot be filled with current sources — closing source named."],
  ];
  return `<div class="legend"><h3>Source &amp; provenance key</h3><div class="row">
    ${items.map(([n, desc]) => `<div class="item">${chip(n)}<span class="desc">${esc(desc)}</span></div>`).join("")}
  </div></div>`;
}

function headerPanel(d) {
  const h = d.header || {};
  const rows = [
    ["Legal name", h.legalName], ["CIN", h.cin], ["PAN", h.pan],
    ["Status", h.status], ["Compliance", h.complianceStatus],
    ["Classification", h.classification], ["Industry", h.industry],
    ["Incorporated", h.incorporationDate], ["Paid-up capital", crVal(h.paidUpCapitalCr)],
    ["Last AGM", h.lastAgmDate], ["CIRP status", h.cirpStatus ?? "—"],
  ];
  return `<div class="block"><div class="bhead"><h3>General company header</h3><div class="right">${chip("P42")}</div></div>
    <table><tbody>${rows.map(([k, v]) => `<tr><th style="width:200px">${esc(k)}</th><td>${esc(v ?? "—")}</td></tr>`).join("")}</tbody></table></div>`;
}

// ── KPI band ──
function kpiBand(kpis) {
  return `<div class="kpi-band">${kpis.map(kpiCard).join("")}</div>`;
}
function kpiCard(k) {
  const tone = k.tone ? ` ${k.tone}` : "";
  const val = k.gap ? `?` : (k.value == null ? "?" : k.value);
  const prov = k.gap
    ? `${chip("GAP")} <span class="note" style="display:inline">${esc(k.closes || "")}</span>`
    : `${chip(k.chip || "P42")}${k.note ? ` <span class="note" style="display:inline">${esc(k.note)}</span>` : ""}`;
  return `<div class="kpi${tone}"><div class="label">${esc(k.label)}</div>
    <div class="value">${esc(val)}</div><div class="prov">${prov}</div></div>`;
}

function callouts(findings) {
  return (findings || []).map((f) =>
    `<div class="callout ${f.tone}"><div class="lbl">${esc(f.label)}</div>
      <div class="body">${esc(f.text)} ${(f.chips || []).map((c) => chip(c)).join(" ")}</div></div>`
  ).join("");
}

// ── Submodule 1 ──
function submodule1(s1) {
  if (!s1) return `<div class="empty">No Submodule 1 data.</div>`;
  return `
    ${kpiBand(s1.kpis)}
    ${callouts(s1.findings)}
    ${litBlock("Block 1A — Pending Cases Filed Against", s1.blocks["1A"], colsAgainst(true))}
    ${litBlock("Block 1B — Pending Cases Filed By", s1.blocks["1B"], colsBy(true))}
    ${litBlock("Block 1C — Disposed Cases Filed Against", s1.blocks["1C"], colsAgainst(false))}
    ${litBlock("Block 1D — Disposed Cases Filed By", s1.blocks["1D"], colsBy(false))}
    ${litBlock("Block 1E — Cases for Consolidation of Corporate Affairs", s1.blocks["1E"], [])}
    ${probableBlock("Block 1F — Probable & Unverified Records", s1.blocks["1F"])}
    ${trendBlock("Block 1G — Litigation Trend", s1.blocks["1G"])}
    ${watchoutFinancialBlock(s1)}
    ${distressBlock(s1.distress)}
    ${gapList("Gaps in this submodule", s1.gaps)}
  `;
}

// Regulatory & financial defaults from Watchout (entity-level), with ₹ amounts.
function watchoutFinancialBlock(s1) {
  const rows = s1.watchoutSideLane || [];
  const title = "Regulatory & Financial Defaults (Watchout)";
  if (!rows.length) {
    return section(title, "WATCHOUT", "Watchout entity search",
      `<div class="empty">No Watchout regulatory records (or Watchout is off). Toggle “Use Watchout” and reload.</div>`);
  }
  const totalCr = s1.watchoutExposureCr || 0;
  const body = `<table>
    <thead><tr><th>Date</th><th>Regulator</th><th>Charge</th><th>Action</th><th>Amount</th><th>Source</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${esc(r.orderDate || "—")}</td>
      <td><b>${esc(r.regulator || "—")}</b></td>
      <td>${esc(r.charges || "—")}</td>
      <td>${esc(r.actions || "—")}${(r.developments || []).length ? `<div class="note">↳ ${esc(r.developments[0].text)}</div>` : ""}</td>
      <td>${r.amountCr != null ? `<b>₹${r.amountCr} Cr</b>` : "—"}</td>
      <td>${(r.sources || []).map((u, i) => `<a href="${esc(u)}" target="_blank">PDF${i + 1}</a>`).join(" ") || "—"}</td>
    </tr>`).join("")}</tbody>
  </table>
  <div class="ftn">Total flagged financial exposure (sum of parsed amounts): <b>₹${totalCr.toFixed(2)} Cr</b> ${chip("WATCHOUT")} <span class="note" style="display:inline">— amounts parsed from the action text; verify against source PDFs.</span></div>`;
  return section(title, `${rows.length} record(s)`, "Watchout entity search (regulatory/defaulter registry)", body);
}

function colsAgainst(pending) {
  return [
    ["Case No.", "caseNumber", "mono"],
    ["Category", "category"],
    ["Court", "court"],
    ["Petitioner", "petitioner"],
    ["Initiator", "initiatorType"],
    [pending ? "Last Hearing" : "Judgement", pending ? "lastHearing" : "judgementDate"],
    ...(pending ? [["Days Since", "daysSince"], ["Severity", "_severity"]] : []),
  ];
}
function colsBy(pending) {
  return [
    ["Case No.", "caseNumber", "mono"],
    ["Category", "category"],
    ["Court", "court"],
    ["Respondent", "respondent"],
    ["Resp. Type", "respondentType"],
    [pending ? "Last Hearing" : "Judgement", pending ? "lastHearing" : "judgementDate"],
    ...(pending ? [["Days Since", "daysSince"]] : []),
  ];
}

function litBlock(title, blk, cols) {
  if (!blk) return "";
  const rows = blk.rows || [];
  const body = rows.length
    ? `<table><thead><tr>${cols.map((c) => `<th>${esc(c[0])}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${cols.map((c) => td(r, c)).join("")}</tr>`).join("")}</tbody></table>`
    : `<div class="empty">${esc(blk.empty || "No rows.")}</div>`;
  return section(title, rows.length, blk.source, body);
}

function td(row, col) {
  const [, key, cls] = col;
  if (key === "_severity") {
    const s = row.severity;
    return `<td>${s ? badge(s.tone, s.tag, s.reason) + " " + chip(s.chip, s.reason) : "—"}</td>`;
  }
  const v = row[key];
  return `<td class="${cls || ""}">${esc(v == null || v === "" ? "—" : v)}</td>`;
}

function probableBlock(title, blk) {
  if (!blk) return "";
  const rows = blk.rows || [];
  const body = rows.length
    ? `<table><thead><tr><th>Case No.</th><th>Type</th><th>Court</th><th>Parties</th><th>Date</th><th>Confidence</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td class="mono">${esc(r.caseNumber)}</td><td>${esc(r.type)}</td><td>${esc(r.court)}</td><td>${esc(r.parties)}</td><td>${esc(r.date || "—")}</td><td>${badge("soft", r.confidence)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">${esc(blk.empty)}</div>`;
  return section(title, rows.length, blk.source, body);
}

function trendBlock(title, blk) {
  if (!blk) return "";
  const series = blk.series || [];
  const bars = series.length
    ? series.map((p) => `FY${String(p.year).slice(2)}  AGAINST ${"▰".repeat(p.against) || "·"} (${p.against})  ·  BY ${"▱".repeat(p.by) || "·"} (${p.by})`).join("<br>")
    : "No parseable filing years.";
  return section(title, blk.chip ? "JUDG" : "", blk.source,
    `<div class="trend"><span class="bar">${bars}</span><div class="note" style="margin-top:10px">${esc(blk.note || "")}</div></div>`);
}

function distressBlock(d) {
  if (!d) return "";
  const rows = [
    ["CIRP / IBC status", d.cirpStatus ?? "—"],
    ["BIFR history", d.bifr], ["CDR history", d.cdr],
    ["Struck-off u/s 248", d.struckOff248], ["Defaulter list", d.defaulterList],
    ["MSME payment delays", d.msmeDelays], ["Open charges", d.openCharges],
  ];
  return section("Distress signals (cross-export)", "", "P42 cirp/bifr/cdr/struckoff248/defaulter/msme",
    `<table><tbody>${rows.map(([k, v]) => `<tr><th style="width:240px">${esc(k)}</th><td>${esc(v)} ${chip("P42")}</td></tr>`).join("")}</tbody></table>`);
}

// ── Submodule 2 ──
function submodule2(s2) {
  if (!s2) return `<div class="empty">No Submodule 2 data.</div>`;
  return `
    ${kpiBand(s2.kpis)}
    ${callouts(s2.findings)}
    ${matrix2A(s2.matrix)}
    ${drawers2B(s2.drawers)}
    ${strikeOff2C(s2.strikeOff)}
    ${resigned2D(s2.recentlyResigned, s2.historicTrail, s2.tuning)}
    ${gapList("Gaps in this submodule", s2.gaps)}
  `;
}

function matrix2A(matrix) {
  const cols = ["Name", "DIN", "Designation", "Appt.", "DIN Status", "DIR-3 KYC", "Reg Actions", "Criminal", "Strike-off Assoc.", "Defaulter Hits", "Risk"];
  const body = (matrix || []).length
    ? `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
      ${matrix.map((m) => `<tr class="click" data-din="${esc(m.din)}">
        <td><b>${esc(m.name)}</b></td>
        <td class="mono">${esc(m.din)}</td>
        <td>${esc(m.designation)}</td>
        <td>${esc(m.apptDate)}</td>
        <td>${badge(m.dinStatus.tone, m.dinStatus.label, m.dinStatus.title)} ${chip(m.dinStatus.chip, m.dinStatus.title)}</td>
        <td>${badge(m.dir3Kyc.tone, m.dir3Kyc.label)} ${chip(m.dir3Kyc.chip)}</td>
        <td>${valueCell(m.regActions)}</td>
        <td>${valueCell(m.criminal)}</td>
        <td>${m.strikeOffAssoc.value} ${chip("P42")}</td>
        <td>${valueCell(m.defaulter)}</td>
        <td>${badge(m.risk.tone, m.risk.label, m.risk.reason)} ${chip(m.risk.chip, m.risk.reason)}</td>
      </tr>`).join("")}</tbody></table>`
    : `<div class="empty">No active directors.</div>`;
  return section("Block 2A — Director Risk Matrix", (matrix || []).length + " active", "P42 directors + Watchout per-DIN", body);
}

function drawers2B(drawers) {
  if (!drawers || !drawers.length) return "";
  const inner = drawers.map((dr) => `
    <div class="drawer" id="drawer-${esc(dr.din)}">
      <h4>${esc(dr.name)} — DIN ${esc(dr.din)} ${chip("P42")}</h4>
      <div class="note"><b>Identity:</b> ${esc(dr.identity.designation)} · Appt ${esc(dr.identity.apptDate)} · DIN status: ${esc(dr.identity.dinStatus)} ${chip("P42")}</div>
      <div class="note"><b>Association history:</b> ${chip("P42")}</div>
      <ul>${(dr.associationHistory.rows || []).map((h) => `<li>${esc(h.designationAfterEvent || "—")} · ${esc(h.eventDate || "—")}</li>`).join("") || "<li>—</li>"}</ul>
      <div class="note"><b>Other directorships:</b> ${chip("P42")}</div>
      <ul>${(dr.otherDirectorships.rows || []).map((e) => `<li>${esc(e.legalName)} <span class="mono">(${esc(e.cin)})</span>${e.isStruckOff ? " " + badge("amber", "Strike Off") : ""}${e.isRelatedParty ? " " + badge("info", "Related Party") : ""} · Appt ${esc(e.dateOfAppointment || "—")}</li>`).join("") || "<li>—</li>"}</ul>
      <div class="note"><b>Regulatory actions:</b> ${drawerWatchout(dr.regulatoryActions)}</div>
      <div class="note"><b>Criminal (personal capacity):</b> ${drawerWatchout(dr.criminal)} ${dr.criminal.also ? gapCell(dr.criminal.also, "") : ""}</div>
      <div class="note"><b>Defaulter hits:</b> ${drawerWatchout(dr.defaulter)} ${dr.defaulter.also ? gapCell(dr.defaulter.also, "") : ""}</div>
    </div>`).join("");
  return section("Block 2B — Per-Director Detail Drawers", drawers.length, "click a row in 2A to jump",
    `<div style="padding:14px">${inner}</div>`);
}

function drawerWatchout(cell) {
  if (!cell) return "—";
  if (cell.gap) return gapCell(cell, "");
  const rows = cell.rows || [];
  if (!rows.length) return `None on record ${chip("WATCHOUT")}`;
  return chip("WATCHOUT") + "<ul>" + rows.map((r) =>
    `<li><b>${esc(r.regulator || r.defaulterName || "—")}</b> · ${esc(r.orderDate || "")} · ${esc(r.charges || r.actions || "")}${(r.developments || []).length ? ` · ${r.developments.length} development(s)` : ""}</li>`
  ).join("") + "</ul>";
}

function strikeOff2C(rows) {
  const body = (rows || []).length
    ? `<table><thead><tr><th>Director</th><th>Entity</th><th>CIN</th><th>Strike-off Date</th><th>Section</th><th>Assoc. From</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(r.director)}</td><td>${esc(r.entityName)}</td><td class="mono">${esc(r.entityCin)}</td><td>${gapCell(r.strikeOffDate, "?")}</td><td>${gapCell(r.sectionInvoked, "?")}</td><td>${esc(r.associationFrom || "—")} ${chip("P42")}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">No prior strike-off entity associations.</div>`;
  return section("Block 2C — Prior Strike-off Entity Associations", (rows || []).length, "P42 director_network (Strike Off) + MCA gaps", body);
}

function resigned2D(recent, trail, tuning) {
  const win = tuning?.resignedLookbackYears || 3;
  let body;
  if ((recent || []).length) {
    body = `<table><thead><tr><th>Name</th><th>DIN</th><th>Designation</th><th>Cessation</th></tr></thead>
      <tbody>${recent.map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${esc(r.din)}</td><td>${esc(r.designation)}</td><td>${esc(r.cessationDate)} ${chip("P42")}</td></tr>`).join("")}</tbody></table>`;
  } else {
    body = `<div class="empty">No directors ceased within the last ${win} years.${(trail || []).length ? `<br><br>Historic (outside window): ${trail.map((t) => `<b>${esc(t.name)}</b> · ceased ${esc(t.cessationDate)} · ${esc(t.dinStatus)}`).join(" · ")}` : ""}</div>`;
  }
  return section("Block 2D — Recently Resigned Directors", `${win}y window`, "P42 date_of_cessation + JUDG window", body);
}

// ── Gap summary ──
function gapSummary(gs, s2) {
  if (!gs) return "";
  const cardFor = (title, sub) => `<div class="gap-card"><h3>${esc(title)} — ${sub.count} gap(s)</h3>
    <ul>${sub.gaps.map((g) => `<li>${chip(g.badge || "GAP")} <b>${esc(g.label)}</b> — closes via ${esc(g.closes)}</li>`).join("")}</ul>
    ${sub.watchoutNote ? `<div class="note">${esc(sub.watchoutNote)}</div>` : ""}</div>`;
  return cardFor("Submodule 1 — Litigation Register", gs.submodule1) + cardFor("Submodule 2 — Director Legal & Regulatory", gs.submodule2);
}

function gapList(title, gaps) {
  if (!gaps || !gaps.length) return "";
  return `<div class="gap-card"><h3>${esc(title)}</h3><ul>${gaps.map((g) => `<li>${chip(g.badge || "GAP")} <b>${esc(g.label)}</b> — closes via ${esc(g.closes)}</li>`).join("")}</ul></div>`;
}

function rawPanel(d) {
  return `<div class="note">Full raw responses (nothing hidden). Watchout usage: ${esc(JSON.stringify(d.watchoutUsage || "n/a"))}</div>
    <pre class="raw">${esc(JSON.stringify(d.raw || {}, null, 2))}</pre>`;
}

// ── Dedicated Watchout tab — shows exactly what the API returned ──
function watchoutPanel(w) {
  if (!w) return `<div class="empty">No Watchout section in response.</div>`;
  if (!w.available) {
    return `<div class="callout info"><div class="lbl">Watchout OFF</div><div class="body">Watchout was not queried for this load. Tick <b>Use Watchout</b> and reload to fetch regulatory/defaulter records.</div></div>`;
  }
  const statusBadge = (s) => {
    const map = { ok: "ok", none: "info", limited: "amber", error: "crit", off: "info" };
    return badge(map[s] || "info", s || "—");
  };
  const usage = w.usage
    ? `<div class="note">Rate usage — last minute: ${esc(w.usage.lastMinute)}, today: ${esc(w.usage.today)}, this month: ${esc(w.usage.thisMonth)} (caps: ${esc(w.usage.caps?.perMinute)}/min, ${esc(w.usage.caps?.monthly)}/mo)</div>`
    : "";
  const unreachable = w.unreachable
    ? `<div class="callout crit"><div class="lbl">Unreachable</div><div class="body">Watchout host did not respond (timeout). Check VPN / IP whitelisting.</div></div>`
    : "";

  // Entity section
  const e = w.entity || {};
  const entityBlock = section(
    "Entity search (company)",
    `${statusBadge(e.status)}${e.code ? " " + e.code : ""}${e.cached ? " · cached" : ""} · ${e.count || 0} record(s)`,
    "POST /api/json · Defaulter_Type=C · by name",
    (e.records || []).length
      ? (e.records || []).map((r, i) => watchoutRecordCard(r, i)).join("")
      : `<div class="empty">No records (${esc(e.status)}${e.code ? " / " + esc(e.code) : ""}).</div>`
  );

  // Directors section
  const dirs = w.directors || [];
  const dirBlocks = dirs.length
    ? dirs.map((d) =>
        section(
          `Director: ${esc(d.name || "—")} (DIN ${esc(d.din || "—")})`,
          `${statusBadge(d.status)}${d.code ? " " + d.code : ""}${d.cached ? " · cached" : ""} · ${d.count || 0} record(s)`,
          "POST /api/json · Defaulter_Type=P · by name",
          (d.records || []).length
            ? (d.records || []).map((r, i) => watchoutRecordCard(r, i)).join("")
            : `<div class="empty">No records (${esc(d.status)}${d.code ? " / " + esc(d.code) : ""}).</div>`
        )
      ).join("")
    : `<div class="note">No active directors were searched.</div>`;

  return `
    <div class="note">This tab shows the raw output of every Watchout API call made for this load — so you can see if it's working and exactly what it returned.</div>
    ${usage}
    ${unreachable}
    <h2 class="section">Entity</h2>
    ${entityBlock}
    <h2 class="section">Directors (active)</h2>
    ${dirBlocks}
  `;
}

// One Watchout record with ALL non-empty fields shown.
function watchoutRecordCard(r, i) {
  const fields = [
    ["Record ID", r.recordId],
    ["Regulator / Authority", r.regulator],
    ["Order Date", r.orderDate],
    ["Defaulter Name", r.defaulterName],
    ["Type", r.defaulterType === "C" ? "Company" : r.defaulterType === "P" ? "Person" : r.defaulterType],
    ["PAN/CIN/DIN", r.panCinDin],
    ["Charges", r.charges],
    ["Action", r.actions],
    ["Amount (₹)", r.amount != null ? `${r.amount.toLocaleString("en-IN")}  (₹${r.amountCr} Cr)` : ""],
    ["Defaulter Code", r.defaulterCode],
    ["New name(s)", (r.newNames || []).join(", ")],
    ["Old name(s)", (r.oldNames || []).join(", ")],
    ["Merged with", r.mergedWith],
    ["Associated (not defaulter)", r.associatedNotDefaulter],
    ["Role", r.role],
    ["Alongwith", r.alongwith],
    ["Associated entity/person", r.associatedEntityPerson],
  ].filter(([, v]) => v != null && v !== "");

  const rows = fields
    .map(([k, v]) => `<tr><th style="width:200px">${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join("");

  const sources = (r.sources || r.actionSources || []).length
    ? `<div class="note"><b>Sources:</b> ${(r.sources || r.actionSources).map((u, n) => `<a href="${esc(u)}" target="_blank">PDF${n + 1}</a>`).join(" ")}</div>`
    : "";

  const devs = (r.developments || []).length
    ? `<div class="note"><b>Further developments (${r.developments.length}):</b><ul>${r.developments.map((d) => `<li>${esc(d.text)}${d.source ? ` <a href="${esc(d.source)}" target="_blank">[src]</a>` : ""}</li>`).join("")}</ul></div>`
    : "";

  return `<div class="block"><div class="bhead"><h3>Record ${i + 1} — ${esc(r.regulator || "—")} · ${esc(r.orderDate || "")}</h3><div class="right">${chip("WATCHOUT")}</div></div>
    <table><tbody>${rows}</tbody></table>${sources}${devs}</div>`;
}

function section(title, pip, source, bodyHtml) {
  const pipHtml = pip ? `<span class="pip">${esc(pip)}</span>` : "";
  return `<h2 class="section">${esc(title)} ${pipHtml}</h2>
    <div class="block"><div class="bhead"><h3>${esc(source || "")}</h3></div>${bodyHtml}</div>`;
}
