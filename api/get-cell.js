const {sb, ok, fail, preflight} = require('./_supabase');

const handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    const raw = event.queryStringParameters?.cell_number || event.queryStringParameters?.cell || '';
    const n = Number(String(raw).replace(/\D/g, ''));
    if(!n || n < 1 || n > 20007) throw new Error('Bad cell number');

    const rows = await sb(`/capsules?cell_number=eq.${n}&status=eq.published&select=cell_number,nickname,memory_year,message,status,published_at&limit=1`, {method:'GET'});
    return ok({cell:rows[0] || null});
  }catch(e){ return fail(e, 400); }
};

module.exports = async (req, res) => {
  const event = { httpMethod: req.method, headers: req.headers || {}, queryStringParameters: req.query || {}, body: req.body == null ? '' : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) };
  const result = await handler(event);
  if (result?.headers) for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  res.status(result?.statusCode || 200).send(result?.body || '');
};
