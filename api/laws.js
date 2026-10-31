// GET /api/laws -> live EUR-Lex Cellar SPARQL status for the 4 cited acts.
// Same query shape as the Chainlink CRE workflow. Stateless, no storage.
const ACTS = [
  { celex: '31993L0013', name: 'Unfair Contract Terms Directive 93/13/EEC' },
  { celex: '32019L0944', name: 'Electricity Directive (EU) 2019/944' },
  { celex: '32016R0679', name: 'GDPR (EU) 2016/679' },
  { celex: '32023R1114', name: 'MiCA (EU) 2023/1114' },
];

const SPARQL = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT ?celex ?force ?date WHERE {
  ?w cdm:resource_legal_id_celex ?celex .
  FILTER(?celex IN (
    "31993L0013"^^<http://www.w3.org/2001/XMLSchema#string>,
    "32019L0944"^^<http://www.w3.org/2001/XMLSchema#string>,
    "32016R0679"^^<http://www.w3.org/2001/XMLSchema#string>,
    "32023R1114"^^<http://www.w3.org/2001/XMLSchema#string>
  ))
  OPTIONAL { ?w cdm:resource_legal_in-force ?force }
  OPTIONAL { ?w cdm:work_date_document ?date }
}`;

async function fetchLaws() {
  const url = 'https://publications.europa.eu/webapi/rdf/sparql?query=' + encodeURIComponent(SPARQL);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  let rows;
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/sparql-results+json' },
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error('upstream ' + resp.status);
    const data = await resp.json();
    rows = (data && data.results && data.results.bindings) || [];
  } finally {
    clearTimeout(t);
  }

  const byCelex = {};
  for (const b of rows) {
    const celex = b.celex && b.celex.value;
    if (!celex) continue;
    const force = b.force && b.force.value;
    const date = b.date && b.date.value;
    byCelex[celex] = {
      inForce: force === '1' || force === 'true',
      date: date || null,
    };
  }

  const acts = ACTS.map(a => {
    const info = byCelex[a.celex] || {};
    return {
      celex: a.celex,
      name: a.name,
      inForce: !!info.inForce,
      date: info.date || null,
      url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:' + a.celex,
    };
  });

  return {
    source: 'EUR-Lex Cellar SPARQL',
    checkedAt: new Date().toISOString(),
    acts,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const out = await fetchLaws();
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: 'EUR-Lex upstream error: ' + (e && e.message ? e.message : String(e)) });
  }
};

module.exports.ACTS = ACTS;
module.exports.fetchLaws = fetchLaws;
