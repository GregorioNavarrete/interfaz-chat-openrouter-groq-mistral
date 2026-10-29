const $ = id => document.getElementById(id), LS = localStorage;
const S = { sessions: [], cur: null, models: {}, abort: null, bubble: null };
try { S.sessions = JSON.parse(LS.mc_sessions || '[]'); } catch {}
const save = () => { try { LS.mc_sessions = JSON.stringify(S.sessions); } catch { toast('No se pudo guardar: almacenamiento lleno.'); } };
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('toasts').append(d); setTimeout(() => d.remove(), 6000); }

// ---- Claves (F2-T01): sessionStorage por defecto, localStorage solo si "recordar"
const remember = () => LS.mc_rem === '1';
const store = () => remember() ? LS : sessionStorage;
const getKey = p => (sessionStorage['k_' + p] || LS['k_' + p] || '').trim();
function setKey(p, v) { sessionStorage.removeItem('k_' + p); LS.removeItem('k_' + p); if (v.trim()) store()['k_' + p] = v.trim(); }

// ---- Tema (F2-T11)
const PRESETS = ['#fafaf8', '#eef2f7', '#f3ecf7', '#e6f0e6', '#1b1f23', '#10261f'];
function applyBg(c) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255, light = lum > 0.55;
  const s = document.documentElement.style;
  s.setProperty('--bg', c); s.setProperty('--ink', light ? '#1c1f1e' : '#eef2f1'); s.setProperty('--mut', light ? '#5f6866' : '#a9b4b1');
  s.setProperty('--pn', light ? '#ffffffcc' : '#ffffff12'); s.setProperty('--ln', light ? '#00000020' : '#ffffff2b');
  s.setProperty('--ac', light ? '#1f7a74' : '#4cc2b8'); s.setProperty('--aci', light ? '#fff' : '#04201e'); s.setProperty('--me', light ? '#1f7a7418' : '#4cc2b826');
  LS.mc_bg = c; $('bgc').value = c;
}

// ---- Sesiones (F2-T02/T12)
function newSession() {
  const last = S.sessions[0] || {};
  const s = { id: Date.now().toString(36), title: 'Nueva sesión', prov: last.prov || 'openrouter', model: last.model || 'openrouter/free', mode: 'chat', msgs: [] };
  S.sessions.unshift(s); save(); open(s.id);
}
function open(id) { S.cur = S.sessions.find(s => s.id === id) || S.sessions[0]; $('app').classList.remove('open'); renderAll(); Status.probeAll(getKey); }
function renderAll() { renderList(); renderPill(); renderChat(); [...$('mode').children].forEach(b => b.classList.toggle('on', b.dataset.m === S.cur.mode)); }
function renderList() {
  const q = $('find').value.toLowerCase(), ul = $('list'); ul.textContent = '';
  S.sessions.filter(s => s.title.toLowerCase().includes(q)).forEach(s => {
    const li = document.createElement('li'), d = document.createElement('i'), t = document.createElement('span'), x = document.createElement('button');
    d.className = 'dot ' + Status.get(s.prov, s.model).estado; t.textContent = s.title; x.textContent = '✕'; x.title = 'Borrar sesión';
    li.className = s === S.cur ? 'on' : ''; li.title = s.model;
    li.onclick = () => open(s.id);
    x.onclick = e => { e.stopPropagation(); S.sessions = S.sessions.filter(z => z !== s); if (!S.sessions.length) return newSession(); save(); open(S.cur === s ? S.sessions[0].id : S.cur.id); };
    li.append(d, t, x); ul.append(li);
  });
}
function renderPill() {
  const s = S.cur, st = Status.get(s.prov, s.model);
  $('pdot').className = 'dot ' + st.estado; $('pname').textContent = PROV[s.prov].n + ' · ' + s.model;
  $('pill').title = st.estado + (st.motivo ? ': ' + st.motivo : '');
}

