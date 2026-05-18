const {sb, ok, fail, preflight, env} = require('./_supabase');

exports.handler = async (event) => {
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
