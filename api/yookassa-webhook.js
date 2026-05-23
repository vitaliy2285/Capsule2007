const { sb, ok, fail, preflight } = require('./_supabase');

const EXPECTED_CURRENCY = 'RUB';

async function fetchYooKassaPayment(paymentId) {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;

  if (!shopId || !secret || !paymentId) return null;

  const response = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${shopId}:${secret}`).toString('base64')
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.description || data.message || `YooKassa HTTP ${response.status}`);
  }
  return data;
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  return Number.isFinite(ts) && ts < Date.now();
}

const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;

  if (event.httpMethod !== 'POST') return fail('POST required', 405);

  try {
    const data = JSON.parse(event.body || '{}');
    const object = data.object || {};
    const paymentId = object.id;
    const status = object.status;
    const reservationId = object.metadata?.reservation_id;

    console.log('[Webhook] received', { paymentId, reservationId, status });

    if (!paymentId || !reservationId) {
      return ok({ status: 'ignored', reason: 'missing payment_id or reservation_id' });
    }

    let verified = object;
    try {
      const remotePayment = await fetchYooKassaPayment(paymentId);
      if (remotePayment) verified = remotePayment;
    } catch (verifyErr) {
      console.error('[Webhook] YooKassa verification failed', { paymentId, error: verifyErr.message });
      return ok({ status: 'ignored', reason: 'payment verification failed' });
    }

    if (verified.status !== 'succeeded' || verified.paid !== true) {
      console.log('[Webhook] non-succeeded payment ignored', { paymentId, status: verified.status, paid: verified.paid });
      return ok({ status: 'ignored', reason: 'payment not succeeded' });
    }

    const rows = await sb(`/capsules?id=eq.${reservationId}&select=id,cell_number,status,expires_at,amount_rub,payment_id`);
    const rec = Array.isArray(rows) && rows.length ? rows[0] : null;

    if (!rec) {
      console.warn('[Webhook] reservation not found', { reservationId, paymentId });
      return ok({ status: 'ignored', reason: 'reservation not found' });
    }

    if (rec.status !== 'pending_payment') {
      console.log('[Webhook] duplicate/already processed', { reservationId, paymentId, currentStatus: rec.status });
      return ok({ status: 'idempotent', current_status: rec.status });
    }

    const expectedAmount = Number(rec.amount_rub || 107).toFixed(2);
    const paymentAmount = verified.amount?.value;
    const paymentCurrency = verified.amount?.currency;

    if (paymentAmount !== expectedAmount || paymentCurrency !== EXPECTED_CURRENCY) {
      console.warn('[Webhook] amount/currency mismatch', {
        reservationId,
        paymentId,
        paymentAmount,
        expectedAmount,
        paymentCurrency
      });
      return ok({ status: 'ignored', reason: 'invalid amount or currency' });
    }

    if (isExpired(rec.expires_at)) {
      console.warn('[Webhook] paid after expiration', { reservationId, paymentId, cell: rec.cell_number });
      await sb(`/capsules?id=eq.${reservationId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'paid_expired_manual_review',
          paid_at: new Date().toISOString(),
          payment_id: paymentId
        })
      });
      return ok({ status: 'manual_review', reason: 'reservation expired before payment' });
    }

    await sb(`/capsules?id=eq.${reservationId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'paid_pending_moderation',
        paid_at: new Date().toISOString(),
        expires_at: null,
        payment_id: paymentId
      })
    });

    try {
      await sb('/moderation_queue', {
        method: 'POST',
        body: JSON.stringify({ capsule_id: reservationId, status: 'pending' }),
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
      });
    } catch (queueErr) {
      console.warn('[Webhook] moderation queue insert warning', { reservationId, error: queueErr.message });
    }

    console.log('[Webhook] processed', { reservationId, paymentId });
    return ok({ status: 'processed' });
  } catch (e) {
    console.error('[Webhook] error', { error: e?.message || String(e) });
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
    for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  }
  res.status(result?.statusCode || 200).send(result?.body || '');
};
