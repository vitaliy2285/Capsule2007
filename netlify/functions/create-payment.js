const crypto = require('crypto');
const {sb, ok, fail, preflight, env, randomCode, hashCode} = require('./_supabase');

function cleanMessage(s){
  return String(s || '').replace(/\s+/g,' ').trim().slice(0, 160);
}
function cleanName(s){
  return String(s || 'Аноним').replace(/[<>]/g,'').trim().slice(0, 24) || 'Аноним';
}
function addMinutes(date, minutes){
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

async function createYooKassaPayment({amount, description, reservationId, claimToken}){
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  const siteUrl = process.env.SITE_URL || '';

  if(!shopId || !secret || !siteUrl){
    return {payment_url:null, payment_id:null, demo:true};
  }

  const idempotenceKey = crypto.randomUUID();
  const res = await fetch('https://api.yookassa.ru/v3/payments', {
    method:'POST',
    headers:{
      'Authorization':'Basic ' + Buffer.from(`${shopId}:${secret}`).toString('base64'),
      'Idempotence-Key': idempotenceKey,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      amount:{value:amount.toFixed(2), currency:'RUB'},
      capture:true,
      description,
      confirmation:{
        type:'redirect',
        return_url:`${siteUrl}/?payment_check=${reservationId}&claim=${encodeURIComponent(claimToken)}`
      },
      metadata:{reservation_id:reservationId}
    })
  });

  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    console.error('YooKassa error', data);
    throw new Error(data.description || 'Payment provider error');
  }
  return {
    payment_url:data.confirmation?.confirmation_url || null,
    payment_id:data.id || null,
    demo:false
  };
}

exports.handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    if(event.httpMethod !== 'POST') return fail('POST required', 405);

    const body = JSON.parse(event.body || '{}');
    const cell = Number(body.cell_number || 0);
    const nickname = cleanName(body.nickname);
    const year = String(body.memory_year || '2007').slice(0, 4);
    const message = cleanMessage(body.message);

    if(!cell || cell < 1 || cell > 20007) throw new Error('Некорректный номер ячейки');
    if(message.length < 8) throw new Error('Капсула слишком короткая');
    if(message.length > 160) throw new Error('Капсула длиннее 160 символов');

    // Проверяем, что ячейка не занята и не висит в актуальной pending_payment.
    const nowIso = new Date().toISOString();
    const existing = await sb(`/capsules?cell_number=eq.${cell}&or=(status.in.(paid_pending_moderation,published),and(status.eq.pending_payment,expires_at.gt.${encodeURIComponent(nowIso)}))&select=id,status,expires_at&limit=1`, {method:'GET'});
    if(existing.length) throw new Error('Эта ячейка уже занята или временно ожидает оплату');

    const ownerCode = randomCode();
    const claimToken = crypto.randomBytes(18).toString('hex');
    const expiresAt = addMinutes(new Date(), 15);

    const inserted = await sb('/capsules', {
      method:'POST',
      body:JSON.stringify([{
        cell_number:cell,
        nickname,
        memory_year:year,
        message,
        status:'pending_payment',
        amount_rub:107,
        owner_code_hash:hashCode(ownerCode),
        owner_code_plain_demo:ownerCode,
        claim_token:claimToken,
        expires_at:expiresAt
      }])
    });

    const row = inserted[0];
    const payment = await createYooKassaPayment({
      amount:107,
      description:`Capsule2007: ячейка #${String(cell).padStart(5,'0')}`,
      reservationId:row.id,
      claimToken
    });

    if(payment.payment_id){
      await sb(`/capsules?id=eq.${row.id}`, {
        method:'PATCH',
        body:JSON.stringify({payment_id:payment.payment_id})
      });
    }

    return ok({
      reservation_id:row.id,
      cell_number:cell,
      status:'pending_payment',
      expires_at:expiresAt,
      payment_url:payment.payment_url,
      demo:payment.demo || false,
      message: payment.demo
        ? 'Payment provider not configured. Cell is NOT occupied.'
        : 'Redirect to payment.'
    });
  }catch(e){ return fail(e, 400); }
};
