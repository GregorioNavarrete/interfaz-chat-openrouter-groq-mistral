// F1-T02 + F3-T01: sirve public/ y un proxy mínimo para búsqueda (hosts fijos, la clave viaja en x-key y no se guarda ni se registra).
const express = require('express'), path = require('path');
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
async function forward(res, url, opt) {
  try { const r = await fetch(url, opt); res.status(r.status).type('json').send(await r.text()); }
  catch { res.status(502).json({ error: 'No se pudo contactar el servicio de búsqueda.' }); }
}
const need = (req, res) => { const k = req.get('x-key'); if (!k) res.status(400).json({ error: 'Falta la clave.' }); return k; };
app.get('/proxy/tinyfish', (req, res) => { // GET api.search.tinyfish.ai?query=… con X-API-Key
  const k = need(req, res); if (k) forward(res, 'https://api.search.tinyfish.ai/?query=' + encodeURIComponent(String(req.query.query || '')), { headers: { 'X-API-Key': k } });
});
app.post('/proxy/parallel', (req, res) => { // POST api.parallel.ai/v1/search (cabecera de clave a confirmar en el spike F1-S05)
  const k = need(req, res); if (k) forward(res, 'https://api.parallel.ai/v1/search', { method: 'POST', headers: { 'x-api-key': k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
});
// Cloudflare Workers AI (adaptado de tu server.js): la clave llega en x-key como «ACCOUNT_ID:TOKEN», o solo el token si CLOUDFLARE_ACCOUNT_ID está en el entorno.
const { Readable } = require('stream');
function cfAuth(req, res) {
  const raw = need(req, res); if (!raw) return null;
  const i = raw.indexOf(':'), acc = i > 0 ? raw.slice(0, i) : process.env.CLOUDFLARE_ACCOUNT_ID, token = i > 0 ? raw.slice(i + 1) : raw;
  if (!acc || !/^[\w-]{8,64}$/.test(acc)) { res.status(400).json({ error: 'Falta el Account ID de Cloudflare: completá el campo «Account ID de Cloudflare» en Claves y apariencia.' }); return null; }
  return { acc, token };
}
app.get('/proxy/cloudflare/models', (req, res) => {
  const a = cfAuth(req, res); if (a) forward(res, 'https://api.cloudflare.com/client/v4/accounts/' + a.acc + '/ai/models/search?task=Text%20Generation&per_page=100', { headers: { Authorization: 'Bearer ' + a.token } });
});
app.post('/proxy/cloudflare/run', async (req, res) => {
  const a = cfAuth(req, res); if (!a) return;
  const { model, messages } = req.body || {};
  if (!/^@(cf|hf)\/[\w.\-\/]+$/.test(String(model))) return res.status(400).json({ error: 'Modelo inválido.' });
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'Faltan los mensajes.' });
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25000); // como en tu código: 25 s hasta recibir respuesta
  res.on('close', () => ctl.abort()); // el usuario tocó «Detener»
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + a.acc + '/ai/run/' + model, { method: 'POST', signal: ctl.signal,
      headers: { Authorization: 'Bearer ' + a.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.map(m => ({ role: String(m.role), content: String(m.content == null ? '' : m.content) })), stream: true }) });
    clearTimeout(timer);
    res.status(r.status).type(r.headers.get('content-type') || 'application/json');
    const rs = Readable.fromWeb(r.body); rs.on('error', () => res.end()); rs.pipe(res);
  } catch { clearTimeout(timer); if (!res.headersSent) res.status(502).json({ error: 'No se pudo contactar Cloudflare, o tardó más de 25 s.' }); else res.end(); }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => console.log('Abrí http://localhost:' + PORT));
