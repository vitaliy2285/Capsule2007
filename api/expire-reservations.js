const {sb, ok, fail, preflight, env} = require('./_supabase');

const handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'] || event.queryStringParameters?.token;
    if(token !== env('ADMIN_TOKEN')) throw new Error('Forbidden');

    const now = new Date().toISOString();
    const rows = await sb(`/capsules?status=eq.pending_payment&expires_at=lt.${encodeURIComponent(now)}`, {
      method:'PATCH',
      body:JSON.stringify({status:'expired'})
    });
    return ok({expired:rows.length, rows});
  }catch(e){ return fail(e, 403); }
};

module.exports = async (req, res) => {
  const event = {
    httpMethod: req.method,
    headers: req.headers || {},
    queryStringParameters: req.query || {},
    body: req.body == null ? '' : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
  };

  const result = await handler(event);
  if (result?.headers) {
    for (const [k, v] of Object.entries(result.headers)) {
      res.setHeader(k, v);
    }
  }
  res.status(result?.statusCode || 200).send(result?.body || '');
};
