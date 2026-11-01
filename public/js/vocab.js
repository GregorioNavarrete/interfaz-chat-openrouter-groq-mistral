// Vocabulario único (regla de diseño base): estados, modos y proveedores.
const ESTADO = { OK: 'disponible', CAIDO: 'caido', NADA: 'desconocido' };
const PROV = {
  openrouter: { n: 'OpenRouter', url: 'https://openrouter.ai/api/v1', hint: 'sk-or-v1-…' },
  groq: { n: 'Groq', url: 'https://api.groq.com/openai/v1', hint: 'gsk_…' },
  mistral: { n: 'Mistral', url: 'https://api.mistral.ai/v1', hint: 'clave de Mistral' },
  cloudflare: { n: 'Cloudflare', url: '/proxy/cloudflare', hint: 'API token de Cloudflare con permiso Workers AI (el Account ID va en el campo de abajo)' },
  gemini: { n: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', hint: 'AIza… (vía compatibilidad OpenAI, a confirmar en F1-S03)' }
};
const CODE_SYS = 'Sos un asistente de programación. Respondé con código completo en bloques ```lenguaje y explicaciones breves.';
