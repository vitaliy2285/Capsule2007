const {sb, ok, fail, preflight, hashCode} = require('./_supabase');

exports.handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    const body = JSON.parse(event.body || '{}');
    const n = Number(body.cell_number || 0);
    const ownerCode = String(body.owner_code || '').trim().toUpperCase();

    if(!n || n < 1 || n > 20007) throw new Error('Bad cell number');
    if(!ownerCode) throw new Error('Owner code required');

    const hash = hashCode(ownerCode);
    const rows = await sb(`/capsules?cell_number=eq.${n}&owner_code_hash=eq.${hash}&select=cell_number,nickname,memory_year,message,status,published_at,paid_at&limit=1`, {method:'GET'});
    if(!rows.length) throw new Error('Ячейка не найдена или код владельца неверный');

    return ok({cell:rows[0]});
  }catch(e){ return fail(e, 403); }
};
