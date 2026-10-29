// Vocabulario único (regla de diseño base): estados, modos y proveedores.
const ESTADO = { OK: 'disponible', CAIDO: 'caido', NADA: 'desconocido' };
const PROV = {
  openrouter: { n: 'OpenRouter', url: 'https://openrouter.ai/api/v1', hint: 'sk-or-v1-…' },
  groq: { n: 'Groq', url: 'https://api.groq.com/openai/v1', hint: 'gsk_…' },
  mistral: { n: 'Mistral', url: 'https://api.mistral.ai/v1', hint: 'clave de Mistral' }
};
const CODE_SYS = 'Sos un asistente de programación. Respondé con código completo en bloques ```lenguaje y explicaciones breves.';
