const {sb, ok, fail, preflight} = require('./_supabase');

exports.handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    const body = event.httpMethod === 'POST'
      ? JSON.parse(event.body || '{}')
      : event.queryStringParameters || {};

    const reservationId = String(body.reservation_id || body.payment_check || '');
    const claim = String(body.claim_token || body.claim || '');

    if(!reservationId || !claim) throw new Error('reservation_id and claim_token required');

    const rows = await sb(`/capsules?id=eq.${reservationId}&claim_token=eq.${claim}&select=id,cell_number,nickname,memory_year,message,status,owner_code_plain_demo,paid_at,published_at&limit=1`, {method:'GET'});
    if(!rows.length) throw new Error('Reservation not found');

    const c = rows[0];
    return ok({
      status:c.status,
      paid:['paid_pending_moderation','published'].includes(c.status),
      cell:c.status === 'pending_payment' ? null : {
        cell_number:c.cell_number,
        nickname:c.nickname,
        memory_year:c.memory_year,
        message:c.message,
        status:c.status,
        owner_code:c.owner_code_plain_demo,
        link:`/cell/${String(c.cell_number).padStart(5,'0')}`
      }
    });
  }catch(e){ return fail(e, 400); }
};