// ---- Chat (F2-T13/T17) con bloques de código (modo Código)
function fill(el, text) {
  el.textContent = '';
  text.split('```').forEach((part, i) => {
    if (i % 2 === 0) return el.append(document.createTextNode(part));
    const code = part.replace(/^[^\n]*\n/, ''), pre = document.createElement('pre'), cp = document.createElement('button');
    pre.textContent = code; cp.className = 'cp'; cp.textContent = 'Copiar';
    cp.onclick = () => navigator.clipboard.writeText(code).then(() => toast('Código copiado'));
    el.append(pre, cp);
  });
}
function renderChat() {
  const c = $('chat'), s = S.cur; c.textContent = '';
  if (!s.msgs.length) {
    c.innerHTML = '<div class="hero"><h1>¿De qué charlamos hoy?</h1><p class="mut">Pegá tu clave en «Claves y apariencia», elegí un modelo arriba y escribí.</p></div>'; return;
  }
  s.msgs.forEach(m => {
    const d = document.createElement('div'); d.className = 'm ' + (m.role === 'user' ? 'u' : 'a') + (m.err ? ' e' : '');
    fill(d, m.err || m.content);
    if (m.role === 'assistant' && !m.err && m.content) { const b = document.createElement('button'); b.className = 'say'; b.textContent = '🔊 Leer'; b.onclick = () => speak(m.content); d.append(b); }
    c.append(d);
  });
  c.scrollTop = c.scrollHeight;
}
function setBusy(b) { $('send').hidden = b; $('stop').hidden = !b; }
async function send() {
  const s = S.cur, t = $('msg').value.trim(); if (!t || S.abort) return;
  const key = getKey(s.prov);
  if (!key) return toast('Falta la clave de ' + PROV[s.prov].n + '. Abrí «Claves y apariencia».');
  const hist = s.msgs.filter(m => !m.err && m.content).map(({ role, content }) => ({ role, content }));
  hist.push({ role: 'user', content: t });
  if (s.mode === 'code') hist.unshift({ role: 'system', content: CODE_SYS });
  s.msgs.push({ role: 'user', content: t }); if (s.msgs.length === 1) s.title = t.slice(0, 40);
  const a = { role: 'assistant', content: '' }; s.msgs.push(a); $('msg').value = ''; renderChat(); renderList();
  const el = $('chat').lastChild; S.abort = new AbortController(); setBusy(true);
  try {
    for await (const c of stream(s.prov, key, s.model, hist, S.abort.signal)) { a.content += c; el.textContent = a.content; $('chat').scrollTop = 1e9; }
    if (!a.content) a.err = 'El modelo devolvió una respuesta vacía.'; else Status.report(s.prov, s.model, true);
  } catch (e) {
    if (e.name !== 'AbortError') {
      a.err = e instanceof TypeError ? 'No se pudo conectar. Revisá tu conexión.' : e.message;
      if (e.status === 429 || e.status >= 500) Status.report(s.prov, s.model, false, e.message);
    }
  }
  if (!a.content && !a.err) s.msgs.pop();
  S.abort = null; setBusy(false); save(); renderChat();
  if (a.content && $('auto').checked) speak(a.content);
}

// ---- Voz (F3-T08): speechSynthesis del navegador, en trozos para textos largos
function loadVoices() {
  const v = speechSynthesis.getVoices(), es = v.filter(x => x.lang.startsWith('es')), sel = $('voice'); sel.textContent = '';
  (es.length ? es : v).forEach(x => { const o = new Option(x.name + ' (' + x.lang + ')', x.name); sel.append(o); });
  if (LS.mc_voice) sel.value = LS.mc_voice;
}
function speak(text) {
  if (!('speechSynthesis' in window)) return toast('Este navegador no tiene lectura en voz alta.');
  speechSynthesis.cancel();
  const clean = text.replace(/```[\s\S]*?```/g, ' (bloque de código) ');
  (clean.match(/[^.!?\n]+[.!?\n]*/g) || [clean]).forEach(t => {
    const u = new SpeechSynthesisUtterance(t.slice(0, 200)); u.lang = 'es-AR';
    const v = speechSynthesis.getVoices().find(x => x.name === $('voice').value); if (v) u.voice = v;
    speechSynthesis.speak(u);
  });
}

// ---- Selector de modelo y especificaciones (F2-T07/T14/T15)
let tab = 'openrouter';
async function openPicker() {
  $('tabs').textContent = '';
  Object.keys(PROV).forEach(p => { const b = document.createElement('button'); b.textContent = PROV[p].n; b.className = p === tab ? 'on' : ''; b.onclick = () => { tab = p; openPicker(); }; $('tabs').append(b); });
  if (!$('dMod').open) $('dMod').showModal();
  if (!S.models[tab]) {
    $('mcount').textContent = 'Cargando modelos…';
    try { S.models[tab] = await listModels(tab, getKey(tab)); } catch (e) { $('mlist').textContent = ''; return $('mcount').textContent = e.message + (getKey(tab) ? '' : ' Pegá la clave en «Claves y apariencia».'); }
  }
  renderModels();
}
function renderModels() {
  const q = $('mq').value.toLowerCase(), fo = $('free').checked && tab === 'openrouter', all = S.models[tab] || [];
  const list = all.filter(m => (!fo || m.free) && (m.id + m.name).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200);
  const box = $('mlist'); box.textContent = '';
  list.forEach(m => {
    const b = document.createElement('button'), d = document.createElement('i'), n = document.createElement('span'), z = document.createElement('small');
    d.className = 'dot ' + Status.get(m.p, m.id).estado; n.textContent = (m.free ? '[gratis] ' : '') + m.name; z.textContent = m.ctx ? Math.round(m.ctx / 1000) + 'K' : '';
    b.append(d, n, z); b.onclick = () => { S.cur.prov = m.p; S.cur.model = m.id; save(); $('dMod').close(); renderAll(); Status.probe(m.p, m.id, getKey(m.p)); };
    box.append(b);
  });
  $('mcount').textContent = list.length + ' de ' + all.length + ' modelos.';
}
function openSpec() {
  const s = S.cur, m = (S.models[s.prov] || []).find(x => x.id === s.model), b = $('specBody'); b.textContent = '';
  const row = (k, v) => { if (!v) return; const p = document.createElement('p'), t = document.createElement('b'); t.textContent = k + ': '; p.append(t, document.createTextNode(v)); b.append(p); };
  const st = Status.get(s.prov, s.model);
  row('Modelo', s.model); row('Proveedor', PROV[s.prov].n); row('Estado', st.estado + (st.motivo ? ' (' + st.motivo + ')' : ''));
  if (!m) row('Detalle', 'Abrí «Elegir modelo» una vez para cargar la lista de este proveedor y ver origen, contexto y precio.');
  else {
    row('Origen', m.origin); row('Contexto', m.ctx ? m.ctx.toLocaleString('es-AR') + ' tokens' : ''); row('Precio', m.free ? 'gratis (con cupo de uso)' : m.price);
    row('Entradas', m.mods.join(', ')); row('Para qué sirve', m.desc.slice(0, 500) || 'sin descripción del proveedor');
    if (m.tags.length) { const p = document.createElement('p'); m.tags.forEach(t => { const x = document.createElement('span'); x.className = 'tag'; x.textContent = t; p.append(x); }); b.append(p); }
  }
  $('dSpec').showModal();
}

