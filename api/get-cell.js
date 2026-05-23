const { sb, ok, fail, preflight } = require('./_supabase');

const ACTIVE_STATUSES = ['published', 'hidden', 'paid_pending_moderation', 'paid_expired_manual_review'];

function buildCell(row) {
  const status = String(row?.status || '');

  if (status === 'published') {
    return {
      ...row,
      occupied: true,
      public: true
    };
  }

  return {
    cell_number: row.cell_number,
    nickname: row.nickname || 'Аноним',
    status,
    occupied: true,
    public: false,
    hidden: status === 'hidden',
    pending_moderation: status === 'paid_pending_moderation' || status === 'paid_expired_manual_review',
    message: null,
    memory_year: null,
    source: null,
    published_at: null,
    is_seed: false
  };
}

const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;

  try {
    const raw = event.queryStringParameters?.cell_number || event.queryStringParameters?.cell || event.queryStringParameters?.id || '';
    const n = Number(String(raw).replace(/\D/g, ''));

    if (!n || n < 1 || n > 20007) throw new Error('Bad cell number');

    const rows = await sb(
      `/capsules?cell_number=eq.${n}&status=in.(${ACTIVE_STATUSES.join(',')})&select=cell_number,nickname,memory_year,message,status,published_at,is_seed,source&limit=1`,
      { method: 'GET' }
    );

    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return ok({ cell: null });

    return ok({ cell: buildCell(row) });
  } catch (e) {
    return fail(e, 400);
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
    for (const [k, v] of Object.entries(result.headers)) {
      res.setHeader(k, v);
    }
  }

  res.status(result?.statusCode || 200).send(result?.body || '');
};
