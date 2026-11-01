// F2-T03/T04/T05: errores normalizados, lista de modelos y streaming SSE con cancelación (familia compatible con OpenAI).
function fail(status, j) {
  const m = { 401: 'La clave no es válida o fue revocada.', 402: 'Sin créditos para este modelo. Elegí uno gratis o cargá saldo.',
    429: 'Alcanzaste el límite de uso (por minuto o diario). Probá otro modelo o esperá.' }[status]
    || (j && j.error && j.error.message) || ('Error ' + status + ' al consultar el modelo.');
  const e = new Error(m); e.status = status; return e;
}
const isFree = m => { const p = m.pricing || {}; return String(m.id).endsWith(':free') || (+p.prompt === 0 && +p.completion === 0); };
function normModel(p, m) {
  const ctx = m.context_length || m.context_window || m.max_context_length || 0;
  const mods = (m.architecture && m.architecture.input_modalities) || [];
  const tags = [];
  if (ctx >= 200000) tags.push('contexto largo');
  if (/coder|code|codestral/i.test(m.id)) tags.push('código');
  if (mods.includes('image')) tags.push('visión');
  if (/reason|r1|thinking|gpt-oss/i.test(m.id)) tags.push('razonamiento');
  const pr = m.pricing;
  return { p, id: String(m.id).replace(/^models\//, ''), name: m.name || m.id, ctx, desc: m.description || '', origin: m.owned_by || String(m.id).split('/')[0],
    free: p === 'openrouter' ? isFree(m) : null, tags, mods,
    price: pr ? (+pr.prompt * 1e6).toFixed(2) + ' / ' + (+pr.completion * 1e6).toFixed(2) + ' USD por millón de tokens (entrada / salida)' : '' };
}
async function listOA(p, key) {
  const h = key ? { Authorization: 'Bearer ' + key } : {};
  const r = await fetch(PROV[p].url + '/models', { headers: h });
  if (!r.ok) throw fail(r.status, await r.json().catch(() => ({})));
  return (await r.json()).data.map(m => normModel(p, m));
}
async function* streamOA(p, key, model, messages, signal) {
  const r = await fetch(PROV[p].url + '/chat/completions', { method: 'POST', signal,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }) });
  if (!r.ok) throw fail(r.status, await r.json().catch(() => ({})));
  const rd = r.body.getReader(), dc = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await rd.read(); if (done) return;
    buf += dc.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop(); // la última línea puede venir cortada
    for (const l of lines) {
      const t = l.trim(); if (!t.startsWith('data:')) continue;
      const d = t.slice(5).trim(); if (d === '[DONE]') return;
      let j; try { j = JSON.parse(d); } catch { continue; }
      if (j.error) throw fail(j.error.code || 500, j);
      const c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
      if (c) yield c;
    }
  }
}

// Cloudflare Workers AI. Cloudflare no acepta llamadas desde el navegador (CORS), así que pasa por el proxy de server.js.
// La clave se pega como «ACCOUNT_ID:API_TOKEN». El listado usa el endpoint de búsqueda de modelos de Cloudflare (a confirmar con un spike).
const CF_BASE = [['@cf/meta/llama-3.1-8b-instruct', 'Llama 3.1 8B Instruct'], ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'Llama 3.3 70B Instruct (fp8 rápido)'], ['@cf/meta/llama-3.2-3b-instruct', 'Llama 3.2 3B Instruct']];
// El Account ID puede ir en su propio campo (clave «cfid») o pegado como «ACCOUNT_ID:TOKEN».
const cfKey = k => (k.includes(':') || typeof getKey !== 'function' || !getKey('cfid')) ? k : getKey('cfid') + ':' + k;
const cfErr = j => ({ error: { message: (j.errors && j.errors[0] && j.errors[0].message) || (typeof j.error === 'string' ? j.error : '') } });
const cfNeedServer = () => { if (location.protocol === 'file:') throw new Error('Cloudflare necesita abrir la app con npm start (http://localhost:3000).'); };
async function listCF(key) {
  cfNeedServer();
  const r = await fetch('/proxy/cloudflare/models', { headers: { 'x-key': cfKey(key) } }), j = await r.json().catch(() => ({}));
  if (!r.ok && (r.status === 401 || r.status === 403 || typeof j.error === 'string')) throw fail(r.status, cfErr(j));
  const ms = (j.result || []).map(m => normModel('cloudflare', { id: m.name, name: String(m.name).split('/').pop(), description: m.description,
    owned_by: String(m.name).split('/')[1] || 'Cloudflare', context_length: +((m.properties || []).find(x => x.property_id === 'context_window') || {}).value || 0 }));
  return ms.length ? ms : CF_BASE.map(([id, name]) => normModel('cloudflare', { id, name, owned_by: 'meta' }));
}
async function* streamCF(p, key, model, messages, signal) {
  cfNeedServer();
  const r = await fetch('/proxy/cloudflare/run', { method: 'POST', signal, headers: { 'x-key': cfKey(key), 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages }) });
  if (!r.ok) throw fail(r.status, cfErr(await r.json().catch(() => ({}))));
  if (!(r.headers.get('content-type') || '').includes('text/event-stream')) { // el modelo no hizo streaming: respuesta JSON completa
    const res = ((await r.json().catch(() => ({}))).result) || {};
    const t = res.response || (res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
    if (t) yield String(t); return;
  }
  const rd = r.body.getReader(), dc = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await rd.read(); if (done) return;
    buf += dc.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) {
      const t = l.trim(); if (!t.startsWith('data:')) continue;
      const d = t.slice(5).trim(); if (d === '[DONE]') return;
      let j; try { j = JSON.parse(d); } catch { continue; }
      const c = j.response || (j.result && j.result.response) || (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content);
      if (typeof c === 'string' && c) yield c;
    }
  }
}
const listModels = (p, key) => p === 'cloudflare' ? listCF(key) : listOA(p, key);
async function* stream(p, key, model, messages, signal) { yield* (p === 'cloudflare' ? streamCF : streamOA)(p, key, model, messages, signal); }
