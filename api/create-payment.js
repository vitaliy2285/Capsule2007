const crypto = require('crypto');
const {sb, ok, fail, preflight, hashCode} = require('./_supabase');

const PRICE_VALUE = '107.00';

function cleanMessage(s){ return String(s || '').replace(/\s+/g,' ').trim().slice(0, 160); }
function cleanName(s){ return String(s || 'Аноним').replace(/[<>]/g,'').trim().slice(0, 24) || 'Аноним'; }
function addMinutes(date, minutes){ return new Date(date.getTime() + minutes * 60000).toISOString(); }
function ownerCodeSecret(){ return process.env.OWNER_CODE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'capsule2007-dev-owner-code-secret'; }
function ownerCodeForReservation(reservationId, claimToken){
  const digest = crypto.createHmac('sha256', ownerCodeSecret()).update(`${reservationId}:${claimToken}`).digest('hex').toUpperCase();
  return `${digest.slice(0,6)}-${digest.slice(6,12)}`;
}

async function createYooKassaPayment({reservationId, claimToken, cell}){
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  const siteUrl = process.env.SITE_URL || '';
  if(!shopId || !secret || !siteUrl) return {payment_url:null, payment_id:null, demo:true};

  const res = await fetch('https://api.yookassa.ru/v3/payments', {
    method:'POST',
    headers:{ 'Authorization':'Basic ' + Buffer.from(`${shopId}:${secret}`).toString('base64'), 'Idempotence-Key': crypto.randomUUID(), 'Content-Type':'application/json' },
    body:JSON.stringify({
      amount:{value:PRICE_VALUE, currency:'RUB'}, capture:true, description:`Capsule2007: ячейка #${String(cell).padStart(5,'0')}`,
      confirmation:{type:'redirect', return_url:`${siteUrl}/?payment_check=${reservationId}&claim=${encodeURIComponent(claimToken)}`},
      metadata:{reservation_id:reservationId}
    })
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.description || 'Payment provider error');
  return { payment_url:data.confirmation?.confirmation_url || null, payment_id:data.id || null, demo:false };
}

const handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    if(event.httpMethod !== 'POST') return fail('POST required', 405);
    const body = JSON.parse(event.body || '{}');
    const cell = Number(body.cell_number || 0);
    const nickname = cleanName(body.nickname);
    const year = String(body.memory_year || '2007').slice(0, 4);
    const message = cleanMessage(body.message);
    if(!cell || cell < 1 || cell > 20007) throw new Error('Некорректный номер ячейки');
    if(message.length < 8 || message.length > 160) throw new Error('Капсула должна быть от 8 до 160 символов');

    const nowIso = new Date().toISOString();
    await sb(`/capsules?cell_number=eq.${cell}&status=eq.pending_payment&expires_at=lt.${encodeURIComponent(nowIso)}`, { method:'PATCH', body:JSON.stringify({status:'expired'}) });

    const existing = await sb(`/capsules?cell_number=eq.${cell}&or=(status.in.(paid_pending_moderation,published,hidden),and(status.eq.pending_payment,expires_at.gt.${encodeURIComponent(nowIso)}))&select=id,status,expires_at&limit=1`, {method:'GET'});
    if(existing.length) throw new Error('Эта ячейка уже занята или временно ожидает оплату');

    const reservationId = crypto.randomUUID();
    const claimToken = crypto.randomBytes(18).toString('hex');
    const ownerCode = ownerCodeForReservation(reservationId, claimToken);
    const expiresAt = addMinutes(new Date(), 15);
    const inserted = await sb('/capsules', { method:'POST', body:JSON.stringify([{id:reservationId,cell_number:cell,nickname,memory_year:year,message,status:'pending_payment',amount_rub:107,owner_code_hash:hashCode(ownerCode),claim_token:claimToken,expires_at:expiresAt}])});
    const row = inserted[0];

    const payment = await createYooKassaPayment({reservationId:row.id, claimToken, cell});
    if(payment.payment_id){ await sb(`/capsules?id=eq.${row.id}`, { method:'PATCH', body:JSON.stringify({payment_id:payment.payment_id}) }); }

    return ok({reservation_id:row.id, claim_token:claimToken, payment_check:row.id, cell_number:cell, status:'pending_payment', expires_at:expiresAt, payment_url:payment.payment_url, demo:payment.demo || false});
  }catch(e){ return fail(e, 400); }
};

module.exports = async (req, res) => { const event = {httpMethod:req.method, headers:req.headers || {}, queryStringParameters:req.query || {}, body:req.body == null ? '' : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))}; const result = await handler(event); if (result?.headers) for (const [k,v] of Object.entries(result.headers)) res.setHeader(k,v); res.status(result?.statusCode || 200).send(result?.body || ''); };
