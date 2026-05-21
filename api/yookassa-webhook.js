const {sb, ok, fail, preflight} = require('./_supabase');

const EXPECTED_AMOUNT = '107.00';
const EXPECTED_CURRENCY = 'RUB';

async function fetchYkPayment(paymentId){
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;

  if(!shopId || !secret) return null;

  const res = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`, {
    headers:{
      'Authorization':'Basic ' + Buffer.from(`${shopId}:${secret}`).toString('base64')
    }
  });

  const data = await res.json().catch(()=>({}));

  if(!res.ok){
    throw new Error('YooKassa verification failed');
  }

  return data;
}

async function loadCapsule(reservationId){
  const rows = await sb(`/capsules?id=eq.${reservationId}&select=id,cell_number,status,payment_id&limit=1`, {
    method:'GET'
  });

  return rows[0] || null;
}

const handler = async (event) => {
  const pf = preflight(event);
  if(pf) return pf;

  try{
    if(event.httpMethod !== 'POST'){
      return fail('POST required', 405);
    }

    const body = JSON.parse(event.body || '{}');

    if(body.event !== 'payment.succeeded'){
      return ok({ignored:true, event:body.event || null});
    }

    const paymentId = body.object?.id;

    if(!paymentId){
      return fail('Missing payment id', 400);
    }

    const verified = await fetchYkPayment(paymentId);

    if(!verified){
      return fail('YooKassa credentials are required', 403);
    }

    const reservationId = verified.metadata?.reservation_id;

    const valid = (
      verified.status === 'succeeded' &&
      verified.paid === true &&
      verified.amount?.value === EXPECTED_AMOUNT &&
      verified.amount?.currency === EXPECTED_CURRENCY &&
      reservationId
    );

    if(!valid){
      return fail('Payment verification failed', 403);
    }

    const capsule = await loadCapsule(reservationId);

    if(!capsule){
      return fail('Capsule reservation not found', 404);
    }

    if(capsule.payment_id && capsule.payment_id !== paymentId){
      return fail('Payment mismatch for reservation', 409);
    }

    if(['paid_pending_moderation', 'published', 'hidden'].includes(capsule.status)){
      return ok({ok:true, idempotent:true, status:capsule.status});
    }

    if(capsule.status !== 'pending_payment'){
      return fail(`Invalid capsule status: ${capsule.status}`, 409);
    }

    const now = new Date().toISOString();

    const rows = await sb(`/capsules?id=eq.${reservationId}&status=eq.pending_payment`, {
      method:'PATCH',
      body:JSON.stringify({
        status:'paid_pending_moderation',
        payment_id:paymentId,
        paid_at:now,
        expires_at:null
      })
    });

    if(!rows.length){
      return ok({ok:true, idempotent:true});
    }

    await sb('/moderation_queue', {
      method:'POST',
      body:JSON.stringify([{capsule_id:reservationId, status:'pending'}]),
      headers:{Prefer:'resolution=merge-duplicates,return=representation'}
    }).catch(()=>null);

    return ok({ok:true});
  }catch(e){
    return fail(e, 500);
  }
};

module.exports = async (req, res) => {
  const event = {
    httpMethod:req.method,
    headers:req.headers || {},
    queryStringParameters:req.query || {},
    body:req.body == null ? '' : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
  };

  const result = await handler(event);

  if (result?.headers) {
    for (const [k,v] of Object.entries(result.headers)) {
      res.setHeader(k,v);
    }
  }

  res.status(result?.statusCode || 200).send(result?.body || '');
};
