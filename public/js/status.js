// F2-T08/T09: punto verde/rojo/gris sin mandar mensajes. Histéresis de 2 lecturas, pausa con pestaña oculta, avisos.
// Hipótesis a confirmar con el spike F1-S01: OpenRouter expone estado y uptime por endpoint (requiere clave).
const Status = {
  map: {}, models: () => [], onChange: () => {},
  k: (p, m) => p + '/' + m,
  get(p, m) { return this.map[this.k(p, m)] || { estado: ESTADO.NADA }; },
  set(p, m, estado, motivo, force) {
    const k = this.k(p, m), s = this.map[k] || (this.map[k] = { estado: ESTADO.NADA, n: 0 });
    s.motivo = motivo || '';
    if (estado === ESTADO.NADA || estado === s.estado) { s.n = 0; return this.onChange(); }
    if (s.estado === ESTADO.NADA) { s.estado = estado; return this.onChange(); } // primera lectura: sin aviso
    if (force || ++s.n >= 2) { s.estado = estado; s.n = 0; this.onChange(p, m, estado, motivo); }
  },
  report(p, m, ok, motivo) { this.set(p, m, ok ? ESTADO.OK : ESTADO.CAIDO, motivo, !ok); },
  async probe(p, m, key) {
    if (!key) return;
    try {
      if (p === 'openrouter') {
        const r = await fetch(PROV.openrouter.url + '/models/' + m + '/endpoints', { headers: { Authorization: 'Bearer ' + key } });
        if (r.status === 404) return this.set(p, m, ESTADO.CAIDO, 'el modelo ya no existe');
        if (!r.ok) return this.set(p, m, ESTADO.NADA, 'HTTP ' + r.status);
        const eps = ((await r.json()).data || {}).endpoints || [];
        const ok = eps.some(e => (e.status == null || e.status >= 0) && (e.uptime_last_5m == null || e.uptime_last_5m >= 80));
        return this.set(p, m, ok ? ESTADO.OK : ESTADO.CAIDO, ok ? '' : 'sin proveedores sanos');
      }
      const r = await fetch(PROV[p].url + '/models', { headers: { Authorization: 'Bearer ' + key } });
      if (!r.ok) return this.set(p, m, ESTADO.CAIDO, r.status === 401 ? 'clave inválida' : 'servicio con error ' + r.status);
      const ids = (await r.json()).data.map(x => x.id);
      this.set(p, m, ids.includes(m) ? ESTADO.OK : ESTADO.CAIDO, ids.includes(m) ? '' : 'ya no figura en la lista');
    } catch { this.set(p, m, ESTADO.NADA, 'sin conexión'); }
  },
  probeAll(getKey) { this.models().forEach(([p, m]) => this.probe(p, m, getKey(p))); },
  start(getKey) {
    this.probeAll(getKey);
    setInterval(() => { if (!document.hidden) this.probeAll(getKey); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.probeAll(getKey); });
  }
};
