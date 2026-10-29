// F1-T02: sirve public/ en localhost (contexto seguro para notificaciones). Sin claves ni proxy todavía (F3-T01).
const express = require('express'), path = require('path');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 4000;
app.listen(PORT, '127.0.0.1', () => console.log('Abrí http://localhost:' + PORT));
