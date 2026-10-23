// POST /api/review  {"text": "..."}  -> deterministic ClauseGuard report + docHash + reportHash
// Stateless: the text is not stored or logged. Used by agents and by the Chainlink CRE workflow (see /cre).
const crypto = require('crypto');
const cg = require('../rules.js');
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ service: 'ClauseGuard', ruleset: cg.RULESET_VERSION, usage: 'POST {"text": "<contract text>"}', rules: cg.RULES.map(r => ({ id: r.id, title: r.title, severity: r.sev, category: r.cat })) });
  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const text = body && typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) return res.status(400).json({ error: 'send {"text": "..."}' });
  if (text.length > 200000) return res.status(413).json({ error: 'text too long (max 200k chars)' });
  const r = cg.check(text);
  const docHash = sha(text);
  const reportHash = sha(cg.canonical(cg.reportPayload(docHash, r)));
  res.status(200).json({ docHash, reportHash, ...r, disclaimer: 'Not legal advice. First-pass checklist for review with a lawyer.' });
};
