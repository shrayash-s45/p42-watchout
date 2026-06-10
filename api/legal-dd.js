// api/legal-dd.js — Vercel serverless front door (mirrors server.js route).
import { handleLegalDD } from "../legal-dd/request.js";

export default async function handler(req, res) {
  const input =
    req.method === "POST"
      ? req.body || {}
      : {
          identifier: req.query.cin,
          idType: req.query.idType,
          useWatchout: req.query.useWatchout,
          useFixtures: req.query.useFixtures,
          fixtureKey: req.query.fixtureKey,
        };
  const { status, body } = await handleLegalDD(input);
  res.status(status).json(body);
}
