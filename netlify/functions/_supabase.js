const crypto = require('crypto');

function env(name, required = true){
  const v = process.env[name];
  if(required && !v) throw new Error(`Missing env ${name}`);
  return v;
}

function hashCode(code){
  return crypto.createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex');
}

function randomCode(){
  const a = crypto.randomBytes(3).toString('hex').toUpperCase();
  const b = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${a}-${b}`;
}

async function sb(path, options = {}){
  const url = env('SUPABASE_URL').replace(/\/$/,'') + '/rest/v1' + path;
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(url, {
    ...options,
    headers:{
      apikey:key,
      Authorization:`Bearer ${key}`,
      'Content-Type':'application/json',
      Prefer:'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
  if(!res.ok){
    console.error('Supabase error', res.status, data);
    throw new Error(typeof data === 'object' && data?.message ? data.message : `Supabase HTTP ${res.status}`);
  }
  return data;
}

function ok(body, statusCode=200){
  return {
    statusCode,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Headers':'Content-Type',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS'
    },
    body:JSON.stringify(body)
  };
}
function fail(error, statusCode=400){
  return ok({error:String(error.message || error)}, statusCode);
}
function preflight(event){
  if(event.httpMethod === 'OPTIONS') return ok({});
  return null;
}
module.exports = {env, sb, ok, fail, preflight, hashCode, randomCode};
