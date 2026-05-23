const crypto = require('crypto');
const { sb, ok, fail, preflight } = require('./_supabase');

function calculateCellPrice(cellNumber) {
  // Future pricing tiers for beautiful/archive numbers must be calculated here,
  // never trusted from the frontend. First production release keeps 107 RUB.
  return 107;
}

function cleanMessage(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function cleanName(s) {
  return String(s || 'Аноним').replace(/[<>]/g, '').trim().slice(0, 24) || 'Аноним';
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

async function createYooKassaPayment({ reservationId, claimToken, cell, amountRub }) {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  const siteUrl = process.env.SITE_URL || '';

  if (!shopId || !secret || !siteUrl) {
    return { payment_url: null, payment_id: null, demo: true };
  }

  const response = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${shopId}:${secret}`).toString('base64'),
      'Idempotence-Key': crypto.createHash('sha256').update(`${reservationId}:${claimToken}`).digest('hex'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: { value: amountRub.toFixed(2), currency: 'RUB' },
      capture: true,
      description: `Capsule2007: ячейка #${String(cell).padStart(5, '0')}`,
      confirmation: {
        type: 'redirect',
        return_url: `${siteUrl}/?payment_check=${reservationId}&claim=${encodeURIComponent(claimToken)}`
      },
      metadata: {
        reservation_id: String(reservationId),
        cell_number: String(cell)
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.description || data.message || 'Payment provider error');

  return {
    payment_url: data.confirmation?.confirmation_url || null,
    payment_id: data.id || null,
    demo: false
  };
}

const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;

  try {
    if (event.httpMethod !== 'POST') return fail('POST required', 405);

    const body = JSON.parse(event.body || '{}');
    const cell = Number(body.cell_number || 0);
    const nickname = cleanName(body.nickname);
    const year = String(body.memory_year || '2007').replace(/\D/g, '').slice(0, 4) || '2007';
    const message = cleanMessage(body.message);

    console.log('[CreatePayment] start', { cell, nickname, year });

    if (!cell || cell < 1 || cell > 20007) throw new Error('Некорректный номер ячейки');
    if (message.length < 8 || message.length > 160) throw new Error('Капсула должна быть от 8 до 160 символов');

    let result;
    try {
      result = await sb('/rpc/reserve_capsule', {
        method: 'POST',
        body: JSON.stringify({
          in_cell_number: cell,
          in_nickname: nickname,
          in_year: year,
          in_message: message
        })
      });
    } catch (reserveErr) {
      console.warn('[CreatePayment] reserve error', { cell, error: reserveErr?.message || String(reserveErr) });
      throw new Error('Эта ячейка уже занята или временно ожидает оплату');
    }

    const rowId = result?.reservation_id;
    const ownerCode = result?.owner_code;
    const claimToken = result?.claim_token;

    if (!rowId || !claimToken || !ownerCode) {
      console.error('[CreatePayment] invalid RPC response', { result });
      throw new Error('Некорректный ответ резервирования');
    }

    const priceRub = calculateCellPrice(cell);
    const expiresAt = addMinutes(new Date(), 15);

    const payment = await createYooKassaPayment({
      reservationId: rowId,
      claimToken,
      cell,
      amountRub: priceRub
    });

    if (payment.payment_id) {
      await sb(`/capsules?id=eq.${rowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_id: payment.payment_id, amount_rub: priceRub })
      });
      console.log('[CreatePayment] payment created', { reservationId: rowId, paymentId: payment.payment_id, cell });
    } else {
      await sb(`/capsules?id=eq.${rowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ amount_rub: priceRub })
      });
      console.log('[CreatePayment] demo payment mode', { reservationId: rowId, cell });
    }

    return ok({
      reservation_id: rowId,
      claim_token: claimToken,
      payment_check: rowId,
      owner_code: ownerCode,
      cell_number: cell,
      amount_rub: priceRub,
      status: 'pending_payment',
      expires_at: expiresAt,
      payment_url: payment.payment_url,
      demo: payment.demo || false
    });
  } catch (e) {
    console.error('[CreatePayment] error', { error: e?.message || String(e) });
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
