const {sb, ok, fail, preflight} = require('./_supabase');

exports.handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;
  try{
    const sector = Math.max(1, Number(event.queryStringParameters?.sector || 1));
    const size = 500;
    const start = (sector - 1) * size + 1;
    const end = Math.min(sector * size, 20007);

    const rows = await sb(`/capsules?cell_number=gte.${start}&cell_number=lte.${end}&status=in.(paid_pending_moderation,published)&select=cell_number,nickname,memory_year,message,status,updated_at&order=cell_number.asc`, {method:'GET'});
    const stats = await sb(`/capsules?status=in.(paid_pending_moderation,published)&select=cell_number`, {method:'GET'});

    return ok({
      sector, start, end,
      occupied_total: stats.length,
      free_total: 20007 - stats.length,
      cells: rows
    });
  }catch(e){ return fail(e, 500); }
};
