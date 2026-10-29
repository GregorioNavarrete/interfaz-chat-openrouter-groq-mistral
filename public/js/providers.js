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
  return { p, id: m.id, name: m.name || m.id, ctx, desc: m.description || '', origin: m.owned_by || String(m.id).split('/')[0],
    free: p === 'openrouter' ? isFree(m) : null, tags, mods,
    price: pr ? (+pr.prompt * 1e6).toFixed(2) + ' / ' + (+pr.completion * 1e6).toFixed(2) + ' USD por millón de tokens (entrada / salida)' : '' };
}
async function listModels(p, key) {
  const h = key ? { Authorization: 'Bearer ' + key } : {};
  const r = await fetch(PROV[p].url + '/models', { headers: h });
  if (!r.ok) throw fail(r.status, await r.json().catch(() => ({})));
  return (await r.json()).data.map(m => normModel(p, m));
}
async function* stream(p, key, model, messages, signal) {
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
