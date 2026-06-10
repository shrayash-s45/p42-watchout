// public/app/main.js — controller: reads controls, calls /api/legal-dd, renders.
import { renderReport } from "./render.js";

const $ = (id) => document.getElementById(id);
const report = $("report");

// entityType for the orchestrator, kept in sync with the picker / idType.
let entityType = "company";

const TYPE_LABEL = { company: "Companies", llp: "LLPs", pnp: "Proprietors & Partnerships" };
const ID_TO_ENTITY = { CIN: "company", LLPIN: "llp", PAN: "company" };

async function loadEntities() {
  const picker = $("entityPicker");
  try {
    const data = await fetch("/api/sandbox-entities").then((r) => r.json());
    if (!data.available || !data.entities.length) {
      picker.innerHTML = `<option value="">(sandbox list not available)</option>`;
      return;
    }
    const groups = { company: [], llp: [], pnp: [] };
    for (const e of data.entities) (groups[e.type] || groups.company).push(e);
    let html = `<option value="">— pick a sandbox entity (${data.entities.length}) —</option>`;
    for (const type of ["company", "llp", "pnp"]) {
      if (!groups[type].length) continue;
      html += `<optgroup label="${TYPE_LABEL[type]} (${groups[type].length})">`;
      for (const e of groups[type]) {
        html += `<option value="${e.identifier}" data-idtype="${e.idType}" data-type="${e.type}">${e.name} — ${e.identifier}</option>`;
      }
      html += `</optgroup>`;
    }
    picker.innerHTML = html;
    // Preselect Godrej so the default load matches the input.
    picker.value = "L74120MH1985PLC035308";
    syncFromPicker();
  } catch {
    picker.innerHTML = `<option value="">(failed to load list)</option>`;
  }
}

function syncFromPicker() {
  const opt = $("entityPicker").selectedOptions[0];
  if (!opt || !opt.value) return;
  $("cin").value = opt.value;
  $("idType").value = opt.dataset.idtype || "CIN";
  entityType = opt.dataset.type === "pnp" ? "company" : opt.dataset.type || "company";
}

async function refreshMode() {
  try {
    const h = await fetch("/api/health").then((r) => r.json());
    const pill = $("modePill");
    pill.textContent = h.mode === "fixtures" ? "FIXTURES" : "LIVE";
    pill.className = "mode-pill" + (h.mode === "fixtures" ? "" : " live");
    pill.title = `Probe42: ${h.probe42.configured ? "configured" : "no key"} · Watchout: ${h.watchout.configured ? "configured" : "no creds"}`;
  } catch {
    $("modePill").textContent = "?";
  }
}

async function run() {
  report.innerHTML = `<div class="loading">Loading…</div>`;
  const payload = {
    entityType,
    identifier: $("cin").value.trim(),
    idType: $("idType").value,
    useWatchout: $("useWatchout").checked,
    useFixtures: $("useFixtures").checked,
    fixtureKey: $("fixtureKey").value,
  };
  try {
    const data = await fetch("/api/legal-dd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => r.json());
    report.innerHTML = renderReport(data);
    wireTabs();
    wireDrawerJump();
  } catch (e) {
    report.innerHTML = `<div class="error"><h3>Request failed</h3><p>${e.message}</p></div>`;
  }
}

function wireTabs() {
  report.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      report.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      report.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      const panel = report.querySelector(`#tab-${tab.dataset.tab}`);
      if (panel) panel.classList.add("active");
    });
  });
}

function wireDrawerJump() {
  report.querySelectorAll("tr.click[data-din]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const drawer = report.querySelector(`#drawer-${CSS.escape(tr.dataset.din)}`);
      if (drawer) {
        drawer.scrollIntoView({ behavior: "smooth", block: "center" });
        drawer.style.outline = "2px solid var(--accent2)";
        setTimeout(() => (drawer.style.outline = ""), 1500);
      }
    });
  });
}

$("run").addEventListener("click", run);
$("entityPicker").addEventListener("change", syncFromPicker);
$("idType").addEventListener("change", () => {
  entityType = ID_TO_ENTITY[$("idType").value] || "company";
});

(async () => {
  refreshMode();
  await loadEntities();
  run();
})();
