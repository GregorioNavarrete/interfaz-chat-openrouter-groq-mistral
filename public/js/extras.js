// Fase 3: búsqueda (TinyFish/Parallel por proxy), skills con "/", archivos adjuntos y equipo de agentes en paralelo.
const SEARCH = { tinyfish: { n: 'TinyFish', hint: 'clave de TinyFish' }, parallel: { n: 'Parallel', hint: 'clave de Parallel (API paga)' } };
const NAME = id => (PROV[id] || SEARCH[id]).n, HINT = id => (PROV[id] || SEARCH[id]).hint;
const jget = (k, d) => { try { return JSON.parse(LS[k]) || d; } catch { return d; } };
const DB = { skills: jget('mc_skills', []), agents: jget('mc_agents', []) };
const saveDB = () => { LS.mc_skills = JSON.stringify(DB.skills); LS.mc_agents = JSON.stringify(DB.agents); };
const uid = () => Math.random().toString(36).slice(2, 8);
{ const base = Status.models; Status.models = () => [...new Set(base().concat(DB.agents.map(a => [a.prov, a.modelo])).map(x => x.join('\n')))].map(x => x.split('\n')); }

// ---- Búsqueda (F3-T02/T03/T04). Formatos según documentación; se confirman en F1-S04 y F1-S05.
async function searchWeb(engine, key, q) {
  let r;
  try {
    r = engine === 'tinyfish' ? await fetch('/proxy/tinyfish?query=' + encodeURIComponent(q), { headers: { 'x-key': key } })
      : await fetch('/proxy/parallel', { method: 'POST', headers: { 'x-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ objective: q, search_queries: [q], advanced_settings: { max_results: 5 } }) });
  } catch { throw new Error('El modo Búsqueda necesita abrir la app con npm start (usa el proxy local).'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || (j.message) || 'La búsqueda falló (' + r.status + ').');
  return (j.results || []).slice(0, 5).map(x => ({ titulo: x.title || x.url, url: x.url, resumen: x.snippet || (x.excerpts || []).join(' ').slice(0, 600) }));
}
async function testKey(p) {
  try {
    if (SEARCH[p]) { await searchWeb(p, getKey(p), 'prueba'); toast(NAME(p) + ': clave correcta.'); }
    else { S.models[p] = await listModels(p, getKey(p)); toast(NAME(p) + ': clave correcta, ' + S.models[p].length + ' modelos.'); Status.probeAll(getKey); }
  } catch (e) { toast(NAME(p) + ': ' + e.message); }
}

// ---- Skills con "/" (F3-T10)
function skillMenu() {
  const v = $('msg').value, m = $('smenu'); m.textContent = '';
  if (!/^\/\S*$/.test(v)) return m.hidden = true;
  const l = DB.skills.filter(s => s.nombre.toLowerCase().includes(v.slice(1).toLowerCase())); m.hidden = !l.length;
  l.forEach(s => { const b = document.createElement('button'); b.textContent = '/' + s.nombre + ' — ' + s.instrucciones.slice(0, 50); b.onclick = () => { $('msg').value = '/' + s.nombre + ' '; m.hidden = true; $('msg').focus(); }; m.append(b); });
}
function takeSkill(t) { const m = t.match(/^\/(\S+)\s+([\s\S]*)/), sk = m && DB.skills.find(s => s.nombre === m[1]); return sk ? { text: m[2], skill: sk } : { text: t }; }
function sysFor(s, skill, extra) {
  const p = []; if (s.mode === 'code') p.push(CODE_SYS);
  if (skill) p.push('Skill «' + skill.nombre + '»: ' + skill.instrucciones);
  (s.files || []).forEach(f => p.push('Archivo adjunto ' + f.n + ':\n' + f.t));
  if (extra) p.push(extra); return p.join('\n\n');
}

// ---- Contexto adjunto (F3-T06): archivos de texto y contador aproximado
function ctxInfo() {
  const s = S.cur, ch = s.msgs.reduce((n, m) => n + (m.content || '').length, 0) + (s.files || []).reduce((n, f) => n + f.t.length, 0);
  const m = (S.models[s.prov] || []).find(x => x.id === s.model);
  $('ctx').textContent = '≈' + Math.round(ch / 4).toLocaleString('es-AR') + ' tokens' + (m && m.ctx ? ' de ' + Math.round(m.ctx / 1000) + 'K' : '') + ((s.files || []).length ? ' · ' + s.files.length + ' archivo(s)' : '');
}
$('att').onclick = () => $('file').click();
$('file').onchange = async () => {
  const s = S.cur; s.files = s.files || [];
  for (const f of $('file').files) { if (f.size > 150000) { toast(f.name + ' supera 150 KB.'); continue; } s.files.push({ n: f.name, t: await f.text() }); }
  $('file').value = ''; save(); ctxInfo();
};

// ---- Equipo de agentes en paralelo (F3-T09/T11/T12/T13): reparto fijo + síntesis del modelo de la sesión
async function collect(p, model, msgs, signal, on) {
  const key = getKey(p); if (!key) throw new Error('Falta la clave de ' + PROV[p].n + '.');
  let out = ''; for await (const c of stream(p, key, model, msgs, signal)) { out += c; on && on(out); } return out;
}
async function runAgent(o, t, draw, signal) {
  const a = o.a, sk = a.skills.map(id => DB.skills.find(k => k.id === id)).filter(Boolean).map(k => 'Skill ' + k.nombre + ': ' + k.instrucciones);
  o.st = 'trabajando'; draw();
  try {
    o.txt = await collect(a.prov, a.modelo, [{ role: 'system', content: [a.instrucciones].concat(sk).filter(Boolean).join('\n\n') || 'Sos un agente especialista.' }, { role: 'user', content: t }], signal, x => { o.txt = x; draw(); });
    o.st = 'listo'; Status.report(a.prov, a.modelo, true);
  } catch (e) {
    o.st = e.name === 'AbortError' ? 'detenido' : 'error: ' + e.message;
    if (e.status === 429 || e.status >= 500) Status.report(a.prov, a.modelo, false, e.message);
  }
  draw();
}
async function runTeam() {
  const s = S.cur, t = $('msg').value.trim(); if (!t || S.abort) return;
  const ags = s.team.map(id => DB.agents.find(a => a.id === id)).filter(Boolean); if (!ags.length) return send();
  s.msgs.push({ role: 'user', content: t }); if (s.msgs.length === 1) s.title = t.slice(0, 40); $('msg').value = '';
  const panel = { role: 'assistant', panel: true, content: '' }, out = ags.map(a => ({ a, txt: '', st: 'en cola' }));
  s.msgs.push(panel); renderChat(); renderList(); const el = $('chat').lastChild;
  const draw = () => { panel.content = out.map(o => '🧩 ' + o.a.nombre + ' (' + o.a.modelo + ') — ' + o.st + (o.txt ? '\n' + o.txt.slice(-500) : '')).join('\n\n'); el.textContent = panel.content; };
  S.abort = new AbortController(); setBusy(true); draw(); let i = 0;
  const worker = async () => { while (i < out.length && !S.abort.signal.aborted) await runAgent(out[i++], t, draw, S.abort.signal); };
  await Promise.all(Array.from({ length: Math.min(+$('conc').value || 2, out.length) }, worker));
  const a = { role: 'assistant', content: '' }, done = out.filter(o => o.txt);
  if (done.length && !S.abort.signal.aborted) {
    s.msgs.push(a); renderChat(); const e2 = $('chat').lastChild;
    try {
      await collect(s.prov, s.model, [{ role: 'system', content: 'Sos el agente líder. Integrá los informes del equipo en una sola respuesta clara y señalá los desacuerdos.' },
        { role: 'user', content: 'Pedido: ' + t + '\n\n' + done.map(o => 'Informe de ' + o.a.nombre + ':\n' + o.txt.slice(0, 2500)).join('\n\n') }], S.abort.signal, x => { a.content = x; e2.textContent = x; });
    } catch (e) { if (e.name !== 'AbortError') a.err = e.message; }
    if (!a.content && !a.err) s.msgs.pop();
  }
  S.abort = null; setBusy(false); save(); renderChat(); ctxInfo();
}

// ---- Panel de agentes y skills (F3-T10)
function row(txt, chk, onChk, onDel) {
  const d = document.createElement('div'); d.className = 'chk';
  if (chk !== null) { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = chk; c.onchange = () => onChk(c.checked); d.append(c); }
  const t = document.createElement('span'), x = document.createElement('button'); t.textContent = txt; t.style.flex = 1; x.textContent = '✕'; x.onclick = onDel; d.append(t, x); return d;
}
function fillAg() {
  const ap = $('ap'); if (!ap.options.length) Object.keys(PROV).forEach(p => ap.append(new Option(PROV[p].n, p)));
  const dl = $('amod'); dl.textContent = ''; (S.models[ap.value] || []).slice(0, 300).forEach(m => dl.append(new Option(m.id)));
}
function renderAg() {
  const sl = $('skl'), al = $('agl'), ask = $('ask'); sl.textContent = al.textContent = ask.textContent = '';
  DB.skills.forEach(k => {
    sl.append(row('/' + k.nombre + ' — ' + k.instrucciones.slice(0, 60), null, null, () => { DB.skills = DB.skills.filter(z => z !== k); saveDB(); renderAg(); }));
    const l = document.createElement('label'), c = document.createElement('input'); c.type = 'checkbox'; c.value = k.id; l.className = 'chk'; l.append(c, document.createTextNode(k.nombre)); ask.append(l);
  });
  DB.agents.forEach(a => al.append(row('🧩 ' + a.nombre + ' · ' + NAME(a.prov) + ' / ' + a.modelo, (S.cur.team || []).includes(a.id),
    on => { const t = S.cur.team || []; S.cur.team = on ? t.concat(a.id) : t.filter(i => i !== a.id); save(); },
    () => { DB.agents = DB.agents.filter(z => z !== a); saveDB(); renderAg(); })));
  if (!DB.agents.length) al.textContent = 'Sin agentes todavía. Marcá los que quieras usar en esta sesión.';
}
$('agb').onclick = () => { fillAg(); renderAg(); $('dAg').showModal(); };
$('ap').onchange = fillAg;
$('sadd').onclick = () => {
  const n = $('sn').value.trim().replace(/\s+/g, '-'), t = $('si').value.trim(); if (!n || !t) return toast('Poné nombre e instrucciones.');
  DB.skills.push({ id: uid(), nombre: n, instrucciones: t }); saveDB(); $('sn').value = $('si').value = ''; renderAg();
};
$('aadd').onclick = () => {
  const n = $('an').value.trim(), m = $('am').value.trim(); if (!n || !m) return toast('Poné nombre y modelo.');
  DB.agents.push({ id: uid(), nombre: n, prov: $('ap').value, modelo: m, instrucciones: $('ai').value.trim(), skills: [...$('ask').querySelectorAll('input:checked')].map(i => i.value) });
  saveDB(); ['an', 'am', 'ai'].forEach(i => $(i).value = ''); renderAg(); Status.probeAll(getKey);
};
$('msg').addEventListener('input', skillMenu);
$('eng').onchange = () => LS.mc_engine = $('eng').value;

// ---- Punto de entrada del botón Enviar: búsqueda, equipo o chat normal
async function go() {
  const s = S.cur;
  if (s.mode === 'search') {
    const q = $('msg').value.trim(), eng = LS.mc_engine || 'tinyfish', key = getKey(eng); if (!q || S.abort) return;
    if (!key) return toast('Falta la clave de ' + NAME(eng) + '. Abrí «Claves y apariencia».');
    toast('Buscando con ' + NAME(eng) + '…');
    try {
      const r = await searchWeb(eng, key, q); if (!r.length) return toast('La búsqueda no devolvió resultados.');
      return send({ sys: 'Respondé usando solo estas fuentes y citá el número entre corchetes.\n' + r.map((x, i) => '[' + (i + 1) + '] ' + x.titulo + ' (' + x.url + '): ' + x.resumen).join('\n'), tail: '\n\nFuentes:\n' + r.map((x, i) => '[' + (i + 1) + '] ' + x.url).join('\n') });
    } catch (e) { return toast(e.message); }
  }
  return (s.team || []).length ? runTeam() : send();
}
ctxInfo();
