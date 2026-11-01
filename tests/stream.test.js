// F2-T05: servidor SSE falso con líneas cortadas a mitad, keepalive y [DONE]. Uso: npm test
const test = require('node:test'), assert = require('node:assert'), http = require('http'), fs = require('fs'), path = require('path');
const src = ['vocab', 'providers'].map(f => fs.readFileSync(path.join(__dirname, '../public/js', f + '.js'), 'utf8')).join('\n');
const { stream, PROV } = new Function(src + ';return {stream,PROV}')();
test('el streaming no pierde fragmentos aunque lleguen cortados', async () => {
  const ev = t => 'data: ' + JSON.stringify({ choices: [{ delta: { content: t } }] }) + '\n\n';
  const srv = http.createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const all = ': keepalive\n\n' + ev('Hola ') + ev('mundo') + 'data: [DONE]\n\n', cut = 30;
    r.write(all.slice(0, cut)); setTimeout(() => { r.write(all.slice(cut, cut + 25)); setTimeout(() => r.end(all.slice(cut + 25)), 20); }, 20);
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  PROV.openrouter.url = 'http://127.0.0.1:' + srv.address().port;
  let out = ''; for await (const c of stream('openrouter', 'k', 'm', [], new AbortController().signal)) out += c;
  srv.close(); assert.strictEqual(out, 'Hola mundo');
});
