// api/watchout/doc.js — Vercel twin of GET /api/watchout/doc.
// Streams a watchoutinvestors.com source PDF via the (whitelisted) server so
// browsers on non-whitelisted IPs can open it. Host-allowlisted (anti-SSRF).
export default async function handler(req, res) {
  const raw = req.query.url;
  if (!raw) return res.status(400).json({ error: "url query param required" });
  let u;
  try {
    u = new URL(raw);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }
  const host = u.hostname.toLowerCase();
  if (host !== "watchoutinvestors.com" && host !== "www.watchoutinvestors.com") {
    return res.status(400).json({ error: "host not allowed" });
  }
  try {
    const upstream = await fetch(u.toString(), { signal: AbortSignal.timeout(30000) });
    if (!upstream.ok) return res.status(502).json({ error: `upstream ${upstream.status}` });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.status(200).send(buf);
  } catch (e) {
    res.status(504).json({ error: `fetch failed: ${e.message}` });
  }
}
