const {sb, ok, fail, preflight} = require('./_supabase');

const PAID_STATUSES = ['paid_pending_moderation', 'published', 'hidden'];

function buildCell(c){
  const status = String(c.status || '');
  const isPublic = status === 'published';

  return {
    cell_number: c.cell_number,
    nickname: c.nickname || 'Аноним',
    memory_year: isPublic ? (c.memory_year || '2007') : null,
    message: isPublic ? (c.message || '') : null,
    status,
    link: `/cell/${String(c.cell_number).padStart(5,'0')}`,
    occupied: PAID_STATUSES.includes(status),
    public: isPublic,
    hidden: status === 'hidden',
    pending_moderation: status === 'paid_pending_moderation'
  };
}

const handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    const body = event.httpMethod === 'POST'
      ? JSON.parse(event.body || '{}')
      : event.queryStringParameters || {};

    const reservationId = String(body.reservation_id || body.payment_check || '');
    const claim = String(body.claim_token || body.claim || '');

    if(!reservationId || !claim) throw new Error('reservation_id and claim_token required');

    const rows = await sb(`/capsules?id=eq.${reservationId}&claim_token=eq.${claim}&select=id,cell_number,nickname,memory_year,message,status,paid_at,published_at&limit=1`, {method:'GET'});
    if(!rows.length) throw new Error('Reservation not found');

    const c = rows[0];
    const paid = PAID_STATUSES.includes(c.status);

    return ok({
      status:c.status,
      paid,
      cell: paid ? buildCell(c) : null
    });
  }catch(e){ return fail(e, 400); }
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
