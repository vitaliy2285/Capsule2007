const {sb, ok, fail, preflight, env} = require('./_supabase');

const handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    if(event.httpMethod !== 'POST') return fail('POST required', 405);
    const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
    if(token !== env('ADMIN_TOKEN')) throw new Error('Forbidden');

    const body = JSON.parse(event.body || '{}');
    const id = String(body.id || '');
    const action = String(body.action || '');

    if(!id) throw new Error('id required');
    if(!['publish','reject','hide'].includes(action)) throw new Error('Bad action');

    const patch = {};
    if(action === 'publish'){
      patch.status = 'published';
      patch.published_at = new Date().toISOString();
    }
    if(action === 'reject') patch.status = 'rejected';
    if(action === 'hide') patch.status = 'hidden';

    const rows = await sb(`/capsules?id=eq.${id}`, {
      method:'PATCH',
      body:JSON.stringify(patch)
    });
    return ok({ok:true, rows});
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
