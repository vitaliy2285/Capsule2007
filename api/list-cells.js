const {sb, ok, fail, preflight, env} = require('./_supabase');

const TOTAL_CELLS = 20007;
const START_OCCUPIED_FALLBACK = 2317;
const SUPABASE_TIMEOUT_MS = 2200;

function withTimeout(promise, ms, label){
  let timer;
  const timeout = new Promise((_, reject)=>{
    timer = setTimeout(()=>reject(new Error(label || 'timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(()=>clearTimeout(timer));
}

async function countOccupiedCapsules(){
  const url = env('SUPABASE_URL').replace(/\/$/,'') +
    '/rest/v1/capsules?or=(status.eq.published,status.eq.paid_pending_moderation,status.eq.hidden)&select=cell_number';
  const key = env('SUPABASE_SERVICE_ROLE_KEY');

  const res = await withTimeout(fetch(url, {
    method:'HEAD',
    cache:'no-store',
    headers:{
      apikey:key,
      Authorization:`Bearer ${key}`,
      Prefer:'count=exact',
      'Cache-Control':'no-cache, no-store, max-age=0',
      Pragma:'no-cache'
    }
  }), SUPABASE_TIMEOUT_MS, 'supabase_count_timeout');

  if(!res.ok){
    const text = await res.text().catch(()=>String(res.status));
    throw new Error(text || `Supabase count HTTP ${res.status}`);
  }

  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/').pop());
  return Number.isFinite(total) ? total : 0;
}

const handler = async (event) => {
  const pf = preflight(event); if(pf) return pf;

  const sector = Math.max(1, Number(event.queryStringParameters?.sector || 1));
  const size = 500;
  const start = (sector - 1) * size + 1;
  const end = Math.min(sector * size, TOTAL_CELLS);

  try{
    const rows = await withTimeout(sb(
      `/capsules?cell_number=gte.${start}&cell_number=lte.${end}&or=(status.eq.published,status.eq.paid_pending_moderation,status.eq.hidden)&select=cell_number,nickname,memory_year,message,status,updated_at,is_seed,source&order=cell_number.asc`,
      {method:'GET'}
    ), SUPABASE_TIMEOUT_MS, 'supabase_cells_timeout');

    let occupiedTotal = START_OCCUPIED_FALLBACK;
    try{
      occupiedTotal = await countOccupiedCapsules();
    }catch(countErr){
      console.warn('Supabase count skipped:', countErr.message);
      occupiedTotal = Array.isArray(rows) && rows.length ? Math.max(START_OCCUPIED_FALLBACK, rows.length) : START_OCCUPIED_FALLBACK;
    }

    const cells = (rows || []).map((row)=>{
      if(row.status === 'published') return row;
      return {
        cell_number: row.cell_number,
        nickname: row.nickname || 'Аноним',
        status: row.status,
        updated_at: row.updated_at || null,
        occupied: true,
        public: false
      };
    });

    return ok({
      sector,
      start,
      end,
      occupied_total: occupiedTotal,
      free_total: TOTAL_CELLS - occupiedTotal,
      sector_occupied: cells.length,
      cells
    });
  }catch(e){
    console.warn('list-cells fallback:', e.message);
    return ok({
      sector,
      start,
      end,
      occupied_total: START_OCCUPIED_FALLBACK,
      free_total: TOTAL_CELLS - START_OCCUPIED_FALLBACK,
      sector_occupied: 0,
      cells:[],
      fallback:true,
      reason:String(e.message || e)
    });
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
