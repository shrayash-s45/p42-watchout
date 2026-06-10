// api/health.js — Vercel serverless diagnostics (mirrors /api/health).
import { listFixtures } from "../fixtures/index.js";

export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    mode: process.env.USE_FIXTURES === "true" ? "fixtures" : "live",
    fixtures: listFixtures(),
    probe42: { configured: !!process.env.PROBE42_API_KEY, env: process.env.PROBE42_ENV || "sandbox" },
    watchout: {
      configured: !!(process.env.WATCHOUT_USERID && process.env.WATCHOUT_AES_KEY),
      env: process.env.WATCHOUT_ENV || "test",
    },
  });
}
