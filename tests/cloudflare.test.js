// Cloudflare: el adaptador entiende SSE ({response}), JSON completo y errores, con fetch simulado.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const src = ['vocab', 'providers'].map(f => fs.readFileSync(path.join(__dirname, '../public/js', f + '.js'), 'utf8')).join('\n');
globalThis.location = { protocol: 'http:' };
const { stream, listModels, PROV } = new Function(src + ';return {stream,listModels,PROV}')();
const sse = t => 'data: ' + JSON.stringify({ response: t }) + '\n\n';
const mock = (body, status = 200, type = 'text/event-stream') => { globalThis.fetch = async () => new Response(body, { status, headers: { 'content-type': type } }); };
async function all(it) { let o = ''; for await (const c of it) o += c; return o; }
test('streaming SSE de Cloudflare', async () => {
  mock(sse('Hola ') + ': ping\n\n' + sse('mundo') + 'data: [DONE]\n\n');
  assert.strictEqual(await all(stream('cloudflare', 'acc:tok', '@cf/meta/llama-3.1-8b-instruct', [], new AbortController().signal)), 'Hola mundo');
});
test('respuesta JSON completa', async () => {
  mock(JSON.stringify({ success: true, result: { response: 'Listo' } }), 200, 'application/json');
  assert.strictEqual(await all(stream('cloudflare', 'acc:tok', '@cf/x/y', [], new AbortController().signal)), 'Listo');
});
test('401 da mensaje claro y la lista cae a modelos base', async () => {
  mock(JSON.stringify({ errors: [{ message: 'Authentication error' }] }), 401, 'application/json');
  await assert.rejects(all(stream('cloudflare', 'k', '@cf/x/y', [], new AbortController().signal)), /clave/i);
  mock(JSON.stringify({ result: [] }), 200, 'application/json');
  assert.ok((await listModels('cloudflare', 'acc:tok')).some(m => m.id === '@cf/meta/llama-3.1-8b-instruct'));
  assert.ok(PROV.cloudflare);
});

test('el Account ID en su propio campo se une al token', async () => {
  globalThis.getKey = p => ({ cfid: 'abc12345', cloudflare: 'tok' })[p] || '';
  let h; globalThis.fetch = async (u, o) => { h = o.headers['x-key']; return new Response(JSON.stringify({ result: [] }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const f = new Function(src + ';return {listModels}')(); await f.listModels('cloudflare', 'tok');
  assert.strictEqual(h, 'abc12345:tok'); delete globalThis.getKey;
});
