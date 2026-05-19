const {sb, ok, fail, preflight} = require('./_supabase');

const handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    const sector = Math.max(1, Number(event.queryStringParameters?.sector || 1));
    const size = 500;
    const start = (sector - 1) * size + 1;
    const end = Math.min(sector * size, 20007);

    const rows = await sb(`/capsules?cell_number=gte.${start}&cell_number=lte.${end}&status=eq.published&select=cell_number,nickname,memory_year,message,status,updated_at,is_seed,source&order=cell_number.asc`, {method:'GET'});
    const stats = await sb('/capsules?status=eq.published&select=cell_number', {method:'GET'});

    return ok({ sector, start, end, occupied_total: stats.length, free_total: 20007 - stats.length, sector_occupied: rows.length, cells: rows });
  }catch(e){ return fail(e, 500); }
};

module.exports = async (req, res) => { const event = {httpMethod:req.method, headers:req.headers || {}, queryStringParameters:req.query || {}, body:req.body == null ? '' : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))}; const result = await handler(event); if (result?.headers) for (const [k,v] of Object.entries(result.headers)) res.setHeader(k,v); res.status(result?.statusCode || 200).send(result?.body || ''); };
