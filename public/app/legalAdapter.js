// public/app/legalAdapter.js
// Browser-side helpers: HTML escaping, provenance/GAP chip rendering, and small
// value shapers. The server already assembles the report; the adapter just maps
// chip names → CSS classes and renders cell values consistently.

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CHIP_CLASS = {
  P42: "src-p42",
  WATCHOUT: "src-watchout",
  MCA: "src-mca",
  JUDG: "src-judg",
  GAP: "src-gap",
  BUREAU: "src-bureau",
  IM: "src-im",
  ECOURTS: "src-ecourts",
};

// A provenance chip: <span class="src src-p42" title="...">P42</span>
export function chip(name, title) {
  if (!name) return "";
  const cls = CHIP_CLASS[name] || "src-judg";
  const t = title ? ` title="${esc(title)}"` : "";
  return `<span class="src ${cls}"${t}>${esc(name)}</span>`;
}

// A GAP cell: shows "?" or a label + the GAP chip + the closing source.
export function gapCell(g, lead = "?") {
  if (!g) return "";
  const badge = g.badge && g.badge !== "GAP" ? g.badge : "GAP";
  const note = g.note ? ` <span class="note" style="display:inline">(${esc(g.note)})</span>` : "";
  return `${esc(lead)} ${chip(badge, `GAP — closes via ${g.closes || "—"}`)}<span class="note" style="display:inline;margin-left:6px">${esc(g.closes || g.label || "")}</span>${note}`;
}

// Render a value cell that may be a populated value (with chip) OR a GAP object.
export function valueCell(cell) {
  if (cell == null) return "—";
  if (cell.gap) return gapCell(cell, cell.value != null ? cell.value : "?");
  const c = cell.chip ? " " + chip(cell.chip) : "";
  const main = cell.value != null ? esc(cell.value) : "—";
  const also = cell.also ? " " + gapCell(cell.also, "").trim() : "";
  const note = cell.note ? ` <span class="note" style="display:inline">${esc(cell.note)}</span>` : "";
  return `${main}${c}${note}${also}`;
}

export function badge(tone, label, title) {
  const map = { crit: "b-crit", amber: "b-amber", soft: "b-soft", ok: "b-ok", info: "b-info" };
  const cls = map[tone] || "b-info";
  const t = title ? ` title="${esc(title)}"` : "";
  return `<span class="badge ${cls}"${t}>${esc(label)}</span>`;
}

export function crVal(n) {
  return n == null ? "—" : `₹${Number(n).toFixed(2)} Cr`;
}

// Route watchoutinvestors.com PDFs through our server proxy, since that host
// only serves whitelisted IPs — the browser can't fetch them directly. Other
// URLs pass through unchanged.
export function docHref(url) {
  if (!url) return "#";
  try {
    const h = new URL(url, location.origin).hostname.toLowerCase();
    if (h === "watchoutinvestors.com" || h === "www.watchoutinvestors.com") {
      return `/api/watchout/doc?url=${encodeURIComponent(url)}`;
    }
  } catch {
    /* not an absolute URL — leave as-is */
  }
  return url;
}
