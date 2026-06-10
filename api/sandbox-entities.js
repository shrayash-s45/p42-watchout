// api/sandbox-entities.js — Vercel twin of /api/sandbox-entities.
// Note: the confidential JSON is gitignored, so on a deploy this returns an
// empty list unless the file is provided out-of-band.
import { getSandboxEntities } from "../fixtures/sandbox.js";

export default function handler(_req, res) {
  res.status(200).json(getSandboxEntities());
}
