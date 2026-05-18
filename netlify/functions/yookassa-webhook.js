const {sb, ok, fail, preflight} = require('./_supabase');

exports.handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    if(event.httpMethod !== 'POST') return fail('POST required', 405);

    const body = JSON.parse(event.body || '{}');
    const eventType = body.event;
    const object = body.object || {};
    const reservationId = object.metadata?.reservation_id;
    const paymentId = object.id;

    if(!reservationId) return ok({ignored:true, reason:'No reservation_id'});
    if(eventType !== 'payment.succeeded') return ok({ignored:true, event:eventType});

    const now = new Date().toISOString();

    await sb(`/capsules?id=eq.${reservationId}`, {
      method:'PATCH',
      body:JSON.stringify({
        status:'paid_pending_moderation',
        payment_id:paymentId,
        paid_at:now,
        expires_at:null
      })
    });

    return ok({ok:true});
  }catch(e){ return fail(e, 500); }
};
