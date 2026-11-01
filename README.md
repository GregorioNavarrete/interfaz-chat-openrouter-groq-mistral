# Chat multimodelo

1. `npm install` y `npm start` (Node 18 o superior), luego abrir http://localhost:3000. El chat funciona también abriendo `public/index.html`, pero el modo Búsqueda necesita el servidor (proxy local).
2. En «Claves y apariencia» pegar las claves (OpenRouter, Groq, Mistral, Gemini, Cloudflare, TinyFish, Parallel). Cloudflare lleva el token en su campo y el Account ID en el campo de abajo (también acepta `ACCOUNT_ID:TOKEN` junto); requiere `npm start`. Por defecto se borran al cerrar la pestaña.
3. Elegir modelo (botón de arriba), escribir y enviar. Cada sesión recuerda su modelo. Modos: Chat, Código y Búsqueda.
4. «🧩 Agentes y skills»: crear skills (se usan con «/nombre mensaje») y agentes con su modelo; los marcados en la sesión trabajan en paralelo y el modelo de la sesión integra sus informes.

Hecho: F1-T02, F2-T01 a T21 (versión inicial), F3-T01 a T13 (versión inicial) y voz (F3-T08).
Nuevo: sesión temporal, exportar e importar sesiones (sin claves) y prueba del streaming (`npm test`).
Pendiente: spikes F1-S01 a S08. Dependen de ellos: estado de OpenRouter (hipótesis), Gemini por compatibilidad OpenAI, cabecera de clave y formato de Parallel, delegación en JSON del agente líder (hoy el reparto es fijo), Parallel gratuito (MCP), revisión de seguridad y pruebas de borde (F3-T14 a T16).