// ---- Claves y avisos (F2-T09)
function buildCfg() {
  const k = $('keys'); k.textContent = '';
  Object.keys(PROV).forEach(p => {
    const w = document.createElement('div'), l = document.createElement('label'), r = document.createElement('div'), i = document.createElement('input'), t = document.createElement('button');
    w.className = 'k'; r.className = 'r'; l.textContent = 'Clave de ' + PROV[p].n; i.type = 'password'; i.placeholder = PROV[p].hint; i.autocomplete = 'off'; i.value = getKey(p);
    i.oninput = () => setKey(p, i.value);
    t.textContent = 'Probar'; t.onclick = async () => { try { S.models[p] = await listModels(p, getKey(p)); toast(PROV[p].n + ': clave correcta, ' + S.models[p].length + ' modelos.'); Status.probeAll(getKey); } catch (e) { toast(PROV[p].n + ': ' + e.message); } };
    r.append(i, t); w.append(l, r); k.append(w);
  });
  $('rem').checked = remember();
}
Status.models = () => [...new Set(S.sessions.map(s => s.prov + '\n' + s.model))].map(x => x.split('\n'));
Status.onChange = (p, m, estado, motivo) => {
  if (p) {
    const txt = estado === ESTADO.CAIDO ? '🔴 ' + m + ' dejó de responder' + (motivo ? ' (' + motivo + ')' : '') : '🟢 ' + m + ' volvió a funcionar';
    toast(txt); if ('Notification' in window && Notification.permission === 'granted') new Notification('Multichat', { body: txt });
  }
  if (S.cur) { renderList(); renderPill(); }
};

// ---- Eventos
$('new').onclick = newSession; $('send').onclick = send; $('stop').onclick = () => S.abort && S.abort.abort();
$('msg').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
$('find').oninput = renderList; $('pill').onclick = openPicker; $('spec').onclick = openSpec; $('mq').oninput = renderModels; $('free').onchange = renderModels;
$('burger').onclick = () => $('app').classList.toggle('open');
$('cfg').onclick = () => { buildCfg(); $('dCfg').showModal(); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('mode').onclick = e => { const m = e.target.dataset.m; if (!m) return; S.cur.mode = m; save(); renderAll(); };
$('rem').onchange = () => { const ks = Object.keys(PROV).map(p => [p, getKey(p)]); LS.mc_rem = $('rem').checked ? '1' : '0'; ks.forEach(([p, v]) => setKey(p, v)); };
$('wipe').onclick = () => { if (confirm('¿Borrar todas las claves y sesiones de este equipo?')) { LS.clear(); sessionStorage.clear(); location.reload(); } };
$('perm').onclick = () => 'Notification' in window ? Notification.requestPermission().then(r => toast('Notificaciones: ' + r)) : toast('Este navegador no soporta notificaciones.');
$('auto').checked = LS.mc_auto === '1'; $('auto').onchange = () => LS.mc_auto = $('auto').checked ? '1' : '0';
$('voice').onchange = () => { LS.mc_voice = $('voice').value; speak('Hola, esta es la voz elegida.'); };
$('bgc').oninput = () => applyBg($('bgc').value);
PRESETS.forEach(c => { const b = document.createElement('button'); b.style.background = c; b.title = c; b.setAttribute('aria-label', 'Fondo ' + c); b.onclick = () => applyBg(c); $('sw').append(b); });
if ('speechSynthesis' in window) { speechSynthesis.onvoiceschanged = loadVoices; loadVoices(); }
applyBg(LS.mc_bg || PRESETS[0]);
if (!S.sessions.length) newSession(); else open(S.sessions[0].id);
Status.start(getKey);
