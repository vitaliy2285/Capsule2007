const {sb, ok, fail, preflight, env} = require('./_supabase');

const handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'] || event.queryStringParameters?.token;
    if(token !== env('ADMIN_TOKEN')) throw new Error('Forbidden');

    if(event.httpMethod === 'GET'){
      const rows = await sb('/capsules?status=eq.paid_pending_moderation&select=id,cell_number,nickname,memory_year,message,status,paid_at&order=paid_at.asc', {method:'GET'});
      return ok({pending:rows});
    }

    if(event.httpMethod !== 'POST') return fail('GET or POST required', 405);
    const body = JSON.parse(event.body || '{}');
    const id = String(body.id || '');
    const action = String(body.action || '');
    if(!id) throw new Error('id required');
    if(!['publish','reject','hide'].includes(action)) throw new Error('Bad action');

    const patch = action === 'publish' ? {status:'published', published_at:new Date().toISOString()} : {status: action === 'reject' ? 'rejected' : 'hidden'};
    const rows = await sb(`/capsules?id=eq.${id}`, { method:'PATCH', body:JSON.stringify(patch) });
    return ok({ok:true, rows});
  }catch(e){ return fail(e, 403); }
};

module.exports = async (req, res) => {
  const event = {httpMethod:req.method, headers:req.headers || {}, queryStringParameters:req.query || {}, body:req.body == null ? '' : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))};
  const result = await handler(event);
  if (result?.headers) for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  res.status(result?.statusCode || 200).send(result?.body || '');
};
