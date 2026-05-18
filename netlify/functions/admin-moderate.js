const {sb, ok, fail, preflight, env} = require('./_supabase');

exports.handler = async (event) => {
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
