const { sb, ok, fail, preflight, env } = require('./_supabase');

const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;

  if (event.httpMethod !== 'POST') return fail('POST required', 405);

  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  if (!token || token !== env('ADMIN_TOKEN')) return fail('Unauthorized', 401);

  try {
    const ts = new Date().toISOString();
    const rows = await sb(`/capsules?status=eq.pending_payment&expires_at=lt.${encodeURIComponent(ts)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'expired' }),
      headers: { Prefer: 'return=representation' }
    });

    const updated = Array.isArray(rows) ? rows.length : 0;
    console.log('[CleanupExpired] done', { updated });
    return ok({ updated });
  } catch (e) {
    console.error('[CleanupExpired] error', { error: e?.message || String(e) });
    return fail('Cleanup failed', 500);
  }
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
    for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  }
  res.status(result?.statusCode || 200).send(result?.body || '');
};
